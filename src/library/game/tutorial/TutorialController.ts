import { EventChannel } from "../../utilities/EventChannel";
import { Chit } from "../Chit";
import { PlayerChit } from "../PlayerChit";
import { PickPrompt, PromptAction } from "../Prompt";
import { RootChit } from "../RootChit";
import { allowsUi, isAllowed, scriptedAnswer, shapeOfPromptAction } from "./allowed";
import {
  BoxPlacement,
  Checker,
  Cue,
  Focus,
  GalleryCommand,
  Pose,
  TimelineCommand,
  TutorialGalleryState,
  TutorialContext,
  TutorialSpec,
  TutorialStep,
  selectChits,
  splitSentences,
} from "./defineTutorial";
import type { TutorialRuntime } from "./TutorialRuntime";

/** How the controller reads the game: the player's own view in the browser, the live match headlessly. @internal */
export interface TutorialView<P extends PlayerChit, R extends RootChit<P>> {
  root(): R | undefined;
  me(): P | undefined;
  prompt(): PickPrompt | undefined;
  clock(): number;
  find(id: string): Chit | undefined;
  /** Latest log line, if any */
  latestLog(): string | undefined;
  /** False while the player is scrubbing history */
  live(): boolean;
  /** Fires whenever any of the above may have changed */
  onChange(cb: () => void): () => void;
  /**
   * Installs (or removes) the vet for the player's answers: only actions it approves reach the game.
   * Headless views have no human input and may ignore it.
   */
  setGuard?(guard: ((action: PromptAction) => boolean | "handled") | undefined): void;
  /** Lets the game's Undo button act as the tutorial's Back (it is offered exactly as before) */
  setUndo?(undo: { undo: () => void } | undefined): void;
  /** Fires when the guard drops an attempted action */
  onBlocked?(cb: (action: PromptAction) => void): () => void;
  /** Galleries open right now (full-screen first). Views without galleries return [] or omit it. */
  galleries?(): TutorialGalleryState[];
  /** Opens, switches or closes a gallery. Returns true when it opened one. */
  setGallery?(command: GalleryCommand<P, R>): boolean;
  /** Changes a chit in this player's view only (see `Pose`). Without it, poses do nothing. */
  pose?(chit: Chit, change: (chit: Chit) => void): void;
  /** Puts a posed chit back as the game has it */
  unpose?(chit: Chit): void;
  /**
   * The board's timeline, for `timeline` commands: the clock it shows (or is animating to), and a
   * hold on how far it may play (undefined: follow the game). Without it, timeline commands do nothing.
   */
  timeline?: { at(): number; hold(clock: number | undefined): void };
  /** Presses a UI control by its `data-tutorial-target` name, for "do it for me". Returns whether it found one. */
  pressUi?(name: string): boolean;
  /** Rushes the board's animations while the tutorial fast-forwards */
  setFastForward?(on: boolean): void;
  /** Whether the board has caught up with the game and stopped animating (fast-forward waits for it) */
  settled?(): boolean;
}

/** Plays narration. The browser implementation wraps an audio element and speech synthesis. @internal */
export interface NarrationPlayer {
  /** Resolves when playback has started (or failed); `onTime` and `onSentence` then fire until `onEnd`. */
  play(step: { audio: string; text: string; sentences: string[] }): Promise<void>;
  stop(): void;
  pause(): void;
  resume(): void;
  readonly playing: boolean;
  readonly paused: boolean;
  /**
   * Starts loading a later step's recording, so it plays at once when its step comes (a phone
   * otherwise waits for each file to download). Optional.
   */
  preload?(audio: string): void;
  /** Seconds since the narration started */
  readonly time: number;
  /** Total length in seconds, when known */
  readonly duration: number | undefined;
  /**
   * Playback speed (1 = normal). `time` and `duration` stay in the recording's own seconds, so cues
   * and `sentenceTimes` need no adjusting.
   */
  setRate?(rate: number): void;
  onTime(cb: (seconds: number) => void): () => void;
  /** Sentence boundaries, when the player knows them (speech synthesis does) */
  onSentence(cb: (index: number) => void): () => void;
  onEnd(cb: () => void): () => void;
}

export type TutorialStatus = "idle" | "narrating" | "waiting" | "satisfied" | "done";

export type TutorialEvent =
  | { type: "started" }
  | { type: "step"; stepId: string; index: number }
  /** A "do it" step's check passed (fired synchronously, before the tutorial moves on) */
  | { type: "satisfied"; stepId: string }
  | { type: "completed"; end: "continue" | "back" }
  | { type: "skipped" };

export type TutorialControllerOptions<P extends PlayerChit, R extends RootChit<P>> = {
  spec: TutorialSpec<P, R>;
  view: TutorialView<P, R>;
  runtime?: TutorialRuntime<P, R>;
  narration?: NarrationPlayer;
  /** The match's bot switch, for `pauseAi` */
  ai?: { enabled: boolean };
  /**
   * Lets Back put the game back where it was: `save` is called when a step goes live, `restore`
   * when the player goes back to it (the host then rebuilds the match and restarts the script at
   * that step). Without it, Back only reviews the earlier step's text.
   */
  history?: {
    save: (stepId: string) => void;
    /** Resolves true once the game shows the board as it was when `stepId` went live; false if it cannot */
    restore: (stepId: string, index: number) => Promise<boolean>;
  };
  onEvent?: (e: TutorialEvent) => void;
  /** Pause between a `waitFor` passing and moving on. Default 900 ms */
  satisfiedDelayMs?: number;
  /** Pause between a narration ending and moving on (steps without `pause`). Default 700 ms */
  autoAdvanceDelayMs?: number;
  /** Words per second for the reading clock used when a step has no audio. Default 3; Infinity = instant */
  readingSpeed?: number;
  /** Audio off: cues run on the reading clock. Default false */
  muted?: boolean;
  /** Narration speed: 1 (default), 1.25, 1.5 or 2. The reading clock runs at the same speed. */
  rate?: number;
  /** Timers: injectable for tests */
  setTimeout?: (cb: () => void, ms: number) => any;
  clearTimeout?: (handle: any) => void;
  now?: () => number;
};

