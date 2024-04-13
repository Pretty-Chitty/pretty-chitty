import React, { useContext, createContext, ReactNode, useEffect, useState } from "react";
import { ClockDetails } from "../game/ClockDetails";
import { Chit } from "../game/Chit";
import { useConnection } from "./useConnection";
import { ClientTime } from "../game/clientTransport/ClientTime";
import { ClientTimeState } from "../game/ClientTimeState";
import { ClientPrompts } from "../game/clientTransport/ClientPrompts";
import { usePlayerId } from "./usePlayer";
import { useMatch } from "./useMatch";
import { ClientStatus } from "../game/clientTransport/ClientStatus";

export class TimeState {
  public targetClock: number = 1;
  public currentClock: ClockDetails = { clock: 0, pass: -1 };
  public maxClock: ClockDetails = { clock: 0, pass: -1 };
  public rootChit: Chit = new Chit();
}

const TimeControllerContext = createContext<{
  clientPrompts?: ClientPrompts<any, any>;
  clientTimeState: ClientTimeState;
  clientTime?: ClientTime;
  clientStatus?: ClientStatus<any, any>;
}>({ clientTimeState: new ClientTimeState() });

export function useTimeController() {
  const result = useContext(TimeControllerContext);
  if (!result.clientTime) {
    throw new Error("Connection is required");
  }
  return result.clientTime;
}

export function useTimeState() {
  const result = useContext(TimeControllerContext);
  return result.clientTimeState;
}
export function useClientPrompts() {
  const result = useContext(TimeControllerContext);
  if (!result.clientPrompts) {
    throw new Error("Connection is required");
  }
  return result.clientPrompts;
}
export function useClientStatus() {
  const result = useContext(TimeControllerContext);
  if (!result.clientStatus) {
    throw new Error("Connection is required");
  }
  return result.clientStatus;
}

export function TimeControllerProvider({ children }: { children: ReactNode }) {
  const connection = useConnection();
  const playerId = usePlayerId();
  const match = useMatch();
  const [clientTimeState] = useState<ClientTimeState>(new ClientTimeState());
  const [clientTime, setClientTime] = useState<ClientTime | null>(null);
  const [clientPrompts, setClientPrompts] = useState<ClientPrompts<any, any> | undefined>(undefined);
  const [clientStatus, setClientStatus] = useState<ClientStatus<any, any> | undefined>(undefined);

  useEffect(() => {
    if (!connection) {
      return;
    }

    if (!clientTime || clientTime.connection !== connection) {
      clientTime?.dispose();

      const newClientTime = new ClientTime(connection, match, clientTimeState);
      connection.register(newClientTime);

      const cp = new ClientPrompts(playerId, connection, newClientTime);
      connection.register(cp);

      const cs = new ClientStatus(connection);
      connection.register(cs);

      if (clientTime) {
        newClientTime.maxClock.value = clientTime.maxClock.value;
      }

      clientTimeState.animationSpeedMultiplier.value = 0.001;

      setClientTime(newClientTime);
      setClientPrompts(cp);
      setClientStatus(cs);
    }
  }, [connection, clientTime, match, clientTimeState, playerId]);

  if (!clientTime) {
    return null;
  }
  return (
    <TimeControllerContext.Provider value={{ clientPrompts, clientTime, clientTimeState, clientStatus }}>
      {children}
    </TimeControllerContext.Provider>
  );
}
