import { Chit } from "../Chit";
import { ClockDetails } from "../ClockDetails";
import { Connection } from "../Connection";
import { ConnectionObject } from "../ConnectionObject";
import { Game } from "../Game";
import { Confirm, GameButton } from "../GameButton";
import { PickSerialization, PickType } from "../Pick";
import { PlayerChit } from "../PlayerChit";
import { PromptSerialization } from "../Prompt";
import { RootChit } from "../RootChit";
import { ServerPrompts } from "../serverTransport/ServerPrompts";
import type { AiView } from "./AiLiveView";
import {
  AiContext,
  AiOption,
  AiPickInfo,
  AiRule,
  NormalizedScore,
  applyPlan,
  chooseIndex,
  chooseSoftmax,
  chooseWeighted,
  createRandom,
  hashString,
  normalizeScore,
} from "./defineAi";

/**
 * Where a bot keeps its plan memory between prompts. `connectAiPlayer` defaults to a store inside the
 * match's saved state, so memory survives a reload or a re-seat in another process. Pass your own to
 * keep it elsewhere, or `false` for in-process only.
 */
export type AiMemoryStore<M = any> = {
  read(): M | undefined;
  write(memory: M): void;
};

export type AiPlayerOptions = {
  /** 0–1. Lower values add more noise to scores so the bot plays less predictably. Default 0.85 */
  difficulty?: number;
  /** Pause before answering, in ms: a fixed value or a [min, max] range. Default 0 */
  thinkMs?: number | [number, number];
  /** Seed for the bot's random number generator */
  seed?: number;
  /** Log untagged prompts and warnings to the console. Default true */
  log?: boolean;
  /** Warn if the server hasn't answered within this many ms after the bot responds. Default 10000 */
  stallWarningMs?: number;
  /** Anything the game's rules should read as `ctx.params`: per-seat weights, a personality, … */
  params?: unknown;
  /**
   * Choose by softmax over scores at this temperature, in score units (1 = an option worth one
   * point less is chosen e≈2.7× less often). Replaces the `difficulty` noise, which scales with
   * the spread of each prompt's scores. Unset: use `difficulty`.
   */
  temperature?: number;
  /**
   * Override the choice: return the index into `scored` to take, undefined for the normal choice,
   * or null to leave the prompt unanswered for now (call `recheck()` when that may have changed).
   * Consulted for every prompt, the engine's Confirm included. For harnesses (forced moves in
   * playouts, scripted openings, tutorials), not for game rules.
   */
  choose?: (
    scored: { option: AiOption; score: number }[],
    ctx: AiContext<any, any, any>,
  ) => number | null | undefined;
  /**
   * While this returns true for the current prompt, the bot leaves it unanswered (call `recheck()`
   * when that may have changed). For harnesses that hold a bot back, like a tutorial waiting for the
   * step that scripts its next move. It sees the prompt so it can let some through (the engine's own
   * Confirm, which ends a turn the script never mentions).
   */
  hold?: (prompt: PromptSerialization) => boolean;
  /** Called after every decision with each option's score and the chosen index (for logging and audits). */
  onDecision?: (decision: AiDecision) => void;
  /**
   * Where plan memory is kept (see `AiMemoryStore`). `connectAiPlayer` defaults this to the match's
   * saved state; `false` keeps memory in-process only, so it resets whenever the bot is re-seated.
   */
  memoryStore?: AiMemoryStore | false;
  /** Start paused (see `setEnabled`). Default false */
  disabled?: boolean;
};

/** One decision, as reported to `AiPlayerOptions.onDecision`. */
export type AiDecision = {
  playerId: string;
  prompt: { message?: string; help?: string };
  scored: { option: AiOption; score: number }[];
  chosen: number;
  /** The context the rules saw (its `view` is live in the default view mode: read it now, don't keep it) */
  ctx: AiContext<any, any, any>;
};

export type AiPlayerStats = {
  promptsAnswered: number;
  stepBacks: number;
  rejections: number;
  stalls: number;
  ruleErrors: number;
  /** Prompts the bot could not get out of (no valid moves and nothing left to undo) */
  stuck: number;
  /** How often each untagged pick (keyed by its message) was scored without a rule */
  untagged: { [message: string]: number };
};