const DEFAULT_HINT_AFTER = 8;

/**
 * Runs a tutorial script against a game the player can see: steps, narration and cues, "do it" checks,
 * hints and the end-of-tutorial handoff. UI-free, so it runs headlessly in tests; the overlay reads
 * its channels and calls `next`/`back`/`skip`.
 *
 * @group Tutorials
 */
/** The pause between steps while fast-forwarding */
const FAST_BEAT_MS = 60;
/** How long the board must stay settled before a fast-forward moves on */
const FAST_SETTLE_MS = 150;
/** A fast-forward stuck this long on one step stops there */
const FAST_GIVE_UP_MS = 20000;

export class TutorialController<P extends PlayerChit = PlayerChit, R extends RootChit<P> = RootChit<P>> {
  public readonly spec: TutorialSpec<P, R>;
  public readonly index = new EventChannel<number>(-1);
  public readonly status = new EventChannel<TutorialStatus>("idle");
  public readonly focus = new EventChannel<Focus<P, R>[]>([]);
  public readonly box = new EventChannel<BoxPlacement<P, R> | undefined>(undefined);
  public readonly hint = new EventChannel<string | undefined>(undefined);
  /** Index of the sentence being narrated, for emphasis */
  public readonly sentence = new EventChannel<number>(-1);
  public readonly narrationTime = new EventChannel<number>(0);
  public readonly narrating = new EventChannel<boolean>(false);
  /**
   * The player stopped the flow (Pause, or Back): narration holds where it is, nothing advances by
   * itself, the bots hold their moves, and moving between steps with Back/Next stays silent until
   * `play()`. A "do it" step can still be completed while paused; doing it counts as resuming.
   */
  public readonly paused = new EventChannel<boolean>(false);
  /** A Back is putting the game back; input and Next are held until it lands */
  public readonly rewinding = new EventChannel<boolean>(false);
  public readonly muted: EventChannel<boolean>;
  /** Narration speed (1 = normal) */
  public readonly rate: EventChannel<number>;
  /** Result of the current step's `waitFor` at the last evaluation */
  public readonly check = new EventChannel<boolean | string | undefined>(undefined);
  /**
   * True while looking at a step behind the furthest one reached (after Back). A reviewed step
   * narrates and highlights but does not check, pause the bots or auto-advance; Next walks forward
   * until the live step resumes with its state intact.
   */
  public readonly reviewing = new EventChannel<boolean>(false);
  /** Index of the furthest step reached live */
  public readonly frontier = new EventChannel<number>(-1);
  /** Bumps each time the player tries a move the current step does not allow */
  public readonly blocked = new EventChannel<number>(0);
  /** The clock the script is holding the board at, or undefined while the board plays freely */
  public readonly timelineHold = new EventChannel<number | undefined>(undefined);
  /** The clock the board shows, for the workbench (counting moments for `{ advance: n }`) */
  public readonly boardClock = new EventChannel<number>(0);
  /** The step a fast-forward is playing through to, or undefined */
  public readonly fastForwardTarget = new EventChannel<number | undefined>(undefined);

  private readonly view: TutorialView<P, R>;
  private readonly runtime?: TutorialRuntime<P, R>;
  private readonly narration?: NarrationPlayer;
  private readonly ai?: { enabled: boolean };
  private readonly history?: TutorialControllerOptions<P, R>["history"];
  private readonly onEvent?: (e: TutorialEvent) => void;
  private readonly satisfiedDelayMs: number;
  private readonly autoAdvanceDelayMs: number;
  private readonly readingSpeed: number;
  private readonly _setTimeout: (cb: () => void, ms: number) => any;
  private readonly _clearTimeout: (handle: any) => void;
  private readonly _now: () => number;

  private unsubs: (() => void)[] = [];
  private stepUnsubs: (() => void)[] = [];
  private stepStartClock = 0;
  private recentLog: string[] = [];
  private lastLog: string | undefined;
  private aiEnabledBeforePause: boolean | undefined;
  private satisfiedTimer: any;
  /** A step entered by acting ahead narrates after all if its check has not passed by then */
  private aheadTimer: any;
  private readingActive = false;
  private advanceTimer: any;
  private hintTimer: any;
  private readingTimer: any;
  private readingStartedAt = 0;
  private readingPausedAt: number | undefined;
  private appliedCues = new Set<number>();
  private sentences: string[] = [];
  private disposed = false;
  private narrationEnded = false;
  /** Steps whose `waitFor` baseline was taken; a live re-entry (after a review) keeps it */
  private baselined = new Set<string>();

  constructor(options: TutorialControllerOptions<P, R>) {
    this.spec = options.spec;
    this.view = options.view;
    this.runtime = options.runtime;
    this.narration = options.narration;
    this.ai = options.ai;
    this.history = options.history;
    this.onEvent = options.onEvent;
    this.satisfiedDelayMs = options.satisfiedDelayMs ?? 900;
    this.autoAdvanceDelayMs = options.autoAdvanceDelayMs ?? 700;
    this.readingSpeed = options.readingSpeed ?? 3;
    this.muted = new EventChannel<boolean>(options.muted ?? false);
    this.rate = new EventChannel<number>(options.rate ?? 1);
    this.narration?.setRate?.(this.rate.value);
    this._setTimeout = options.setTimeout ?? ((cb, ms) => setTimeout(cb, ms));
    this._clearTimeout = options.clearTimeout ?? ((h) => clearTimeout(h));
    this._now = options.now ?? (() => Date.now());
    // The first recording loads while the start card is up
    this.preloadStep(0);
  }

  /** Lets the narration player start loading step `index`'s recording ahead of time */
  private preloadStep(index: number) {
    const audio = this.spec.steps[index]?.audio;
    if (audio && audio !== "tts") this.narration?.preload?.(audio);
  }

  get step(): TutorialStep<P, R> | undefined {
    return this.spec.steps[this.index.value];
  }

  get steps() {
    return this.spec.steps;
  }

