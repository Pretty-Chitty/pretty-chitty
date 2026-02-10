import { Connection } from "../Connection";
import { ConnectionObject } from "../ConnectionObject";
import { Match } from "../Match";
import { PlayerChit } from "../PlayerChit";
import { RootChit } from "../RootChit";
import { ClientTime } from "../clientTransport/ClientTime";
import { Chit } from "../Chit";

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
          this.clientTime.newMaxClock(match.turn.value.clockDetails(this.playerId));
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

  private stateCounter = 0;
  private stateLookups: { [chitState: string]: number } = {};
  async serializeDelta(to: number) {
    if (this.match.turn.value) {
      const result = this.match.turn.value.serialize(this.playerId, to);

      const newStates: { [stateId: number]: string } = {};
      const chitIdToStateCounter: { [chitId: string]: number } = {};
      Object.entries(result.chits).forEach(([key, value]: [string, string]) => {
        let state = this.stateLookups[value];
        if (state === undefined) {
          state = this.stateLookups[value] = ++this.stateCounter;
          newStates[this.stateCounter] = Chit.fixVisibility(value, this.playerId);
        }
        chitIdToStateCounter[key] = state;
      });

      return {
        clockDetails: result.clockDetails,
        newStates,
        chits: chitIdToStateCounter,
        log: result.log,
      };
    }
    throw new Error("No match or match hasn't started");
  }

  async chitHistory(ids: string[]) {
    return this.match.turn.value!.chitsHistory(this.playerId, ids);
  }

  async gameLog() {
    if (this.match.turn.value) {
      return this.match.turn.value.gameLog(this.playerId);
    }
  }
}
