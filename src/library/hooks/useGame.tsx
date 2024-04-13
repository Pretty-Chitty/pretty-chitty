import React, { useContext, createContext, ReactNode } from "react";
import { Game } from "../game/Game";

const GameContext = createContext<Game<any, any> | undefined>(undefined);

export function useGame(): Game<any, any> {
  const result = useContext(GameContext);
  if (!result) {
    throw new Error("Game is required");
  }
  return result;
}

export function GameProvider({ game, children }: { game: Game<any, any>; children: ReactNode }) {
  return <GameContext.Provider value={game}>{children}</GameContext.Provider>;
}