  get isLast() {
    return this.index.value >= this.spec.steps.length - 1;
  }

  /** Whether Next is allowed right now */
  get canAdvance() {
    if (this.rewinding.value) return false;
    if (this.reviewing.value) return true;
    const s = this.status.value;
    return s === "narrating" || s === "satisfied" || (s === "waiting" && this.check.value === true);
  }

  /** Builds the context the checks and callbacks see. Undefined until the board exists. */
  public context(): TutorialContext<P, R> | undefined {
    const root = this.view.root();
    const me = this.view.me();
    if (!root || !me) return undefined;
    return {
      root,
      me,
      prompt: this.view.prompt(),
      clock: this.view.clock(),
      find: <C extends Chit = Chit>(id: string) => this.view.find(id) as C | undefined,
      stepStartClock: this.stepStartClock,
      recentLog: this.recentLog,
      galleries: this.view.galleries?.() ?? [],
    };
  }

  /** Starts at the first step (or the given one). Call once the board has loaded. */
  public start(at = 0, options: { paused?: boolean } = {}) {
    if (this.disposed) return;
    this.paused.value = !!options.paused;
    this.unsubs.push(this.view.onChange(() => this.onViewChange()));
    this.view.setGuard?.((action) => {
      // The game's Undo is the tutorial's Back while the tutorial runs
      if (action.type === "undo" && this.status.value !== "done") {
        this.back();
        return "handled";
      }
      if (this.allows(action)) return true;
      // A move the next "do it" step asks for counts as moving on to that step
      const ahead = this.aheadFor(action);
      if (ahead === undefined) return false;
      this.actAhead(ahead);
      return true;
    });
    const unsubBlocked = this.view.onBlocked?.(() => {
      this.blocked.value = this.blocked.value + 1;
    });
    if (unsubBlocked) this.unsubs.push(unsubBlocked);
    this.onEvent?.({ type: "started" });
    this.lastLog = this.view.latestLog();
    this.enter(at);
  }

  public next() {
    if (this.disposed || this.index.value < 0 || this.rewinding.value) return;
    if (!this.canAdvance) return;
    if (this.isLast) {
      this.finish(this.step?.end ?? "continue");
    } else {
      this.enter(this.index.value + 1);
    }
  }

  /**
   * Previous step. With a history this rewinds the game to that step; otherwise it reviews its text.
   * Either way the tutorial pauses there until the player presses Play, so pressing Back again goes
   * further back instead of racing the narration. Presses during a rewind queue up.
   */
  public back() {
    if (this.disposed || this.index.value <= 0) return;
    const index = this.index.value - 1;
    this.holdFlow();
    if (this.history) {
      this.requestRewind(index);
      return;
    }
    this.enter(index);
  }

  private rewindTarget?: number;

  /** Show the target step straight away and put the game back to it; presses during a rewind queue up */
  private requestRewind(index: number) {
    if (!this.rewinding.value) {
      this.leaveStep();
      // the board is going back: a gallery the script opened would show the wrong moment
      if (this.scriptOpenedGallery) this.applyGallery("close");
      // and so would a chit the script changed; the step landed on poses its own again
      this.releasePoses(true);
      // the rewind waits for the board to catch up with the rerun; the step it lands on holds again
      this.releaseTimeline();
      this.rewinding.value = true;
      // bots wait while the board goes back; entering the step decides whether they play
      this.applyAi();
    }
    this.rewindTarget = index;
    this.index.value = index;
    this.publishUndo();
    this.reviewing.value = false;
    this.focus.value = [];
    this.hint.value = undefined;
    this.check.value = undefined;
    this.narrating.value = false;
    this.sentence.value = -1;
    if (!this.rewindRunning) void this.runRewinds();
  }

  private rewindRunning = false;

  private async runRewinds() {
    this.rewindRunning = true;
    try {
      while (this.rewindTarget !== undefined && !this.disposed) {
        const index = this.rewindTarget;
        this.rewindTarget = undefined;
        let ok = false;
        try {
          ok = (await this.history?.restore(this.spec.steps[index].id, index)) ?? false;
        } catch (e) {
          console.error(`[tutorial ${this.spec.id}] rewind to step ${index + 1} failed`, e);
        }
        if (this.disposed) return;
        if (this.rewindTarget !== undefined) continue; // Back was pressed again meanwhile
        if (ok) {
          // The game is back where this step started: it is the live step again, and it and every
          // later step will take fresh baselines when entered
          this.frontier.value = index;
          this.spec.steps.slice(index).forEach((s) => this.baselined.delete(s.id));
        }
        this.rewinding.value = false;
        this.enter(index);
      }
    } finally {
      this.rewindRunning = false;
      if (this.rewinding.value && this.rewindTarget === undefined && !this.disposed) {
        this.rewinding.value = false;
      }
    }
  }

  /** Whether Back rewinds the game (true) or only reviews text (false) */
  get rewinds() {
    return !!this.history;
  }

  /** Jump to any step (the dev panel). Forward jumps become the live step; the game is left as it is. */
  public jumpTo(index: number) {
    if (this.disposed || index < 0 || index >= this.spec.steps.length) return;
    this.stopFastForward();
    if (index < this.frontier.value && this.history) {
      this.holdFlow();
      this.requestRewind(index);
      return;
    }
    if (index > this.frontier.value) this.frontier.value = index;
    this.enter(index);
  }

  /** Leave a review and return to the live step */
  public resume() {
    if (this.reviewing.value) this.enter(this.frontier.value);
  }

  public skip() {
    if (this.disposed) return;
    this.onEvent?.({ type: "skipped" });
    this.finish("continue", true);
  }

  /** While the tutorial runs, the game's Undo button (shown as usual) does the tutorial's Back */
  private publishUndo() {
    if (this.disposed || this.status.value === "done") {
      this.view.setUndo?.(undefined);
      return;
    }
    this.view.setUndo?.({ undo: () => this.back() });
  }

