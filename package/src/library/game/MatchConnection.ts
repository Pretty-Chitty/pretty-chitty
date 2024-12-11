interface MatchConnectionTransport {}

export class MatchConnection {
  constructor(private transport: MatchConnectionTransport) {}
}
