import { EventChannel } from "../utilities/EventChannel";

export interface ConnectionTransport {
  sendMessage(message: any): void;
  onReceiveMessage(cb: (message: any) => void): () => void;
  connected: EventChannel<boolean>;
}

const LOCAL_LATENCY_SIMULATION = 10;

export class LocalConnectionTransport implements ConnectionTransport {
  public connected = new EventChannel(false);
  private cbs: ((message: any) => void)[] = [];
  private connectedTransport?: LocalConnectionTransport;

  private queue: (() => void)[] = [];

  connect(transport: LocalConnectionTransport) {
    this.connectedTransport = transport;
    transport.connectedTransport = this;
    this.connected.value = true;
  }

  sendMessage(message: any): void {
    if (!this.connectedTransport) {
      throw new Error("Not connected");
    }

    const copied = JSON.parse(JSON.stringify(message));

    this.queue.push(() => {
      if (this.connectedTransport) {
        this.connectedTransport.cbs.forEach((cb) => cb(copied));
      }
    });
    setTimeout(() => this.processMessageOnQueue(), Math.random() * LOCAL_LATENCY_SIMULATION);
  }

  processMessageOnQueue() {
    const cb = this.queue.shift();
    if (cb) {
      cb();
    }
  }

  onReceiveMessage(cb: (message: any) => void): () => void {
    this.cbs.push(cb);
    return () => {
      this.cbs = this.cbs.filter((c) => c !== cb);
    };
  }
}