  /** Stop the flow: the narration holds where it is and nothing advances until `play()`. */
  public pause() {
    if (this.disposed || this.status.value === "done" || this.paused.value) return;
    this.holdFlow();
    // A step that was only finishing its narration moves on when the player presses Play again
    if (this.narration?.playing && !this.narration.paused) this.narration.pause();
    if (this.readingActive && this.readingPausedAt === undefined) this.readingPausedAt = this._now();
    this.narrating.value = false;
  }

  /** Resume: continue a held narration, or play the step's narration from the top. */
  public play() {
    if (this.disposed || this.status.value === "done" || !this.step) return;
    this.paused.value = false;
    this.applyAi();
    if (this.narration?.paused) {
      this.narration.resume();
      this.narrating.value = true;
      return;
    }
    if (this.readingActive && this.readingPausedAt !== undefined) {
      this.readingStartedAt += this._now() - this.readingPausedAt;
      this.readingPausedAt = undefined;
      this.narrating.value = true;
      return;
    }
    this.startNarration();
  }

  /** The box's play/pause button */
  public toggleNarration() {
    if (this.paused.value || !this.narrating.value) this.play();
    else this.pause();
  }

  private holdFlow() {
    this.stopFastForward();
    this.paused.value = true;
    this._clearTimeout(this.advanceTimer);
    this.advanceTimer = undefined;
    this.applyAi();
  }

  /**
   * Whether the bots may move: not while the flow is held (paused or going back), and not during a
   * live step with `pauseAi`. Otherwise they play.
   */
  private applyAi() {
    if (!this.ai || this.status.value === "done") return;
    const step = this.step;
    const hold = this.paused.value || this.rewinding.value || (!!step?.pauseAi && !this.reviewing.value);
    if (hold) {
      if (this.aiEnabledBeforePause === undefined) this.aiEnabledBeforePause = this.ai.enabled;
      this.ai.enabled = false;
    } else {
      this.restoreAi();
    }
  }

  /** Narration for a step just entered: plays unless the flow is held, then it only shows the opening cues */
  private beginNarration() {
    if (this.paused.value) {
      this.narrating.value = false;
      this.appliedCues = new Set();
      this.applyCuesAt(0);
      return;
    }
    this.startNarration();
  }

  /** Speeds the narration up or down, from where it is; the reading clock follows */
  public setRate(rate: number) {
    if (!(rate > 0) || rate === this.rate.value) return;
    if (this.readingActive) {
      // keep the reading clock's position, change only how fast it moves from here
      const at = this.readingPausedAt ?? this._now();
      const t = ((at - this.readingStartedAt) / 1000) * this.rate.value;
      this.readingStartedAt = at - (t * 1000) / rate;
    }
    this.rate.value = rate;
    this.narration?.setRate?.(rate);
  }

  public setMuted(muted: boolean) {
    if (this.muted.value === muted) return;
    this.muted.value = muted;
    this.narration?.stop();
    this.narrating.value = false;
    // Re-run the step's narration/clock from the top so cues stay consistent
    if (this.step && this.status.value !== "done") {
      this.beginNarration();
    }
  }

  public dispose() {
    this.disposed = true;
    this.stopFastForward();
    this.leaveStep();
    this.releasePoses(true);
    this.releaseTimeline();
    this.view.setGuard?.(undefined);
    this.view.setUndo?.(undefined);
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.narration?.stop();
    this.restoreAi();
  }

  // ---- what the player may do ---------------------------------------------------------------------

  /**
   * Whether the game should accept this action right now. Only a live "do it" step that is still
   * waiting lets anything through, and then only what it lists in `allow` (the game's Undo never
   * gets here: it is the tutorial's Back). Once the tutorial is over everything is allowed again.
   */
  public allows(action: PromptAction): boolean {
    if (this.status.value === "done") return true;
    if (this.rewinding.value) return false;
    const step = this.step;
    if (!step || this.reviewing.value || this.status.value !== "waiting") return false;
    if (action.type === "undo") return false; // handled as Back before this is asked
    const move = shapeOfPromptAction(action);
    if (!move) return false;
    return isAllowed(step.allow, move, this.view.root(), this.view.me());
  }

  /**
   * The "do it" step the player may act ahead into: the first later step that waits for something,
   * reached only through steps that just talk. Only while the live step is talking (or already done).
   */
  private aheadStep(): number | undefined {
    if (this.status.value === "done" || this.rewinding.value || this.reviewing.value) return undefined;
    if (this.status.value !== "narrating" && this.status.value !== "satisfied") return undefined;
    for (let i = this.index.value + 1; i < this.spec.steps.length; i++) {
      if (this.spec.steps[i].waitFor) return i;
    }
    return undefined;
  }

  /** The step a game move acts ahead into, if the next "do it" step allows it */
  private aheadFor(action: PromptAction): number | undefined {
    if (action.type === "undo") return undefined;
    const ahead = this.aheadStep();
    if (ahead === undefined) return undefined;
    const move = shapeOfPromptAction(action);
    if (!move) return undefined;
    return isAllowed(this.spec.steps[ahead].allow, move, this.view.root(), this.view.me()) ? ahead : undefined;
  }

  /**
   * The player used a UI control (by its `data-tutorial-target`). If the next "do it" step lists it in
   * `allow`, that counts as moving on to that step, as a game move it allows does. Call it before the
   * control acts, so the step's check takes its baseline from the board as it was.
   */
  public usedUi(name: string) {
    if (this.disposed) return;
    const ahead = this.aheadStep();
    if (ahead !== undefined && allowsUi(this.spec.steps[ahead].allow, name)) this.actAhead(ahead);
  }

  /**
   * The player did what a later "do it" step asks for while an earlier step was still talking: move
   * straight on to that step. The steps in between count as seen (snapshots for Back, their hooks and
   * events), and the step itself stays quiet, since it would only ask for what was just done; it moves
   * on after the usual short beat once its check passes, and narrates as usual if the check does not.
   */
  private actAhead(index: number) {
    this.leaveStep();
    const ctx = this.context();
    for (let i = this.index.value + 1; i < index; i++) {
      const step = this.spec.steps[i];
      if (i > this.frontier.value) this.frontier.value = i;
      if (this.markSeen(step)) this.baselined.add(step.id);
      if (ctx) {
        step.onEnter?.(ctx);
        step.onExit?.(ctx);
      }
      this.onEvent?.({ type: "step", stepId: step.id, index: i });
    }
    // Acting is as explicit as pressing Play
    this.paused.value = false;
    this.enter(index, { ahead: true });
  }

