import { ClockDetails } from "../ClockDetails";
import { Connection } from "../Connection";
import { ConnectionObject } from "../ConnectionObject";
import { Match } from "../Match";
import { PlayerChit } from "../PlayerChit";
import { RootChit } from "../RootChit";
import { ClientTime } from "../clientTransport/ClientTime";

export class ServerTime<P extends PlayerChit, R extends RootChit<P>> extends ConnectionObject {
  private clientTime: ClientTime;
  private hasSentLastActionTime = false;
  constructor(
    private match: Match<P, R>,
    private playerId: string,
    private connection: Connection,
  ) {
    super();

    this.clientTime = connection.get<ClientTime>("ClientTime");
    this.register(
      match.onChange(() => {
        if (match.turn.value) {
          this.clientTime.newMaxClock(match.turn.value.clockDetails);
        }

        if (!this.hasSentLastActionTime) {
          this.hasSentLastActionTime = true;

          const player = match.turn.value?.rootChit.players.find((p) => p.id === playerId);
          if (player) {
            this.clientTime.setStartTime(player.promptStatus.latestPromptResponseTime);
          }
        }
      }),
    );
  }
  async serializeDelta(from: ClockDetails, to: number) {
    if (this.match.turn.value) {
      return this.match.turn.value.serialize(to, from);
    }
    throw new Error("No match or match hasn't started");
  }
}
