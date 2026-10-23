import { PlayerChit } from "./PlayerChit";

export interface IMatchStorage {
  readState(): Promise<any>;
  saveState(
    newState: any,
    players: PlayerChit[],
    matchState: "active" | "finished",
    winners?: PlayerChit[],
  ): Promise<void>;
  registerNewStateCallback(cb: (newState: any) => void): () => void;
}

export class LocalMatchStorage implements IMatchStorage {
  constructor(private matchId: string) {}
  private onChangeCallbacks: ((state: any) => void)[] = [];

  private get localStorageKey() {
    return `match${this.matchId}`;
  }

  async readState(): Promise<any> {
    const result = localStorage[this.localStorageKey];
    if (result) {
      return JSON.parse(result);
    }
    return null;
  }
  async saveState(
    newState: any,
    players: PlayerChit[],
    matchState: "active" | "finished",
    winners?: PlayerChit[],
    notify = false,
  ): Promise<void> {
    localStorage[this.localStorageKey] = JSON.stringify(newState);
    if (notify) {
      this.notify(newState);
    }
  }
  registerNewStateCallback(cb: (newState: any) => void): () => void {
    this.onChangeCallbacks.push(cb);
    return () => {
      this.onChangeCallbacks = this.onChangeCallbacks.filter((c) => c !== cb);
    };
  }

  private notify(state: any) {
    this.onChangeCallbacks.forEach((cb) => cb(state));
  }
}

export class EphemeralMatchStorage implements IMatchStorage {
  /**
   * @param lazy Headless runs only (simulations, testbeds): keep a reference to the saved state and
   * turn it into JSON only when read. Saves get much cheaper (stringifying the whole match on every
   * change cost ~10% of a headless game), but a read returns the match as it is *now*, not as of the
   * last save. Off by default: every save is a snapshot.
   */
  constructor(
    private matchId: string,
    private lazy = false,
  ) {}
  private onChangeCallbacks: ((state: any) => void)[] = [];

  private state: any = "{}";

  async readState(): Promise<any> {
    const result = this.state;
    if (result) {
      // A string is a snapshot (or the initial empty state); an object is a lazy reference.
      return JSON.parse(typeof result === "string" ? result : JSON.stringify(result));
    }
    return null;
  }
  async saveState(
    newState: any,
    players: PlayerChit[],
    matchState: "active" | "finished",
    winners?: PlayerChit[],
    notify = false,
  ): Promise<void> {
    this.state = this.lazy ? newState : JSON.stringify(newState);
    if (notify) {
      this.notify(newState);
    }
  }
  registerNewStateCallback(cb: (newState: any) => void): () => void {
    this.onChangeCallbacks.push(cb);
    return () => {
      this.onChangeCallbacks = this.onChangeCallbacks.filter((c) => c !== cb);
    };
  }

  private notify(state: any) {
    this.onChangeCallbacks.forEach((cb) => cb(state));
  }
}