  /** First visit to a live step: its snapshot for Back and the baselines its check measures from */
  private markSeen(step: TutorialStep<P, R>): boolean {
    if (this.baselined.has(step.id)) return false;
    this.stepStartClock = this.view.clock();
    this.recentLog = [];
    this.lastLog = this.view.latestLog();
    this.history?.save(step.id);
    return true;
  }

  // ---- steps -------------------------------------------------------------------------------------

  /** `ahead`: entered by acting ahead (see `actAhead`), after the previous step was already left */
  private enter(index: number, options: { ahead?: boolean } = {}) {
    if (!options.ahead) this.leaveStep();
    // A fast-forward ends on its step, which then plays as usual
    if (this.fastForwardTarget.value !== undefined && index >= this.fastForwardTarget.value) this.stopFastForward();
    const step = this.spec.steps[index];
    if (!step) return;
    const review = index < this.frontier.value;
    if (!review && index > this.frontier.value) this.frontier.value = index;
    this.index.value = index;
    this.reviewing.value = review;
    this.hint.value = undefined;
    this.check.value = undefined;
    this.appliedCues = new Set();
    this.sentences = splitSentences(step.text);
    this.sentence.value = -1;
    this.narrationTime.value = 0;

    if (step.box) {
      this.box.value = step.box.anchor === "keep" ? this.box.value : step.box;
    }
    this.focus.value = step.focus ?? [];
    if (step.gallery) this.applyGallery(step.gallery);
    if (step.pose) this.applyPoses(step.pose);
    this.releasePoses(false);

    if (review) {
      // Looking back: narrate and highlight, but leave the game, the bots and the checks alone
      this.status.value = "narrating";
      this.beginNarration();
      this.publishUndo();
      return;
    }

    this.runtime && (this.runtime.activeStep.value = step.id);
    const firstTime = this.markSeen(step);
    if (step.timeline) this.applyTimeline(step.timeline);
    if (step.waitFor && this.timelineHold.value !== undefined && !step.timeline) {
      console.warn(
        `[tutorial ${this.spec.id}] step "${step.id}" waits with the board's timeline held at clock ` +
          `${this.timelineHold.value}; if it needs the board to catch up, give it timeline: "play"`,
      );
    }

    this.applyAi();

    const ctx = this.context();
    if (ctx) {
      if (firstTime) {
        step.waitFor?.reset?.(ctx);
        this.baselined.add(step.id);
      }
      step.onEnter?.(ctx);
    }

    this.status.value = step.waitFor ? "waiting" : "narrating";
    this.onEvent?.({ type: "step", stepId: step.id, index });

    if (this.fastForwardTarget.value !== undefined) {
      // Passing through: no narration, but the galleries end up as the cues would leave them
      this.narrating.value = false;
      this.sentence.value = -1;
      step.cues?.forEach((cue) => cue.gallery && this.applyGallery(cue.gallery));
      this.scheduleFastBeat();
    } else if (options.ahead) {
      // The move that brought us here has not landed yet. Once it does the check passes and the step
      // moves on; if it does not pass soon after, narrate after all.
      this.narrating.value = false;
      this.sentence.value = -1;
      this.aheadTimer = this._setTimeout(() => {
        this.aheadTimer = undefined;
        if (this.step === step && this.status.value === "waiting") this.beginNarration();
      }, this.satisfiedDelayMs);
    } else {
      this.beginNarration();
    }
    this.evaluate();
    if (step.waitFor) {
      const after = typeof step.hint === "object" ? step.hint.after : DEFAULT_HINT_AFTER;
      this.hintTimer = this._setTimeout(() => this.showHint(), after * 1000);
    }
    this.publishUndo();
  }

  private leaveStep() {
    const step = this.step;
    if (step && !this.reviewing.value) {
      const ctx = this.context();
      if (ctx) step.onExit?.(ctx);
    }
    this.stepUnsubs.forEach((u) => u());
    this.stepUnsubs = [];
    this._clearTimeout(this.satisfiedTimer);
    this._clearTimeout(this.advanceTimer);
    this._clearTimeout(this.hintTimer);
    this._clearTimeout(this.readingTimer);
    this._clearTimeout(this.aheadTimer);
    this.satisfiedTimer = this.advanceTimer = this.hintTimer = this.readingTimer = this.aheadTimer = undefined;
    this.advanceWhenNarrationEnds = false;
    this.readingActive = false;
    this.readingPausedAt = undefined;
    this.narration?.stop();
    this.narrating.value = false;
  }

  private restoreAi() {
    if (this.ai && this.aiEnabledBeforePause !== undefined) {
      this.ai.enabled = this.aiEnabledBeforePause;
      this.aiEnabledBeforePause = undefined;
    }
  }

  private finish(end: "continue" | "back", skipped = false) {
    this.leaveStep();
    this.stopFastForward();
    // The game is the player's now: show it as it is
    this.releasePoses(true);
    this.releaseTimeline();
    this.restoreAi();
    this.view.setGuard?.(undefined);
    this.view.setUndo?.(undefined);
    this.runtime && (this.runtime.activeStep.value = "done");
    this.focus.value = [];
    this.hint.value = undefined;
    this.status.value = "done";
    if (!skipped) {
      this.onEvent?.({ type: "completed", end });
    }
  }

  // ---- narration and cues ------------------------------------------------------------------------

