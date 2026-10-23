import { Chit } from "../Chit";
import { GameButton } from "../GameButton";
import { PickType } from "../Pick";
import { PlayerChit } from "../PlayerChit";
import { RootChit } from "../RootChit";

/** Where an option came from. */
export type AiPickInfo = {
  /** Index of the pick within the prompt */
  index: number;
  type: PickType;
  message?: string;
  help?: string;
  context?: Chit;
  /** Class name of the button, for ButtonPicks (e.g. "Confirm") */
  buttonType?: string;
};

type AiOptionBase = {
  /** The key passed to `.ai(key)` on the pick, if any */
  key?: string;
  /** The data passed to `.ai(key, data)` on the pick, if any */
  data?: unknown;
  pick: AiPickInfo;
  /** @internal */
  response: { idx: number; pickType: PickType; value: any };
};

/** Clicking a chit (from `Chit.pick`). `chit` comes from the AI player's own view of the board. */
export type AiChitOption = AiOptionBase & { kind: "chit"; chit: Chit };
/** Dragging `chit` onto `target` (from `Chit.dragPick`). */
export type AiDragOption = AiOptionBase & { kind: "drag"; chit: Chit; target: Chit };
/** Pressing a button. */
export type AiButtonOption = AiOptionBase & { kind: "button"; button: GameButton };

/** A single legal answer to the current prompt. */
export type AiOption = AiChitOption | AiDragOption | AiButtonOption;

export type AiContext<P extends PlayerChit, R extends RootChit<P>, M> = {
  /**
   * The board exactly as this player sees it: rebuilt from what the server sends this seat, so any
   * property hidden by `hiddenPropertiesForSerialization` is `undefined`.
   */
  view: R;
  /** This player's PlayerChit inside `view` */
  me: P;
  /** Every legal option in this prompt (useful for comparing against alternatives) */
  options: AiOption[];
  prompt: { message?: string; help?: string };
  /** Per-bot random number generator in [0, 1) */
  random: () => number;
  /** The plan committed by earlier winning options.  Read-only; change it by returning a `plan`. */
  memory: Readonly<M>;
  /** Look up a chit in `view` by id (e.g. an id stored in memory).  Undefined if it no longer exists. */
  find: (id: string) => Chit | undefined;
  /** `params` from `connectAiPlayer` for this seat (per-seat weights, a personality…); undefined if none */
  params: any;
};

/**
 * What a rule returns: a plain score, or a score plus a plan.  Higher scores are better, and
 * `-Infinity` means "never pick this unless nothing else is possible".  The plan is only
 * committed to memory if this option is the one chosen.  Pass a whole new memory value, or a
 * function that updates the previous one.
 */
export type AiScore<M> = number | { score: number; plan?: M | ((prev: M) => M) };

export type AiRule<P extends PlayerChit, R extends RootChit<P>, M> = (
  option: AiOption,
  ctx: AiContext<P, R, M>,
) => AiScore<M>;

export interface GameAi<P extends PlayerChit, R extends RootChit<P>, M = Record<string, never>> {
  /** Starting memory for each bot.  Memory must be JSON-serializable: store chit ids, not chits. */
  initialMemory?: () => M;
  /** Rules keyed by the name passed to `.ai(key)` on a pick */
  rules?: { [key: string]: AiRule<P, R, M> };
  /**
   * Scores options from untagged picks (or tags with no matching rule).  If it is not supplied,
   * those options score 0 when mixed with tagged picks, and a prompt with no tagged picks at all
   * is answered at random, weighted by `Game.demoPickWeight`.
   */
  default?: AiRule<P, R, M>;
  /**
   * Read the board through the serialized, per-seat view instead of the live game objects. The
   * live view (the default) is much faster but lets rules read hidden fields and other players'
   * unfinished simultaneous moves; set this when your rules would otherwise use information the
   * seat should not have.
   */
  serializedView?: boolean;
  /**
   * Default for `connectAiPlayer`'s `temperature` (softmax over scores, in score units) for every
   * bot of this game, including demo and Playground bots. Unset: the `difficulty` noise.
   */
  temperature?: number;
}

