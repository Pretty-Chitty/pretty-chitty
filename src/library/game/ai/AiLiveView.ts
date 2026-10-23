import { Chit } from "../Chit";
import { ClockDetails } from "../ClockDetails";
import { ConnectionObject } from "../ConnectionObject";
import { Match } from "../Match";
import { RootChit } from "../RootChit";
import { hashString } from "./defineAi";

/** What an AI player reads the board through (see AiLiveView and AiPlayerView). @internal */
export interface AiView {
  root?: RootChit<any>;
  findChit: (id: string) => Chit | undefined;
  /** Equal signatures mean the same situation (used to remember dead ends). */
  signature: string;
  sync(clock?: number): Promise<void>;
}

/**
 * The default AI view: the match's own, live game objects, read in place. Registered as
 * "ClientTime" on the bot's connection so the server's time calls land somewhere, but nothing is
 * serialized: the bot reads the live tree directly, which is much faster than rebuilding a
 * redacted copy on every prompt.
 *
 * The cost is fairness: the bot can read hidden fields (other hands, deck order) and other players'
 * unfinished simultaneous moves. Rules that would use such information should opt into the
 * serialized view (`defineAi({ serializedView: true })`, or `connectAiPlayer(…, { view: "serialized" })`).
 * Rules must never mutate what they read.
 *
 * @internal
 */
export class AiLiveView extends ConnectionObject implements AiView {
  public maxClock: ClockDetails = { clock: 0, pass: -1 };
  public root?: RootChit<any>;
  public signature = "";
  private lookup: { [id: string]: Chit } = {};

  constructor(private match: Match<any, any>) {
    super();
  }

  public readonly findChit = (id: string): Chit | undefined => this.lookup[id];

  // Called by ServerTime
  public async newMaxClock(clock: ClockDetails) {
    this.maxClock = clock;
  }
  // Called by ServerTime; replays are irrelevant to a bot
  public async setStartTime() {}

  /** Points the view at the live board and indexes it by id (chits created inside an unfinished
   *  sub-turn are not in the main turn's lookup, so walk the tree). */
  public async sync(clock?: number): Promise<void> {
    const root = this.match.turn.value?.rootChit as RootChit<any> | undefined;
    this.root = root;
    const lookup: { [id: string]: Chit } = {};
    root?.walk((c: Chit) => {
      if (c.id) lookup[c.id] = c;
      return true;
    });
    this.lookup = lookup;
    // The prompt's clock identifies the situation: an undo returns to the same clock.
    this.signature = hashString(`${clock ?? this.maxClock.clock}:${this.maxClock.pass}`);
  }
}
