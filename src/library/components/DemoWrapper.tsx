import React, { useEffect, useState } from "react";

import { Chit } from "../game/Chit";
import { MatchViewer } from "./MatchViewer";
import { Game } from "../game/Game";
import { GameProvider } from "../hooks/useGame";
import { ConnectionProvider } from "../hooks/useConnection";
import { Connection } from "../game/Connection";
import { LocalConnectionTransport } from "../game/ConnectionTransport";
import { Match } from "../game/Match";
import { PlayerInfo } from "../game/PlayerInfo";
import { EphemeralMatchStorage } from "../game/MatchStorage";
import { PlayerProvider } from "../hooks/usePlayer";
import { LoadingStateProvider, LoadingStates } from "../hooks/useLoadingStates";
import { BadAIClientPrompts } from "../game/badAiTransport/BadAIClientPrompts";
import { RootChit } from "../game/RootChit";

export interface IChitLibrary {
  [key: string]: new () => Chit;
}

function PlayerEditor({ playerId, match, showBack }: { showBack?: boolean; playerId: string; match: Match<any, any> }) {
  const [localConnection, setLocalConnection] = useState<Connection | undefined>();
  const [, setRemoteConnection] = useState<LocalConnectionTransport>(new LocalConnectionTransport());

  useEffect(() => {
    const newRemoteConnection = new LocalConnectionTransport();
    const newConnection = new Connection(new LocalConnectionTransport());
    (newConnection.transport as LocalConnectionTransport).connect(newRemoteConnection);
    match.connect(newRemoteConnection, playerId);

    match.players.forEach((p) => {
      if (p.id !== playerId) {
        const opponentRemoteConnection = new LocalConnectionTransport();
        const opponentConnection = new Connection(new LocalConnectionTransport());
        opponentConnection.register(new BadAIClientPrompts<any, any>(p.id, opponentConnection, match), "ClientPrompts");
        (opponentConnection.transport as LocalConnectionTransport).connect(opponentRemoteConnection);
        match.connect(opponentRemoteConnection, p.id);
      }
    });

    setLocalConnection(newConnection);
    setRemoteConnection(newRemoteConnection);
    return () => {
      newConnection.dispose();
    };
  }, [match, playerId]);

  if (!localConnection) {
    return null;
  }

  return (
    <ConnectionProvider connection={localConnection}>
      <PlayerProvider playerId={playerId}>
        <MatchViewer
          onBack={
            showBack
              ? () => {
                  window.history.back();
                }
              : undefined
          }
        />
      </PlayerProvider>
    </ConnectionProvider>
  );
}

function Editor({ game }: { game: Game<any, any> }) {
  const [match, setMatch] = useState<Match<any, any> | null>(null);

  useEffect(() => {
    const storage = new EphemeralMatchStorage("demogame");

    const tempRoot = new game.chitLibrary.Root() as RootChit<any>;
    const playerCount = tempRoot.setupDemoGame();
    const configOptions = tempRoot.getCurrentlySelectedMatchOptions();

    const players = [];
    for (let i = 0; i < playerCount; i++) {
      players.push(new PlayerInfo(`p${i}`, i === 0 ? "Human" : `Robot ${i}`));
    }
    const match = new Match(game, players, storage, configOptions);
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
  }, [game]);

  if (!match) {
    return null;
  }

  return (
    <GameProvider game={game}>
      <PlayerEditor playerId={"p0"} match={match} showBack />
    </GameProvider>
  );
}

export function DemoWrapper({ game }: { game: Game<any, any> }) {
  const [loadingStates] = useState<LoadingStates>(new LoadingStates());
  return (
    <LoadingStateProvider loadingStates={loadingStates}>
      <Editor game={game} />
    </LoadingStateProvider>
  );
}
