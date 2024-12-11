export class ConnectionObject {
  private cbsToCallWhenDisposing: (() => void)[] = [];
  protected register(cb: () => void) {
    this.cbsToCallWhenDisposing.push(cb);
    return cb;
  }
  protected unregister(cb: () => void) {
    this.cbsToCallWhenDisposing = this.cbsToCallWhenDisposing.filter((c) => c !== cb);
  }
  public dispose() {
    this.cbsToCallWhenDisposing.forEach((cb) => cb());
  }
}
