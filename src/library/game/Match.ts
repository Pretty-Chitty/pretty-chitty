import { Chit } from "./Chit";
import { Connection } from "./Connection";
import { ConnectionTransport } from "./ConnectionTransport";
import { Game, GameResult } from "./Game";
import { ServerTime } from "./serverTransport/ServerTime";
import { PlayerInfo } from "./PlayerInfo";
import { DestroyError, MismatchError, RerunError, Turn } from "./Turn";
import { RngSource, TurnState } from "./TurnState";
import { IMatchStorage } from "./MatchStorage";
import { ServerPrompts } from "./serverTransport/ServerPrompts";
import { EventChannel } from "../utilities/EventChannel";
import { RootChit } from "./RootChit";
import { ServerStatus } from "./serverTransport/ServerStatus";
import { PlayerChit } from "./PlayerChit";
import { AiPlayerHandle, ConnectAiPlayerOptions, connectAiPlayer } from "./ai/connectAiPlayer";
import type { AiMemoryStore } from "./ai/AiClientPrompts";

/** Engine-level knobs for a match (as opposed to the game's own `matchOptions`). */
export type MatchConfig = {
  /** Where fresh random draws come from. Default: `Math.random`. See `RngSource`. */
  rngSource?: RngSource;
};

/** Options for {@link Match.seatAiPlayers}: applied to every bot it seats. */
export type SeatAiPlayersOptions = Omit<ConnectAiPlayerOptions, "difficulty" | "params" | "choose" | "memoryStore">;

/**
 * The bots attached to a match, however they were seated ({@link Match.seatAiPlayers} or
 * `connectAiPlayer`), and the one switch a host needs over them.
 *
 * @group AI
 */
export class MatchAiControls {
  private _enabled = true;
  private _handles: AiPlayerHandle[] = [];

  /** Every bot currently attached, in seating order */
  get handles(): readonly AiPlayerHandle[] {
    return this._handles;
  }

  /** Ids of the seats that have a bot */
  get seatedPlayerIds(): string[] {
    return this._handles.map((h) => h.playerId);
  }

  /** True when no bot is in the middle of answering a prompt (safe to tear the match down) */
  get idle(): boolean {
    return this._handles.every((h) => h.prompts.idle);
  }

  /**
   * Whether the bots answer prompts. Default true. Set it false on every copy of a match but one
   * when several copies run at once (each browser tab in client-trust mode, or two bundle versions
   * of a match on a server), otherwise each copy answers the same prompt. Bots keep their memory
   * while paused and answer the pending prompt when resumed. Applies to bots seated later too.
   */
  get enabled(): boolean {
    return this._enabled;
  }
  set enabled(enabled: boolean) {
    this._enabled = enabled;
    this._handles.forEach((h) => h.prompts.setEnabled(enabled));
  }

  /** @internal */
  register(handle: AiPlayerHandle) {
    this._handles.push(handle);
  }

  /** @internal */
  unregister(handle: AiPlayerHandle) {
    this._handles = this._handles.filter((h) => h !== handle);
  }

  /** @internal */
  disposeAll() {
    [...this._handles].forEach((h) => h.dispose());
    this._handles = [];
  }
}

export class Match<P extends PlayerChit, R extends RootChit<P>> {
  public state: TurnState = new TurnState();
  public result = new EventChannel<undefined | GameResult<P>>(undefined);
  public turn = new EventChannel<undefined | Turn<GameResult<P>, P, R>>(undefined);
  public errorState = new EventChannel<undefined | string>(undefined);
  /** The AI players attached to this match and the switch that pauses them. See {@link seatAiPlayers}. */
  public readonly ai = new MatchAiControls();
  private onChangeCallbacks: (() => void)[] = [];
  private connections: Connection[] = [];
  private unsubscribeStorage?: () => void;
  private disposed = false;