  private startNarration() {
    const step = this.step;
    if (!step) return;
    // Emphasise the first sentence from the start, not once the audio reports its first position
    this.sentence.value = this.sentences.length > 0 ? 0 : -1;
    this._clearTimeout(this.readingTimer);
    this.readingActive = false;
    this.readingPausedAt = undefined;
    this.narration?.stop();
    this.appliedCues = new Set();
    this.narrationEnded = false;
    this.applyCuesAt(0);

    const useAudio = !!step.audio && !!this.narration && !this.muted.value;
    // While this step talks, the next one's recording loads
    if (useAudio) this.preloadStep(this.index.value + 1);
    if (useAudio && this.narration) {
      const narration = this.narration;
      this.stepUnsubs.push(narration.onTime((t) => this.onNarrationTime(t)));
      this.stepUnsubs.push(narration.onSentence((i) => this.onSentence(i)));
      this.stepUnsubs.push(
        narration.onEnd(() => {
          this.narrationEnded = true;
          this.narrating.value = false;
          this.applyCuesAt(Number.POSITIVE_INFINITY);
          this.sentence.value = this.emphasisAfterNarration();
          this.afterNarration();
        }),
      );
      this.narrating.value = true;
      narration.play({ audio: step.audio!, text: step.text, sentences: this.sentences }).catch(() => {
        this.narrating.value = false;
        this.startReadingClock();
      });
    } else {
      this.startReadingClock();
    }
  }

  /** Without audio, time flows at the reading speed so `at` cues and emphasis still happen. */
  private startReadingClock() {
    const step = this.step;
    if (!step) return;
    const words = step.text.split(/\s+/).filter((w) => w).length;
    // In "reading seconds" (normal speed); the clock below advances `rate` of them per real second
    const duration = Number.isFinite(this.readingSpeed) ? Math.max(1, words / this.readingSpeed) : 0;
    this.readingStartedAt = this._now();
    this.readingPausedAt = undefined;
    this.readingActive = true;
    this.narrating.value = true;
    const tick = () => {
      if (this.readingPausedAt !== undefined) {
        this.readingTimer = this._setTimeout(tick, 100);
        return;
      }
      const t = ((this._now() - this.readingStartedAt) / 1000) * this.rate.value;
      this.onNarrationTime(t, duration);
      if (t >= duration) {
        this.readingActive = false;
        this.narrating.value = false;
        this.sentence.value = this.emphasisAfterNarration();
        this.narrationEnded = true;
        this.applyCuesAt(Number.POSITIVE_INFINITY);
        this.afterNarration();
        return;
      }
      this.readingTimer = this._setTimeout(tick, 100);
    };
    tick();
  }

  /** A "do it" step whose check passed while it was still narrating */
  private advanceWhenNarrationEnds = false;

  private scheduleSatisfiedAdvance() {
    this._clearTimeout(this.satisfiedTimer);
    if (this.fastForwardTarget.value !== undefined) {
      // Fast-forwarding moves on once the board settles, so a check that passed in passing is re-read
      this.scheduleFastBeat();
      return;
    }
    this.satisfiedTimer = this._setTimeout(
      () => {
        // The player just did what the step asked: that is as explicit as pressing Play
        this.paused.value = false;
        this.next();
      },
      this.satisfiedDelayMs,
    );
  }

  /**
   * Which sentence stays emphasised once the narration ends. A step about to move on by itself keeps
   * its last sentence lit through the short beat before the next step, rather than flashing the whole
   * paragraph back to full strength; a step that stays on screen shows the whole paragraph to read.
   */
  private emphasisAfterNarration(): number {
    const step = this.step;
    if (!step || this.paused.value || this.status.value === "done") return -1;
    const movesOn =
      (this.advanceWhenNarrationEnds && this.status.value === "satisfied") ||
      (!step.waitFor && !step.pause && !this.isLast);
    return movesOn ? this.sentences.length - 1 : -1;
  }

  /** The step's narration (or reading clock) just ended */
  private afterNarration() {
    this.scheduleAutoAdvance();
    if (this.advanceWhenNarrationEnds && this.status.value === "satisfied") {
      this.advanceWhenNarrationEnds = false;
      this.scheduleSatisfiedAdvance();
    }
  }

  /**
   * A narration step moves on by itself once its narration (or reading clock) ends, unless it sets
   * `pause`. "Do it" steps wait for their check and the last step waits for Finish.
   */
  private scheduleAutoAdvance() {
    const step = this.step;
    // Reviewing (Back without a game to rewind) flows too once the player presses Play
    if (!step || step.waitFor || step.pause || this.isLast || this.status.value === "done") return;
    if (this.paused.value) return;
    this._clearTimeout(this.advanceTimer);
    this.advanceTimer = this._setTimeout(() => {
      if (this.step === step && this.status.value === "narrating" && !this.paused.value) this.next();
    }, this.autoAdvanceDelayMs);
  }

  private onNarrationTime(t: number, estimatedDuration?: number) {
    this.narrationTime.value = t;
    this.applyCuesAt(t);
    // Sentence emphasis: explicit times, else proportional to the (estimated) duration
    const step = this.step;
    if (!step || this.sentences.length === 0) return;
    const times = step.sentenceTimes;
    if (times && times.length > 0) {
      let i = 0;
      while (i + 1 < times.length && times[i + 1] <= t) i++;
      this.sentence.value = i;
    } else if (!this.narration?.onSentence || this.muted.value || !step.audio) {
      const duration = estimatedDuration ?? this.narration?.duration;
      if (duration && duration > 0) {
        const total = this.sentences.reduce((a, s) => a + s.length, 0);
        let acc = 0;
        let i = 0;
        for (; i < this.sentences.length; i++) {
          acc += this.sentences[i].length;
          if ((t / duration) * total < acc) break;
        }
        this.sentence.value = Math.min(i, this.sentences.length - 1);
      }
    }
  }

  private onSentence(i: number) {
    this.sentence.value = i;
    this.applySentenceCues(i);
  }

  private cueTime(cue: Cue<P, R>): number | undefined {
    if (typeof cue.at === "number") return cue.at;
    const step = this.step;
    const times = step?.sentenceTimes;
    if (times && times[cue.at.sentence] !== undefined) return times[cue.at.sentence];
    // Proportional estimate when the narration has a known or estimated duration
    const duration = this.narration?.duration;
    if (step && duration && this.sentences.length) {
      const total = this.sentences.reduce((a, s) => a + s.length, 0);
      const before = this.sentences.slice(0, cue.at.sentence).reduce((a, s) => a + s.length, 0);
      return (before / total) * duration;
    }
    return undefined;
  }