type QueuedPrompt = { prompt: PromptSerialization; clockDetails?: ClockDetails; seq: number };
type HistoryEntry<M> = { fingerprint: string; choice: string; memoryBefore: M };
type Scored<M> = { option: AiOption } & NormalizedScore<M>;

const MAX_BLIND_STEP_BACKS = 3;
const MAX_EXHAUSTED_VISITS = 3;

/**
 * An AI player, registered as "ClientPrompts" on its own connection (see `connectAiPlayer`).
 *
 * It only has the Game (for its rules and chit library) and its view of the board: by default the
 * match's live objects (AiLiveView), or, when the game asks for it, exactly what the server sends
 * its seat (AiPlayerView).  Create one with `connectAiPlayer`.
 *
 * @group AI
 */
export class AiClientPrompts<P extends PlayerChit, R extends RootChit<P>, M = any> extends ConnectionObject {
  private serverPrompts: ServerPrompts<P, R>;
  private latest?: QueuedPrompt;
  private seq = 0;
  private handledSeq = -1;
  private running = false;
  private disposed = false;
  private _stalled = false;
  private _enabled = true;
  private memoryStore?: AiMemoryStore<M>;

  private memory: M;
  private history: HistoryEntry<M>[] = [];
  private dead = new Map<string, Set<string>>();
  private exhaustedVisits = new Map<string, number>();
  private blindStepBacks = 0;
  private warned = new Set<string>();
  private random: () => number;

  public stats: AiPlayerStats = {
    promptsAnswered: 0,
    stepBacks: 0,
    rejections: 0,
    stalls: 0,
    ruleErrors: 0,
    stuck: 0,
    untagged: {},
  };

  /** @internal */
  constructor(
    private playerId: string,
    connection: Connection,
    private game: Game<P, R>,
    private view: AiView,
    private options: AiPlayerOptions = {},
  ) {
    super();
    this.serverPrompts = connection.get<ServerPrompts<P, R>>("ServerPrompts");
    this.random = createRandom(options.seed);
    this.memoryStore = options.memoryStore || undefined;
    this._enabled = !options.disabled;
    this.memory = deepFreeze(this.loadMemory());
  }

  override dispose() {
    this.disposed = true;
    super.dispose();
  }

  /** The bot's current (frozen) memory, for debugging and tests */
  public get memorySnapshot(): Readonly<M> {
    return this.memory;
  }

  /** True when the bot is not working on anything */
  public get idle() {
    return !this.running;
  }

  /** False while paused: prompts are kept but not answered (see `setEnabled`) */
  public get enabled() {
    return this._enabled;
  }

  /**
   * Pause or resume the bot without losing its memory. While paused it still receives prompts and
   * answers the latest one when resumed. Hosts use this to make sure only one copy of a match drives
   * its bots when several copies exist (every browser tab in client-trust mode, or two bundle
   * versions of one match on a server). On resume the memory is re-read from the store, since
   * another copy may have moved the plan on.
   */
  public setEnabled(enabled: boolean) {
    if (this._enabled === enabled) {
      return;
    }
    this._enabled = enabled;
    if (enabled) {
      this.memory = deepFreeze(this.loadMemory());
      this.history = [];
      this.handledSeq = -1;
      void this.pump();
    }
  }

  private loadMemory(): M {
    const stored = this.memoryStore?.read();
    if (stored !== undefined) {
      return stored;
    }
    return (this.game.ai?.initialMemory?.() ?? {}) as M;
  }

  /** Commits new memory and mirrors it to the store so it survives a reload. */
  private setMemory(memory: M) {
    this.memory = deepFreeze(memory);
    try {
      this.memoryStore?.write(this.memory);
    } catch (e) {
      this.warnOnce("memoryStore", "could not persist memory", e);
    }
  }

  /** True while an answer has been sent but the server has not reacted within `stallWarningMs` */
  public get stalled() {
    return this._stalled;
  }

  /** @internal Called by ServerPrompts for every player's prompt changes */
  public async setPromptForPlayer(playerId: string, prompt?: PromptSerialization, clockDetails?: ClockDetails) {
    if (playerId !== this.playerId || this.disposed) {
      return;
    }
    this.seq++;
    this.latest = prompt ? { prompt, clockDetails, seq: this.seq } : undefined;
    void this.pump();
  }

