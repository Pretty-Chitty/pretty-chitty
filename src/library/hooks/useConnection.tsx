import React, { useContext, createContext, ReactNode } from "react";
import { Connection } from "../game/Connection";

const ConnectionContext = createContext<Connection | undefined>(undefined);

export function useConnection(): Connection {
  const result = useContext(ConnectionContext);
  if (!result) {
    throw new Error("Connection is required");
  }
  return result;
}

export function ConnectionProvider({ connection, children }: { connection: Connection; children: ReactNode }) {
  return <ConnectionContext.Provider value={connection}>{children}</ConnectionContext.Provider>;
}