  private applyCue(i: number, cue: Cue<P, R>) {
    if (this.appliedCues.has(i)) return;
    this.appliedCues.add(i);
    if (cue.focus) this.focus.value = cue.focus;
    if (cue.box && cue.box.anchor !== "keep") this.box.value = cue.box;
    if (cue.gallery) this.applyGallery(cue.gallery);
    if (cue.pose) this.applyPoses(cue.pose);
    if (cue.timeline) this.applyTimeline(cue.timeline);
  }

  /** Whether a gallery the script opened may still be showing (Back closes it) */
  private scriptOpenedGallery = false;

  private applyGallery(command: GalleryCommand<P, R>) {
    if (!this.view.setGallery) return;
    const opened = this.view.setGallery(command);
    if (command === "close") this.scriptOpenedGallery = false;
    else if (opened) this.scriptOpenedGallery = true;
  }

  private applyCuesAt(t: number) {
    const step = this.step;
    if (!step?.cues) return;
    step.cues.forEach((cue, i) => {
      if (typeof cue.at === "number") {
        if (cue.at <= t) this.applyCue(i, cue);
      } else if (t === Number.POSITIVE_INFINITY) {
        this.applyCue(i, cue);
      } else {
        const at = this.cueTime(cue);
        if (at !== undefined && at <= t) this.applyCue(i, cue);
        else if (at === undefined && this.readingTimer && this.sentences.length) {
          // reading clock, no durations: use sentence index from emphasis
          if (this.sentence.value >= cue.at.sentence) this.applyCue(i, cue);
        }
      }
    });
  }

  private applySentenceCues(sentence: number) {
    const step = this.step;
    step?.cues?.forEach((cue, i) => {
      if (typeof cue.at !== "number" && cue.at.sentence <= sentence) this.applyCue(i, cue);
    });
  }

  // ---- doing it for the player --------------------------------------------------------------------

  /**
   * Makes the move the live "do it" step is waiting for, as if the player had: the first entry of its
   * `allow` (in the order written) that the prompt can take, or the UI control an entry names. For
   * watching and testing a tutorial without playing it every time. Returns whether it did anything.
   */
  public doItForMe(): boolean {
    if (this.disposed || this.rewinding.value || this.reviewing.value) return false;
    const step = this.step;
    if (!step?.waitFor || this.status.value !== "waiting") return false;
    const prompt = this.view.prompt();
    const answer = scriptedAnswer(step.allow, prompt, this.view.root(), this.view.me());
    if (!answer) return false;
    if ("ui" in answer) return this.view.pressUi?.(answer.ui) ?? false;
    if (!prompt) return false;
    prompt.resolvePick(answer.move.pick, answer.move.value);
    return true;
  }

  /** The → key: Next when the step can move on, otherwise the step's move made for the player */
  public forward() {
    if (this.canAdvance) this.next();
    else this.doItForMe();
  }

  /**
   * Plays on to a later step as fast as it can: narration skipped, the board's animations rushed, the
   * player's moves made for them (see `doItForMe`) and the bots playing as scripted. The step it lands
   * on plays as usual. Back, Pause or jumping elsewhere stops it.
   */
  public fastForwardTo(index: number) {
    if (this.disposed || this.rewinding.value || this.status.value === "done") return;
    if (index <= this.index.value || index >= this.spec.steps.length) return;
    if (this.reviewing.value) {
      // From a review (Back without a game history): carry on from the live step
      this.enter(this.frontier.value);
      if (index <= this.index.value) return;
    }
    this.fastForwardTarget.value = index;
    this.view.setFastForward?.(true);
    this.releaseTimeline();
    this.paused.value = false;
    this.applyAi();
    // The step on screen stops talking and moves on (or gets its move made)
    this.narration?.stop();
    this._clearTimeout(this.readingTimer);
    this.readingActive = false;
    this.narrating.value = false;
    this.advanceWhenNarrationEnds = false;
    if (this.status.value === "satisfied") this.scheduleSatisfiedAdvance();
    this.scheduleFastBeat();
  }

  private fastTimer: any;
  private fastWatchdog: any;

  /** The next beat of a fast-forward: move on from a talking step, or make a waiting step's move */
  private scheduleFastBeat() {
    this._clearTimeout(this.fastTimer);
    this._clearTimeout(this.fastWatchdog);
    let settledSince: number | undefined;
    const beat = () => {
      this.fastTimer = undefined;
      if (this.fastForwardTarget.value === undefined) return;
      // Wait for the board to catch up and stay caught up: a prompt can arrive just after its clock
      if (this.view.settled?.() === false) settledSince = undefined;
      else settledSince ??= this._now();
      if (settledSince === undefined || this._now() - settledSince < FAST_SETTLE_MS) {
        this.fastTimer = this._setTimeout(beat, FAST_BEAT_MS);
        return;
      }
      this.evaluate();
      if (this.status.value === "narrating" || this.status.value === "satisfied") this.next();
      else if (this.status.value === "waiting") this.doItForMe();
    };
    this.fastTimer = this._setTimeout(beat, FAST_BEAT_MS);
    // A step that never gets anywhere (its move is not on offer, the bots never finish) ends it
    this.fastWatchdog = this._setTimeout(() => {
      const step = this.step;
      console.warn(`[tutorial ${this.spec.id}] fast-forward gave up on step "${step?.id}"`);
      this.stopFastForward();
      if (step) this.beginNarration();
    }, FAST_GIVE_UP_MS);
  }

  private stopFastForward() {
    this._clearTimeout(this.fastTimer);
    this._clearTimeout(this.fastWatchdog);
    this.fastTimer = this.fastWatchdog = undefined;
    if (this.fastForwardTarget.value === undefined) return;
    this.fastForwardTarget.value = undefined;
    this.view.setFastForward?.(false);
  }