/**
 * Declares a game's AI.  Set it as `ai` on your Game class.
 *
 * ```ts
 * export const ai = defineAi<MyPlayer, MyRoot, { target?: string }>({
 *   initialMemory: () => ({}),
 *   rules: {
 *     "market.buy": (opt, { me }) => ({ score: value(opt.chit as Card, me), plan: { target: opt.chit.id } }),
 *     "pass": () => 0,
 *   },
 * });
 * ```
 *
 * @group AI
 */
export function defineAi<P extends PlayerChit, R extends RootChit<P>, M = Record<string, never>>(
  ai: GameAi<P, R, M>,
): GameAi<P, R, M> {
  return ai;
}

/** @internal */
export type NormalizedScore<M> = { score: number; plan?: M | ((prev: M) => M) };

/** @internal */
export function normalizeScore<M>(score: AiScore<M>): NormalizedScore<M> {
  if (typeof score === "number") {
    return { score: Number.isNaN(score) ? 0 : score };
  }
  return { score: Number.isNaN(score?.score) ? 0 : (score?.score ?? 0), plan: score?.plan };
}

/** @internal */
export function applyPlan<M>(memory: M, plan: NormalizedScore<M>["plan"]): M {
  if (plan === undefined) {
    return memory;
  }
  return typeof plan === "function" ? (plan as (prev: M) => M)(memory) : plan;
}

/**
 * Picks an index from scored entries: the best score wins, near-ties are broken at random, and
 * `noise` (0 = none, 1 = a lot) blurs the scores so bots aren't perfectly predictable.  Entries
 * scoring -Infinity are only chosen when nothing else is available.
 * @internal
 */
export function chooseIndex(scores: number[], noise: number, random: () => number): number {
  if (scores.length === 0) {
    return -1;
  }

  let candidates = scores.map((score, index) => ({ score, index })).filter((s) => s.score !== -Infinity);
  if (candidates.length === 0) {
    candidates = scores.map((score, index) => ({ score: 0, index }));
  }

  const finite = candidates.map((c) => c.score).filter((s) => Number.isFinite(s));
  const spread = finite.length > 1 ? Math.max(...finite) - Math.min(...finite) : 0;
  const scale = (spread || 1) * Math.max(0, noise);
  const jittered = candidates.map((c) => ({ ...c, score: c.score + (random() - 0.5) * scale }));

  const best = Math.max(...jittered.map((c) => c.score));
  const epsilon = Number.isFinite(best) ? Math.max(1e-9, Math.abs(best) * 1e-9) : 0;
  const top = jittered.filter((c) => (Number.isFinite(best) ? best - c.score <= epsilon : c.score === best));
  return top[Math.floor(random() * top.length)].index;
}

/**
 * Softmax choice: probability ∝ exp((score − best) / temperature). `-Infinity` options are only
 * chosen when nothing else is possible; temperature ≤ 0 picks the best (ties at random).
 * @internal
 */
export function chooseSoftmax(scores: number[], temperature: number, random: () => number): number {
  if (scores.length === 0) return -1;
  let idx = scores.map((s, i) => i).filter((i) => scores[i] !== -Infinity);
  if (idx.length === 0) idx = scores.map((_, i) => i);
  const vals = idx.map((i) => (Number.isFinite(scores[i]) ? scores[i] : scores[i] > 0 ? Number.MAX_VALUE : 0));
  const best = Math.max(...vals);
  if (!(temperature > 0)) {
    const top = idx.filter((_, k) => vals[k] === best);
    return top[Math.floor(random() * top.length)];
  }
  const w = vals.map((v) => Math.exp((v - best) / temperature));
  const total = w.reduce((a, b) => a + b, 0);
  let r = random() * total;
  for (let k = 0; k < idx.length; k++) {
    r -= w[k];
    if (r <= 0) return idx[k];
  }
  return idx[idx.length - 1];
}

/**
 * Chooses an index with probability proportional to its weight.  Used when a prompt has no AI
 * rules at all, and matches the old "bad AI" demo behaviour.
 * @internal
 */
export function chooseWeighted(weights: number[], random: () => number): number {
  const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  if (total <= 0) {
    return Math.floor(random() * weights.length);
  }
  let roll = random() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= Math.max(0, weights[i]);
    if (roll < 0) {
      return i;
    }
  }
  return weights.length - 1;
}

/** Small seedable PRNG (mulberry32). @internal */
export function createRandom(seed: number = Math.floor(Math.random() * 2 ** 32)): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a string hash, used for situation fingerprints. @internal */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + ":" + s.length.toString(36);
}