  constructor(
    public game: Game<P, R>,
    public players: PlayerInfo[],
    private matchStorage: IMatchStorage,
    private matchOptions?: any,
    private config: MatchConfig = {},
  ) {
    this.state.rngSource = config.rngSource;
  }

  async load() {
    const savedState = await this.matchStorage.readState();
    if (savedState !== null) {
      this.state.deserialize(savedState);
    }
    this.unsubscribeStorage = this.matchStorage.registerNewStateCallback((savedState) => {
      if (this.disposed) {
        return;
      }
      this.state = new TurnState();
      this.state.rngSource = this.config.rngSource;
      this.state.deserialize(savedState);
      if (this.errorState.value) {
        this.turn.value?.destroy();
        this.turn.value = undefined;
        this.start();
      } else if (this.turn.value) {
        this.turn.value
          .processNewSavedState(this.state)
          .then(() => {
            console.log("Processed new saved state");
          })
          .catch((e: any) => {
            console.error("Error processing new saved state", e);
          });
      }

      // TODO: if the match is over and are resetting.... what do we do?
    });
  }

  public findPlayer(playerId: string): PlayerInfo {
    const result = this.players.find((p) => p.id === playerId);
    if (!result) {
      throw new Error(`Player ${playerId} not found`);
    }
    return result;
  }

