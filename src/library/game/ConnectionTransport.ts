import { EventChannel } from "../utilities/EventChannel";

export interface ConnectionTransport {
  sendMessage(message: any): void;
  onReceiveMessage(cb: (message: any) => void): () => void;
  onReconnect(cb: (transport: ConnectionTransport) => void): () => void;
  connected: EventChannel<boolean>;
}

const LOCAL_LATENCY_SIMULATION = 50;

export class LocalConnectionTransport implements ConnectionTransport {
  /** @param latencyMs Max simulated latency per message (each message waits a random 0..latencyMs) */
  constructor(private latencyMs: number = LOCAL_LATENCY_SIMULATION) {}

  disposed = false;
  public connected = new EventChannel(false);
  private cbs: ((message: any) => void)[] = [];
  private connectedTransport?: LocalConnectionTransport;

  private queue: (() => void)[] = [];

  private reconnectCallbacks: Set<(transport: ConnectionTransport) => void> = new Set();
  onReconnect(cb: (transport: ConnectionTransport) => void): () => void {
    this.reconnectCallbacks.add(cb);
    return () => {
      this.reconnectCallbacks.delete(cb);
    };
  }

  connect(transport: LocalConnectionTransport) {
    this.connectedTransport = transport;
    transport.connectedTransport = this;
    this.connected.value = true;
  }

  sendMessage(message: any): void {
    if (this.disposed) {
      throw new Error("Connection closed?");
    }
    if (!this.connectedTransport) {
      throw new Error("Not connected");
    }

    const copied = JSON.parse(JSON.stringify(message));

    this.queue.push(() => {
      if (this.connectedTransport) {
        this.connectedTransport.cbs.forEach((cb) => cb(copied));
      }
    });
    if (this.latencyMs <= 0 && typeof setImmediate === "function") {
      // No simulated latency (in-process bots, simulations): a timer of 0 still waits ≥1 ms per
      // message in Node, which dominated headless games. setImmediate keeps the queue's order.
      setImmediate(() => this.processMessageOnQueue());
    } else {
      setTimeout(() => this.processMessageOnQueue(), Math.random() * this.latencyMs);
    }
  }

  processMessageOnQueue() {
    if (this.disposed) {
      return;
    }
    const cb = this.queue.shift();
    if (cb) {
      cb();
    }
  }

  simulateDisconnect(durationMs: number = 2000) {
    this.disposed = true;
    const peer = this.connectedTransport;
    this.connected.value = false;

    setTimeout(() => {
      // Create fresh transport pair
      const newClient = new LocalConnectionTransport(this.latencyMs);
      const newServer = new LocalConnectionTransport(this.latencyMs);
      newClient.connect(newServer);

      // Notify client listeners with new client transport
      this.reconnectCallbacks.forEach((cb) => cb(newClient));
      // Notify server listeners with new server transport so match can reconnect
      peer?.reconnectCallbacks.forEach((cb) => cb(newServer));
    }, durationMs);
  }

  onReceiveMessage(cb: (message: any) => void): () => void {
    if (this.disposed) {
      return () => {};
    }

    this.cbs.push(cb);
    return () => {
      this.cbs = this.cbs.filter((c) => c !== cb);
    };
  }
}
