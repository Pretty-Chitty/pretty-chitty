import { EventChannel } from "../../utilities/EventChannel";
import { Connection } from "../Connection";
import { ConnectionObject } from "../ConnectionObject";
import { Match } from "../Match";
import { PlayerChit } from "../PlayerChit";
import { PlayerInfo } from "../PlayerInfo";
import { RootChit } from "../RootChit";
import { ServerStatus } from "../serverTransport/ServerStatus";

type ClientGameResult = {
  winners: PlayerInfo[];
};

export class ClientStatus<P extends PlayerChit, R extends RootChit<P>> extends ConnectionObject {
  public errorMessage = new EventChannel<string | undefined>(undefined);
  public matchResult = new EventChannel<ClientGameResult | undefined>(undefined);
  private serverStatus: ServerStatus<P, R>;

  constructor(
    private match: Match<P, R>,
    private connection: Connection,
  ) {
    super();

    this.serverStatus = connection.get<ServerStatus<P, R>>("ServerStatus");
  }

  async setErrorMessage(error: string | undefined) {
    this.errorMessage.value = error;
  }

  async setMatchResult(winnerIds?: string[]) {
    if (winnerIds) {
      const winners = winnerIds.map((id) => this.match.players.find((p) => p.id === id)) as PlayerInfo[];

      // ensure no mismatch
      if (winners.find((d) => !d)) {
        throw new Error("Winner id provided that was not in list");
      }

      this.matchResult.value = {
        winners,
      };
    } else {
      this.matchResult.value = undefined;
    }
  }
}
