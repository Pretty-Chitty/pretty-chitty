import React, { useEffect, useState } from "react";
import { Game } from "../game/Game";
import { ConnectionProvider } from "../hooks/useConnection";
import { GameProvider } from "../hooks/useGame";
import { PlayerProvider } from "../hooks/usePlayer";
import { MatchViewer } from "./MatchViewer";
import { Connection } from "../game/Connection";
import { ConnectionTransport } from "../game/ConnectionTransport";
import { LoadingStateProvider, LoadingStates, LoadingStatesCallback } from "../hooks/useLoadingStates";

export function ServerTrustMatchViewer({
  playerId,
  game,
  transport,
  onBack,
  onLoadProgress,
}: {
  playerId: string;
  game: Game<any, any>;
  transport: ConnectionTransport;
  onBack?: () => void;
  onLoadProgress?: LoadingStatesCallback;
}) {
  const [loadingStates] = useState<LoadingStates>(new LoadingStates());
  const [localConnection, setLocalConnection] = useState<Connection | undefined>();

  useEffect(() => {
    const newConnection = new Connection(transport);
    setLocalConnection(newConnection);
  }, [transport]);

  useEffect(() => {
    if (onLoadProgress) {
      return loadingStates.onChange(onLoadProgress);
    }
  }, [loadingStates, onLoadProgress]);

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
