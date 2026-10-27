import React, { useEffect, useRef, useState } from "react";
import { Game } from "../game/Game";
import { IMatchStorage } from "../game/MatchStorage";
import { IPlayerInfo, PlayerInfo } from "../game/PlayerInfo";
import { ConnectionProvider } from "../hooks/useConnection";
import { GameProvider } from "../hooks/useGame";
import { PlayerProvider } from "../hooks/usePlayer";
import { MatchViewer } from "./MatchViewer";
import { Match, SeatAiPlayersOptions } from "../game/Match";
import { Connection } from "../game/Connection";
import { LocalConnectionTransport } from "../game/ConnectionTransport";
import { LoadingStateProvider, LoadingStates, LoadingStatesCallback } from "../hooks/useLoadingStates";

/**
 * Runs the match in this browser tab (client-trust mode) and shows it to `playerId`.
 *
 * AI seats: pass `seatAi` to have the match play every seat whose `IPlayerInfo.ai` is set (see
 * `Match.seatAiPlayers`).  In client-trust mode every participant's tab runs its own copy of the
 * match, so the host must make sure only one tab drives the bots: pass `aiEnabled={false}` on
 * every other tab (it can change at runtime, e.g. when the driving player leaves).
 */
export function ClientTrustMatchViewer({
  playerId,
  players,
  game,
  matchStorage,
  onBack,
  onLoadProgress,
  options = {},
  seatAi = false,
  aiEnabled = true,
}: {
  playerId: string;
  players: IPlayerInfo[];
  game: Game<any, any>;
  matchStorage: IMatchStorage;
  onBack?: () => void;
  onLoadProgress?: LoadingStatesCallback;
  options?: any;
  /** Seat engine AIs in the flagged seats; an object sets their options (think time, logging…) */
  seatAi?: boolean | SeatAiPlayersOptions;
  /** Whether this tab's bots answer prompts. Default true */
  aiEnabled?: boolean;
}) {
  const [loadingStates] = useState<LoadingStates>(new LoadingStates());
  const [match, setMatch] = useState<Match<any, any> | undefined>();
  const [localConnection, setLocalConnection] = useState<Connection | undefined>();
  // Read at match creation only: changing how bots are seated should not rebuild the match
  const seatAiRef = useRef(seatAi);
  seatAiRef.current = seatAi;
  const aiEnabledRef = useRef(aiEnabled);
  aiEnabledRef.current = aiEnabled;

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
        options,
      );
      let cancelled = false;
      match.load().then(() => {
        if (cancelled) {
          return;
        }
        const seat = seatAiRef.current;
        if (seat) {
          match.ai.enabled = aiEnabledRef.current;
          match.seatAiPlayers(typeof seat === "object" ? seat : {});
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
  }, [game, matchStorage, players, options]);

  useEffect(() => {
    if (match) {
      match.ai.enabled = aiEnabled;
    }
  }, [match, aiEnabled]);

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
