import React, { useContext, createContext, ReactNode } from 'react';

const PlayerContext = createContext<string | undefined>(undefined);

export function usePlayerId(): string {
  const result = useContext(PlayerContext);
  if (!result) {
    throw new Error('Player is required');
  }
  return result;
}

export function PlayerProvider({ playerId, children }: { playerId: string; children: ReactNode }) {
  return <PlayerContext.Provider value={playerId}>{children}</PlayerContext.Provider>;
}
