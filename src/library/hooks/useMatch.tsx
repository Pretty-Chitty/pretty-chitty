import React, { useContext, createContext, ReactNode } from "react";
import { Match } from "../game/Match";

const MatchContext = createContext<Match<any, any> | undefined>(undefined);

export function useMatch(): Match<any, any> {
  const result = useContext(MatchContext);
  if (!result) {
    throw new Error("Match is required");
  }
  return result;
}

export function MatchProvider({ match, children }: { match: Match<any, any>; children: ReactNode }) {
  return <MatchContext.Provider value={match}>{children}</MatchContext.Provider>;
}
