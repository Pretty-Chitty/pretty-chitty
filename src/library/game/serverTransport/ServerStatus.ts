import { Connection } from '../Connection';
import { ConnectionObject } from '../ConnectionObject';
import { Match } from '../Match';
import { PlayerChit } from '../PlayerChit';
import { RootChit } from '../RootChit';
import { ClientStatus } from '../clientTransport/ClientStatus';

export class ServerStatus<P extends PlayerChit, R extends RootChit<P>> extends ConnectionObject {
  private clientStatus: ClientStatus<P, R>;

  constructor(
    private match: Match<P, R>,
    private connection: Connection,
  ) {
    super();

    this.clientStatus = this.connection.get<ClientStatus<P, R>>('ClientStatus');

    this.register(
      this.match.errorState.on((errorMessage) => {
        this.clientStatus.setErrorMessage(errorMessage).catch(console.error); // eat it?
      }),
    );

    this.register(
      this.match.result.on((result) => {
        this.clientStatus.setMatchResult(result?.winners?.map((winner) => winner.id ?? '')).catch(console.error); // eat it?
      }),
    );
  }
}