  // ---- poses -------------------------------------------------------------------------------------

  /** Chits the script changed in the player's view, with the step that changed them */
  private posed = new Map<Chit, { keep: boolean; step: number }>();

  private applyPoses(poses: Pose<P, R>[]) {
    const root = this.view.root();
    const me = this.view.me();
    // Passing through on a fast-forward: the next step would only put them back
    if (!root || !me || !this.view.pose || this.fastForwardTarget.value !== undefined) return;
    for (const pose of poses) {
      for (const chit of selectChits<P, R>(pose.chit, root, me)) {
        const set = pose.set;
        if (!set) {
          this.releasePose(chit);
          continue;
        }
        try {
          this.view.pose(chit, (c) => (typeof set === "function" ? set(c) : Object.assign(c, set)));
        } catch (e) {
          console.error(`[tutorial ${this.spec.id}] a pose in step "${this.step?.id}" threw`, e);
        }
        this.posed.set(chit, { keep: !!pose.keep, step: this.index.value });
      }
    }
  }

  private releasePose(chit: Chit) {
    if (!this.posed.delete(chit)) return;
    try {
      this.view.unpose?.(chit);
    } catch (e) {
      console.error(`[tutorial ${this.spec.id}] putting a posed chit back threw`, e);
    }
  }

  /**
   * Puts posed chits back: all of them, or (on entering a step) those an earlier step posed for its
   * own length. A step that poses the same chit again keeps it posed without a flicker in between.
   */
  private releasePoses(all: boolean) {
    for (const [chit, p] of [...this.posed]) {
      if (all || (!p.keep && p.step !== this.index.value)) this.releasePose(chit);
    }
  }

  // ---- the board's timeline ----------------------------------------------------------------------

  /** A `{ until }` command still playing toward its moment, and where its log lines start */
  private timelineUntil?: { check: Checker<P, R>; logFrom: number };

  private applyTimeline(command: TimelineCommand<P, R>) {
    const timeline = this.view.timeline;
    // Looking back at a step's text leaves the board alone, as it does the game and the bots
    // A fast-forward lets the board play; the step it lands on holds it again
    if (!timeline || this.reviewing.value || this.fastForwardTarget.value !== undefined) return;
    this.timelineUntil = undefined;
    if (command === "play") {
      this.holdTimeline(undefined);
    } else if (command === "hold") {
      this.holdTimeline(timeline.at());
    } else if ("advance" in command) {
      this.holdTimeline(timeline.at() + Math.max(0, Math.floor(command.advance)));
    } else {
      const ctx = this.context();
      if (ctx) command.until.reset?.(ctx);
      this.timelineUntil = { check: command.until, logFrom: this.recentLog.length };
      this.holdTimeline(undefined);
      this.checkTimelineUntil();
    }
  }

  /** Stops the board at the first moment that passes a pending `{ until }` command */
  private checkTimelineUntil() {
    const until = this.timelineUntil;
    if (!until || !this.view.timeline) return;
    const ctx = this.context();
    if (!ctx) return;
    let passed = false;
    try {
      passed = until.check({ ...ctx, recentLog: this.recentLog.slice(until.logFrom) }) === true;
    } catch (e) {
      console.error(`[tutorial ${this.spec.id}] a timeline "until" check in step "${this.step?.id}" threw`, e);
    }
    if (!passed) return;
    this.timelineUntil = undefined;
    // Change events arrive once the moment has loaded and before the board moves on from it
    this.holdTimeline(this.view.clock());
  }

  private holdTimeline(clock: number | undefined) {
    this.timelineHold.value = clock;
    this.view.timeline?.hold(clock);
  }

  private releaseTimeline() {
    this.timelineUntil = undefined;
    if (this.timelineHold.value !== undefined) this.holdTimeline(undefined);
  }

  // ---- checks ------------------------------------------------------------------------------------

  private onViewChange() {
    if (this.disposed) return;
    const latest = this.view.latestLog();
    if (latest !== undefined && latest !== this.lastLog) {
      this.recentLog.push(latest);
      this.lastLog = latest;
    }
    this.boardClock.value = this.view.clock();
    this.checkTimelineUntil();
    this.evaluate();
    // Fast-forwarding through a "do it" step: make the move as soon as the prompt offers it
    if (this.fastForwardTarget.value !== undefined && this.status.value === "waiting") this.doItForMe();
  }

  private evaluate() {
    const step = this.step;
    if (!step || this.status.value === "done" || this.reviewing.value) return;
    if (!step.waitFor) {
      this.check.value = undefined;
      return;
    }
    const ctx = this.context();
    if (!ctx) return;
    let result: boolean | string;
    try {
      result = step.waitFor(ctx);
    } catch (e) {
      console.error(`[tutorial ${this.spec.id}] waitFor of step "${step.id}" threw`, e);
      result = false;
    }
    this.check.value = result;
    if (result === true) {
      if (this.status.value !== "satisfied") {
        this.status.value = "satisfied";
        this.hint.value = undefined;
        this._clearTimeout(this.hintTimer);
        this._clearTimeout(this.satisfiedTimer);
        this.onEvent?.({ type: "satisfied", stepId: step.id });
        // Let the step finish what it is saying first; Next still moves on straight away
        if (this.narrating.value) this.advanceWhenNarrationEnds = true;
        else this.scheduleSatisfiedAdvance();
      }
    } else if (this.status.value === "satisfied") {
      // Un-satisfied again (an undo): keep waiting
      this._clearTimeout(this.satisfiedTimer);
      this.advanceWhenNarrationEnds = false;
      this.status.value = "waiting";
    }
  }

  private showHint() {
    const step = this.step;
    if (!step || this.status.value !== "waiting") return;
    const configured = typeof step.hint === "object" ? step.hint.text : step.hint;
    const fromCheck = typeof this.check.value === "string" ? this.check.value : undefined;
    this.hint.value = fromCheck ?? configured;
    // keep the hint fresh as the check's reason changes
    this.hintTimer = this._setTimeout(() => this.showHint(), 1000);
  }
}