  async start() {
    if (this.turn.value) {
      throw new Error("Can only start once per Match instance");
    }

    // if players change (promise status, etc.) then we need to notify
    // as that means the clock has changed (or promise status)
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        this.result.value = undefined;
        this.errorState.value = undefined;
        const rootChit = new this.game.chitLibrary.Root() as R;
        rootChit.id = "root";
        rootChit.game = this.game;
        rootChit.processMatchOptions(this.matchOptions ?? {});

        this.players.forEach((p) => {
          const Player = this.game.chitLibrary.Player;
          const player = new Player();
          player.setPlayerInfo(p);
          player.promptStatus.latestPrompt.on(() => this.notify(), false);
          rootChit.players.add(player);
          return player;
        });

        let counter = 1;
        rootChit.walk((c: Chit) => {
          if (!c.id) {
            c.id = `r-ac-${counter++}`;
          }
        });

        this.turn.value = new Turn<GameResult<P>, P, R>(
          "root",
          this,
          this.state,
          async (turn) => {
            await rootChit.players.shuffle();
            return this.game.run(turn, rootChit);
          },
          [rootChit],
        );
        rootChit._setupTurn = this.turn.value;
        this.turn.value.fixPass();
        this.notify();

        this.result.value = await this.turn.value.execute();
        break;
      } catch (e) {
        if (e instanceof RerunError) {
          continue;
        }

        if (e instanceof MismatchError) {
          this.errorState.value = e.message;
          return;
        }

        if (e instanceof DestroyError || this.disposed) {
          // The turn was torn down on purpose (dispose, or a reload replacing it): not an error
          return;
        }

        throw e;
      }
    }
  }

  // TODO: playerid included?
  connect(transport: ConnectionTransport, playerId: string) {
    const connection = new Connection(transport);
    console.log(`Connected ${playerId}`);
    connection.register(new ServerTime(this, playerId, connection));
    connection.register(new ServerPrompts(playerId, this, connection));
    connection.register(new ServerStatus(this, connection));
    this.connections.push(connection);
    return connection;
  }

  /**
   * Seats an engine AI in every seat whose `PlayerInfo.ai` is set and that has no bot yet, and
   * returns the handles of the bots it created.  Call it after `load()` and before (or after)
   * `start()`.  Hosts opt in by calling it; the `ai` flag on its own does nothing, so a harness that
   * seats its own bots with `connectAiPlayer` is never doubled up.  Seats already taken by a
   * `connectAiPlayer` bot are skipped, so the two can be mixed: hand-seat the bot under test, then
   * call this for the rest.
   *
   * Each bot's `difficulty` comes from its seat's `ai` info; everything else from `options`.
   * Bots follow {@link MatchAiControls.enabled} and are disposed with the match.
   *
   * ```ts
   * const match = new Match(game, players, storage, options);
   * await match.load();
   * match.seatAiPlayers({ thinkMs: [400, 900] });
   * match.start();
   * ```
   *
   * @group AI
   */
  seatAiPlayers(options: SeatAiPlayersOptions = {}): AiPlayerHandle[] {
    const seated = new Set(this.ai.seatedPlayerIds);
    return this.players
      .filter((p) => p.ai && !seated.has(p.id))
      .map((p) => connectAiPlayer(this, p.id, { ...options, difficulty: p.ai?.difficulty }));
  }

  /**
   * Where a bot in `playerId`'s seat keeps its plan memory: a slot in this match's saved state, so
   * it is persisted by whatever `IMatchStorage` the host supplied and comes back after a reload.
   * `connectAiPlayer` uses this by default.
   * @internal
   */
  aiMemoryStore(playerId: string): AiMemoryStore {
    return {
      read: () => this.state.ai?.[playerId],
      write: (memory) => {
        const ai = (this.state.ai ??= {});
        ai[playerId] = memory;
      },
    };
  }

  /**
   * Headless runs only (simulations, testbeds): notify once per event-loop pass on setImmediate
   * instead of the 0 ms debounce timer, which waits ≥1 ms per change in Node. Every prompt
   * response waits for the next notification (ServerPrompts.resolvePrompt), so that timer was most
   * of a simulated game's run time. Off by default: servers and browsers keep the debounce.
   */
  public immediateNotify = false;
  private _timeout?: NodeJS.Timeout | number = undefined;
  private _notifyQueued = false;
  private notify() {
    if (this.disposed) {
      return;
    }
    if (this.immediateNotify && typeof setImmediate === "function") {
      // Not a re-deferring debounce: with several bots answering every pass it would never fire,
      // and the prompt responses waiting on it would stall.
      if (this._notifyQueued) return;
      this._notifyQueued = true;
      setImmediate(() => {
        this._notifyQueued = false;
        this.processNotify();
      });
      return;
    }
    clearTimeout(this._timeout);
    this._timeout = setTimeout(() => this.processNotify(), 0);
  }

  private _isSaving = false;
  private _saveStateNeeded = false;
  private processNotify() {
    if (this.disposed) {
      return;
    }
    this.onChangeCallbacks.forEach((cb) => cb());

    // TODO: this is a promise going nowhere... do we block on saving?
    this._saveStateNeeded = true;
    this.processSaveState();
  }

  private processSaveState() {
    if (this._isSaving) {
      return;
    }

    this._saveStateNeeded = false;
    this._isSaving = true;
    this.matchStorage
      .saveState(
        this.state,
        this.turn.value?.rootChit.players.copy() ?? [],
        this.result.value ? "finished" : "active",
        this.result.value?.winners,
      )
      .finally(() => {
        this._isSaving = false;
        if (this._saveStateNeeded) {
          return this.processSaveState();
        }
      });
  }

  /**
   * Tears the match down: disposes its bots and every connection made through `connect`, stops
   * listening to storage, and destroys the running turn so no prompt stays pending.  Nothing is
   * saved after this.  A disposed match cannot be restarted; make a new one.
   */
  public dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    clearTimeout(this._timeout);
    this.ai.disposeAll();
    this.connections.forEach((c) => c.dispose());
    this.connections = [];
    this.unsubscribeStorage?.();
    this.unsubscribeStorage = undefined;
    this.onChangeCallbacks = [];
    this.turn.value?.destroy();
  }

  public onChange(cb: () => void, callNow = true) {
    this.onChangeCallbacks.push(cb);
    callNow && queueMicrotask(cb);
    return () => {
      this.onChangeCallbacks = this.onChangeCallbacks.filter((c) => c !== cb);
    };
  }
}
