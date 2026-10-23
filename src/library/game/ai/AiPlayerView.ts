import { Chit } from "../Chit";
import { ClockDetails } from "../ClockDetails";
import { Connection } from "../Connection";
import { ConnectionObject } from "../ConnectionObject";
import { Game } from "../Game";
import { RootChit } from "../RootChit";
import { ServerTime } from "../serverTransport/ServerTime";
import { hashString } from "./defineAi";

/**
 * A headless stand-in for ClientTime, registered as "ClientTime" on an AI player's connection.
 *
 * It rebuilds the chit tree from exactly what the server sends this seat (`serializeDelta`, which
 * applies `Chit.fixVisibility`), so the AI can only see what a human in that seat could see.
 * There is no animation or timeline scrubbing: it jumps straight to the requested clock.
 *
 * @internal
 */
export class AiPlayerView extends ConnectionObject {
  private serverTime: ServerTime<any, any>;
  private chitLookup: { [id: string]: Chit } = {};
  private lastSerializedState: { [chitId: string]: string } = {};
  private states: { [stateId: number]: string } = {};
  private queue: Promise<void> = Promise.resolve();

  public maxClock: ClockDetails = { clock: 0, pass: -1 };
  public root?: RootChit<any>;
  /** Hash of the visible board at the last sync; equal hashes mean an identical view */
  public signature = "";

  constructor(
    connection: Connection,
    private game: Game<any, any>,
  ) {
    super();
    this.serverTime = connection.get<ServerTime<any, any>>("ServerTime");
  }

  public readonly findChit = (id: string): Chit | undefined => this.chitLookup[id];

  // Called by ServerTime
  public async newMaxClock(clock: ClockDetails) {
    this.maxClock = clock;
  }

  // Called by ServerTime; replays are irrelevant to a bot
  public async setStartTime() {}

  /** Brings the view up to `clock` (or the latest clock this seat may see). Calls are serialized. */
  public sync(clock?: number): Promise<void> {
    const run = this.queue.then(() => this.load(clock ?? this.maxClock.clock));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async load(clock: number) {
    const response = await this.serverTime.serializeDelta(Math.max(1, clock));
    if (!response) {
      return;
    }

    Object.assign(this.states, response.newStates);
    const serialized: { [id: string]: string } = {};
    Object.entries(response.chits as { [id: string]: number }).forEach(([id, stateId]) => {
      serialized[id] = this.states[stateId];
    });

    this.signature = hashString(
      Object.keys(response.chits)
        .sort()
        .map((id) => `${id}=${response.chits[id]}`)
        .join(","),
    );

    // Same steps as ClientTime.processNewTargetClock: create first (chits reference each other),
    // detach chits that no longer exist, then deserialize what changed.
    Object.entries(serialized).forEach(([id, value]) => {
      if (!this.chitLookup[id]) {
        const chit = Chit.deflate(value, this.game);
        if (chit) {
          this.chitLookup[id] = chit;
        }
      }
    });

    Object.values(this.chitLookup).forEach((chit) => {
      if (chit.id && !serialized[chit.id] && this.lastSerializedState[chit.id] !== undefined) {
        if (chit.parentFallback) {
          chit.beginDeserializing();
          chit.setParent(chit.parentFallback, chit.parentOutlet ?? "graveyard");
          chit.doneDeserializing();
        } else {
          chit.removeFromParent();
        }
        delete this.lastSerializedState[chit.id];
      }
    });

    const changed = Object.entries(serialized).filter(
      ([id, value]) => this.chitLookup[id] && this.lastSerializedState[id] !== value,
    );
    const strictFind = (id: string) => this.chitLookup[id];
    changed.forEach(([id]) => this.chitLookup[id].beginDeserializing());
    changed.forEach(([id, value]) => {
      this.chitLookup[id].deserialize(value, strictFind);
      this.lastSerializedState[id] = value;
    });
    changed.forEach(([id]) => this.chitLookup[id].doneDeserializing());

    this.root = this.chitLookup["root"] as RootChit<any> | undefined;
  }
}