  private async pump() {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      while (
        this.latest &&
        this.latest.seq !== this.handledSeq &&
        !this.disposed &&
        this._enabled &&
        !this.options.hold?.(this.latest.prompt)
      ) {
        const current = this.latest;
        this.handledSeq = current.seq;
        try {
          await this.handle(current);
        } catch (e) {
          if (!this.disposed) {
            console.error(`[AI ${this.playerId}] failed to handle prompt "${current.prompt.id}"`, e);
          }
        }
        if (!this._enabled && this.latest?.seq === current.seq) {
          // Paused mid-prompt: leave it unanswered, and answer it when resumed
          this.handledSeq = -1;
        }
      }
    } finally {
      this.running = false;
    }
  }

  /** Seq of a prompt `choose` chose to leave unanswered */
  private heldSeq = -1;

  /**
   * Looks at the current prompt again: answers it if `hold` no longer holds the bot and `choose` no
   * longer leaves it unanswered. Does nothing to a prompt the bot already answered.
   */
  public recheck() {
    if (this.disposed) return;
    if (this.latest && this.heldSeq === this.latest.seq) {
      this.heldSeq = -1;
      this.handledSeq = -1;
    }
    void this.pump();
  }

  private isCurrent(entry: QueuedPrompt) {
    return !this.disposed && this._enabled && this.latest?.seq === entry.seq;
  }

  private async handle(entry: QueuedPrompt) {
    const { prompt } = entry;

    if (!prompt.canReset) {
      // Nothing before this prompt can be undone (rng, player switch, start of game)
      this.history = [];
    }

    await this.view.sync(entry.clockDetails?.clock);
    if (!this.isCurrent(entry)) {
      return;
    }

    if (prompt.type === "NoValidMovesPrompt") {
      await this.backtrack(prompt, "no valid moves");
      return;
    }
    if (prompt.type !== "PickPrompt") {
      return;
    }

    const fingerprint = this.fingerprint(prompt, this.view.signature);
    if (!prompt.canReset) {
      this.pruneDeadEndsExcept(fingerprint);
    }

    const options = this.enumerate(prompt);
    if (options.length === 0) {
      this.warnOnce(
        `empty:${prompt.id}`,
        `could not map any options for "${promptMessage(prompt)}"; answering blindly`,
      );
      await this.answerBlindly(prompt);
      return;
    }

    const dead = this.dead.get(fingerprint);
    let live = dead ? options.filter((o) => !dead.has(choiceKey(o))) : options;
    if (live.length === 0) {
      const visits = (this.exhaustedVisits.get(fingerprint) ?? 0) + 1;
      this.exhaustedVisits.set(fingerprint, visits);
      if (prompt.canReset && this.history.length > 0) {
        await this.backtrack(prompt, "every option leads to a dead end");
        return;
      }
      if (visits > MAX_EXHAUSTED_VISITS) {
        this.stats.stuck++;
        console.error(
          `[AI ${this.playerId}] stuck at "${promptMessage(prompt)}": every option leads to no valid moves and it cannot undo further. Giving up on this prompt.`,
        );
        return;
      }
      this.warnOnce(`exhausted:${fingerprint}`, `every option at "${promptMessage(prompt)}" failed; retrying anyway`);
      this.dead.delete(fingerprint);
      live = options;
    }

    await this.think();
    if (!this.isCurrent(entry)) {
      return;
    }

    const rejected = new Set<string>();
    for (;;) {
      const candidates = live.filter((o) => !rejected.has(choiceKey(o)));
      if (candidates.length === 0) {
        this.stats.stuck++;
        console.error(`[AI ${this.playerId}] the server rejected every option for "${promptMessage(prompt)}"`);
        return;
      }

      const chosen = this.choose(prompt, candidates);
      if (!chosen) {
        // The harness wants this prompt left alone for now (see `recheck`)
        this.heldSeq = entry.seq;
        return;
      }
      const memoryBefore = this.memory;
      // Written before the answer is sent, so the save that follows the answer carries it
      this.setMemory(applyPlan(memoryBefore, chosen.plan));

      const result = await this.withStallWarning(
        this.serverPrompts.resolvePrompt(prompt.id, chosen.option.response),
        prompt,
      );

      if (result && result.id === prompt.id) {
        // ServerPrompts rejected the answer and sent the same prompt back
        this.setMemory(memoryBefore);
        this.stats.rejections++;
        rejected.add(choiceKey(chosen.option));
        continue;
      }

      this.history.push({ fingerprint, choice: choiceKey(chosen.option), memoryBefore });
      this.stats.promptsAnswered++;
      this.blindStepBacks = 0;
      return;
    }
  }

  /** Lists every legal answer to the prompt, with chits taken from this player's view. */
  private enumerate(prompt: PromptSerialization): AiOption[] {
    const picks: PickSerialization[] = prompt.details?.picks ?? [];
    const find = this.view.findChit;
    const options: AiOption[] = [];

    picks.forEach((sp, idx) => {
      const pick: AiPickInfo = {
        index: idx,
        type: sp.type,
        message: sp.message,
        help: sp.help,
        context: sp.context ? find(sp.context) : undefined,
      };
      const base = { key: sp.ai?.k, data: sp.ai?.d, pick };

      switch (sp.type) {
        case "ChitPick": {
          (sp.details.c as string[]).forEach((id) => {
            const chit = find(id);
            if (chit) {
              options.push({ ...base, kind: "chit", chit, response: response(idx, "ChitPick", id) });
            }
          });
          break;
        }
        case "DragPick": {
          const seen = new Set<string>();
          const targets = (sp.details.d as string[][]).flat();
          (sp.details.c as string[]).forEach((chitId) => {
            const chit = find(chitId);
            targets.forEach((targetChitId) => {
              const target = find(targetChitId);
              const k = `${chitId}->${targetChitId}`;
              if (chit && target && !seen.has(k)) {
                seen.add(k);
                options.push({
                  ...base,
                  kind: "drag",
                  chit,
                  target,
                  response: response(idx, "DragPick", { chitId, targetChitId }),
                });
              }
            });
          });
          break;
        }
        case "ButtonPick": {
          const buttonType = sp.details?.__buttonType as string | undefined;
          pick.buttonType = buttonType;
          options.push({
            ...base,
            kind: "button",
            button: this.makeButton(buttonType, sp.details),
            response: response(idx, "ButtonPick", null),
          });
          break;
        }
      }
    });

    return options;
  }

  private makeButton(buttonType: string | undefined, details: any): GameButton {
    const ButtonType =
      (buttonType && this.game.buttonLibrary?.[buttonType]) || (buttonType === "Confirm" ? Confirm : undefined);
    const button = ButtonType ? new ButtonType() : new GameButton();
    try {
      button.deserialize(details, (id: string) => this.view.findChit(id) as Chit);
    } catch {
      // the button is informational only; a failed deserialize shouldn't stop the bot
    }
    return button;
  }

  private choose(prompt: PromptSerialization, candidates: AiOption[]): Scored<M> | null {
    const ai = this.game.ai;
    const rules: { [key: string]: AiRule<P, R, M> } = (ai?.rules as any) ?? {};
    const defaultRule = ai?.default as AiRule<P, R, M> | undefined;
    const ruleFor = (o: AiOption) => (o.key ? rules[o.key] : undefined) ?? defaultRule;

    const root = this.view.root as R;
    const ctx: AiContext<P, R, M> = {
      view: root,
      me: root?.players.find((p) => p.id === this.playerId) as P,
      options: candidates,
      prompt: { message: promptMessage(prompt), help: prompt.details?.help },
      random: this.random,
      memory: this.memory,
      find: this.view.findChit,
      params: this.options.params,
    };

    if (!candidates.some((o) => ruleFor(o))) {
      // No rule applies (an untagged pick, or the engine's own Confirm): the harness still decides
      candidates.forEach((o) => this.noteUntagged(o));
      const unscored: Scored<M>[] = candidates.map((option) => ({ option, score: 0 }));
      const forced = this.options.choose?.(unscored, ctx);
      if (forced === null) return null;
      if (forced !== undefined && forced >= 0 && forced < unscored.length) {
        this.options.onDecision?.({ playerId: this.playerId, prompt: ctx.prompt, scored: unscored, chosen: forced, ctx });
        return unscored[forced];
      }
      return { option: this.chooseLegacy(prompt, candidates), score: 0 };
    }

    const scored: Scored<M>[] = candidates.map((option) => {
      const rule = ruleFor(option);
      if (!rule) {
        this.noteUntagged(option);
        return { option, score: 0 };
      }
      try {
        return { option, ...normalizeScore(rule(option, ctx)) };
      } catch (e) {
        this.stats.ruleErrors++;
        this.warnOnce(`rule:${option.key ?? "default"}`, `rule "${option.key ?? "default"}" threw; scoring 0`, e);
        return { option, score: 0 };
      }
    });

    const scores = scored.map((s) => s.score);
    const forced = this.options.choose?.(scored, ctx);
    if (forced === null) return null;
    let index = forced;
    if (index === undefined || index < 0 || index >= scored.length) {
      const temperature = this.options.temperature ?? this.game.ai?.temperature;
      index =
        temperature !== undefined
          ? chooseSoftmax(scores, temperature, this.random)
          : chooseIndex(scores, 1 - clamp(this.options.difficulty ?? 0.85, 0, 1), this.random);
    }
    this.options.onDecision?.({ playerId: this.playerId, prompt: ctx.prompt, scored, chosen: index, ctx });
    return scored[index];
  }

  /**
   * The old demo behaviour, which games tune with `Game.demoPickWeight`: choose a pick weighted by
   * (number of choices × demoPickWeight), then an option within it uniformly.  For a DragPick the
   * DragTarget group is chosen uniformly first, so splitting targets into groups steers drops.
   */
  private chooseLegacy(prompt: PromptSerialization, candidates: AiOption[]): AiOption {
    const picks: PickSerialization[] = prompt.details?.picks ?? [];
    const pickIndexes = [...new Set(candidates.map((o) => o.pick.index))];
    const weights = pickIndexes.map((i) => {
      const multiplier = this.game.demoPickWeight ? this.game.demoPickWeight(picks, picks[i]) : 1;
      return pickWeight(picks[i]) * multiplier;
    });
    const chosen = pickIndexes[chooseWeighted(weights, this.random)];
    const inPick = candidates.filter((o) => o.pick.index === chosen);
    const pickRandom = <T>(items: T[]) => items[Math.floor(this.random() * items.length)];

    const sp = picks[chosen];
    if (sp?.type === "DragPick") {
      const groups = (sp.details.d as string[][]).filter((g) => g.length > 0);
      if (groups.length > 0) {
        const targetId = pickRandom(pickRandom(groups));
        const matching = inPick.filter((o) => o.kind === "drag" && o.target.id === targetId);
        if (matching.length > 0) {
          return pickRandom(matching);
        }
      }
    }
    return pickRandom(inPick);
  }

  /** Last resort when no options could be mapped to chits in the view. */
  private async answerBlindly(prompt: PromptSerialization) {
    const picks: PickSerialization[] = prompt.details?.picks ?? [];
    if (picks.length === 0) {
      return;
    }
    const idx = Math.floor(this.random() * picks.length);
    const sp = picks[idx];
    const pickRandom = <T>(items: T[]) => items[Math.floor(this.random() * items.length)];
    let value: any = null;
    if (sp.type === "ChitPick") {
      value = pickRandom(sp.details.c);
    } else if (sp.type === "DragPick") {
      value = { chitId: pickRandom(sp.details.c), targetChitId: pickRandom((sp.details.d as string[][]).flat()) };
    }
    await this.withStallWarning(this.serverPrompts.resolvePrompt(prompt.id, response(idx, sp.type, value)), prompt);
    this.stats.promptsAnswered++;
  }

  /** Undo the bot's last answer, remembering it as a dead end for that exact situation. */
  private async backtrack(prompt: PromptSerialization, reason: string) {
    if (!prompt.canReset) {
      this.stats.stuck++;
      console.error(`[AI ${this.playerId}] ${reason} at "${promptMessage(prompt)}" and nothing can be undone`);
      return;
    }

    const last = this.history.pop();
    if (last) {
      const dead = this.dead.get(last.fingerprint) ?? new Set<string>();
      dead.add(last.choice);
      this.dead.set(last.fingerprint, dead);
      this.setMemory(last.memoryBefore);
    } else {
      // We don't know what we're undoing (e.g. the bot was reconnected), so cap blind undos
      if (++this.blindStepBacks > MAX_BLIND_STEP_BACKS) {
        this.stats.stuck++;
        console.error(`[AI ${this.playerId}] ${reason}; giving up after ${MAX_BLIND_STEP_BACKS} blind undos`);
        return;
      }
    }

    this.stats.stepBacks++;
    await this.serverPrompts.stepBackPrompt(false);
  }

  private fingerprint(prompt: PromptSerialization, viewSignature: string) {
    return hashString(`${JSON.stringify(prompt)}|${viewSignature}`);
  }

  private pruneDeadEndsExcept(fingerprint: string) {
    const keep = this.dead.get(fingerprint);
    this.dead.clear();
    if (keep) {
      this.dead.set(fingerprint, keep);
    }
    const visits = this.exhaustedVisits.get(fingerprint);
    this.exhaustedVisits.clear();
    if (visits) {
      this.exhaustedVisits.set(fingerprint, visits);
    }
  }

  private noteUntagged(option: AiOption) {
    if (option.kind === "button" && option.pick.buttonType === "Confirm") {
      return; // engine-inserted confirms don't need rules
    }
    const message = option.pick.message || `(untagged ${option.pick.type})`;
    const isNew = this.stats.untagged[message] === undefined;
    this.stats.untagged[message] = (this.stats.untagged[message] ?? 0) + 1;
    if (isNew && this.game.ai) {
      this.log(`no rule for "${message}"${option.key ? ` (key "${option.key}")` : ""}; scoring it 0`);
    } else if (isNew && !this.warned.has("noai")) {
      this.warned.add("noai");
      this.log("this game has no `ai`; playing at random. Tag picks with .ai(key) and define rules with defineAi()");
    }
  }

  private async think() {
    const t = this.options.thinkMs;
    const ms = Array.isArray(t) ? t[0] + this.random() * Math.max(0, t[1] - t[0]) : (t ?? 0);
    if (ms > 0) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
  }

  /**
   * Awaits the server's reaction to an answer. If it takes longer than `stallWarningMs`, warns and
   * counts a stall, then keeps waiting: the answer is in flight, so the bot cannot know whether it
   * was accepted until the server says so.
   */
  private async withStallWarning<T>(p: Promise<T>, prompt: PromptSerialization): Promise<T> {
    const ms = this.options.stallWarningMs ?? 10000;
    const timer = setTimeout(() => {
      this._stalled = true;
      this.stats.stalls++;
      console.warn(
        `[AI ${this.playerId}] answered "${promptMessage(prompt)}" but the game hasn't changed after ${ms}ms. ` +
          "If that pick's callback can leave state untouched, the match waits forever.",
      );
    }, ms);
    try {
      return await p;
    } finally {
      clearTimeout(timer);
      this._stalled = false;
    }
  }

  private log(message: string) {
    if (this.options.log !== false) {
      console.info(`[AI ${this.playerId}] ${message}`);
    }
  }

  private warnOnce(key: string, message: string, error?: unknown) {
    if (this.warned.has(key)) {
      return;
    }
    this.warned.add(key);
    if (this.options.log !== false) {
      console.warn(`[AI ${this.playerId}] ${message}`, ...(error ? [error] : []));
    }
  }
}

function response(idx: number, pickType: PickType, value: any) {
  return { idx, pickType, value };
}

function choiceKey(option: AiOption) {
  return JSON.stringify(option.response);
}

function pickWeight(sp: PickSerialization | undefined) {
  switch (sp?.type) {
    case "ChitPick":
      return sp.details.c.length;
    case "DragPick":
      return (sp.details.d as string[][]).reduce((sum, targets) => sum + targets.length, 0);
    default:
      return 1;
  }
}

function promptMessage(prompt: PromptSerialization): string {
  if (prompt.details?.message) {
    return prompt.details.message;
  }
  const picks: PickSerialization[] = prompt.details?.picks ?? [];
  return picks
    .map((p) => p.message)
    .filter((m) => m)
    .join(" or ");
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function deepFreeze<T>(value: T): T {
  const isPlain =
    Array.isArray(value) || (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype);
  if (isPlain && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as object).forEach((v) => deepFreeze(v));
  }
  return value;
}
