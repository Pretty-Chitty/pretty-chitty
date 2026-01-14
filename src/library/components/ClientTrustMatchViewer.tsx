import React, { useEffect, useState } from "react";
import { Game } from "../game/Game";
import { IMatchStorage } from "../game/MatchStorage";
import { IPlayerInfo, PlayerInfo } from "../game/PlayerInfo";
import { ConnectionProvider } from "../hooks/useConnection";
import { GameProvider } from "../hooks/useGame";
import { PlayerProvider } from "../hooks/usePlayer";
import { MatchViewer } from "./MatchViewer";
import { Match } from "../game/Match";
import { Connection } from "../game/Connection";
import { LocalConnectionTransport } from "../game/ConnectionTransport";
import { LoadingStateProvider, LoadingStates, LoadingStatesCallback } from "../hooks/useLoadingStates";

export function ClientTrustMatchViewer({
  playerId,
  players,
  game,
  matchStorage,
  onBack,
  onLoadProgress,
}: {
  playerId: string;
  players: IPlayerInfo[];
  game: Game<any, any>;
  matchStorage: IMatchStorage;
  onBack?: () => void;
  onLoadProgress?: LoadingStatesCallback;
}) {
  const [loadingStates] = useState<LoadingStates>(new LoadingStates());
  const [match, setMatch] = useState<Match<any, any> | undefined>();
  const [localConnection, setLocalConnection] = useState<Connection | undefined>();

  useEffect(() => {
    if (onLoadProgress) {
      return loadingStates.onChange(onLoadProgress);
    }
  }, [loadingStates, onLoadProgress]);

  useEffect(() => {
    if (game && players && matchStorage) {
      const match = new Match(
        game,
        players.map((p) => new PlayerInfo(p)),
        matchStorage,
      );
      let cancelled = false;
      match.load().then(() => {
        if (cancelled) {
          return;
        }
        match.start();
        setMatch(match);
      });
      return () => {
        match.dispose();
        cancelled = true;
      };
    } else {
      setMatch(undefined);
    }
  }, [game, matchStorage, players]);

  useEffect(() => {
    if (!match) {
      setLocalConnection(undefined);
      return;
    }

    const newRemoteConnection = new LocalConnectionTransport();
    const newConnection = new Connection(new LocalConnectionTransport());
    (newConnection.transport as LocalConnectionTransport).connect(newRemoteConnection);
    match.connect(newRemoteConnection, playerId);

    setLocalConnection(newConnection);
    return () => {
      newConnection.dispose();
    };
  }, [match, playerId]);

  if (!localConnection) {
    return null; // loading...
  }

  return (
    <LoadingStateProvider loadingStates={loadingStates}>
      <GameProvider game={game}>
        <ConnectionProvider connection={localConnection}>
          <PlayerProvider playerId={playerId}>
            <MatchViewer onBack={onBack} />
          </PlayerProvider>
        </ConnectionProvider>
      </GameProvider>
    </LoadingStateProvider>
  );
}
