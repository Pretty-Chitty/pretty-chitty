import { EventChannel } from "../../utilities/EventChannel";
import { Connection } from "../Connection";
import { ConnectionObject } from "../ConnectionObject";
import { PlayerChit } from "../PlayerChit";
import { RootChit } from "../RootChit";
import { ServerStatus } from "../serverTransport/ServerStatus";

type ClientGameResult = {
  winnerIds: string[];
};

export class ClientStatus<P extends PlayerChit, R extends RootChit<P>> extends ConnectionObject {
  public errorMessage = new EventChannel<string | undefined>(undefined);
  public matchResult = new EventChannel<ClientGameResult | undefined>(undefined);
  private serverStatus: ServerStatus<P, R>;

  constructor(private connection: Connection) {
    super();

    this.serverStatus = connection.get<ServerStatus<P, R>>("ServerStatus");
  }

  async setErrorMessage(error: string | undefined) {
    this.errorMessage.value = error;
  }

  async setMatchResult(winnerIds?: string[]) {
    if (winnerIds) {
      this.matchResult.value = {
        winnerIds: winnerIds,
      };
    } else {
      this.matchResult.value = undefined;
    }
  }
}
