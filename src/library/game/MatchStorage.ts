// export class LocalMatchStorage extends MatchStorage {}

import { PlayerChit } from "./PlayerChit";

export interface IMatchStorage {
  readState(): Promise<any>;
  saveState(newState: any, players: PlayerChit[]): Promise<void>;
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
  async saveState(newState: any, players: PlayerChit[], notify = false): Promise<void> {
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
