import { EventChannel } from "../../utilities/EventChannel";
import type { RngSource } from "../TurnState";
import type { AiDecision, AiPlayerOptions } from "../ai/AiClientPrompts";
import type { AiPlayerHandle } from "../ai/connectAiPlayer";
import type { PromptSerialization } from "../Prompt";
import type { AiContext, AiOption } from "../ai/defineAi";
import { PlayerChit } from "../PlayerChit";
import { RootChit } from "../RootChit";
import { ForcedDecision, TutorialSpec, selectChits } from "./defineTutorial";

export type RngLogEntry = {
  index: number;
  count: number;
  values: number[];
  /** Step that declared the values, or undefined when they came from Math.random */
  declaredBy?: string;
  /** Step that was active when the draw happened ("setup" before the first step) */
  activeStep: string;
  source: "script" | "random";
  mismatch: boolean;
  at: number;
};

export type DecisionLogEntry = {
  playerId: string;
  activeStep: string;
  prompt?: string;
  /** Description of the forced entry that applied, or why none did */
  forced?: string;
  declaredBy?: string;
  chosen: string;
  mismatch: boolean;
  at: number;
};

type RngQueueEntry = { stepId: string; value: number | number[] };
type AiQueueEntry<P extends PlayerChit, R extends RootChit<P>> = { stepId: string; decision: ForcedDecision<P, R> };

const SETUP = "setup";

function describeOption(o: AiOption): string {
  switch (o.kind) {
    case "chit":
      return `${o.key ?? "?"} ${o.chit}`;
    case "drag":
      return `${o.key ?? "?"} ${o.chit} → ${o.target}`;
    case "button":
      return `${o.key ?? "?"} [${o.button.label}]`;
  }
}

function describeForced(d: ForcedDecision<any, any>): string {
  const parts: string[] = [];
  if (d.key) parts.push(d.key);
  if (d.chit) parts.push("chit");
  if (d.target) parts.push("→target");
  if (d.button) parts.push(`[${d.button}]`);
  return parts.join(" ") || "(any)";
}

/**
 * What a running tutorial shares between the match (random draws, bot moves) and the overlay (which
 * step is active). One per tutorial match. The Playground's dev panel reads the logs.
 *
 * @group Tutorials
 */
export class TutorialRuntime<P extends PlayerChit = PlayerChit, R extends RootChit<P> = RootChit<P>> {
  /** Id of the step the overlay is showing; "setup" before the tutorial starts. */
  public activeStep = new EventChannel<string>(SETUP);
  public rngLog = new EventChannel<RngLogEntry[]>([]);
  public decisionLog = new EventChannel<DecisionLogEntry[]>([]);
  public warnings = new EventChannel<string[]>([]);

  private rngQueue: RngQueueEntry[] = [];
  private rngIndex = 0;
  private aiQueues: { [playerId: string]: AiQueueEntry<P, R>[] } = {};
  private aiIndex: { [playerId: string]: number } = {};
  private snapshots = new Map<string, { state: unknown; rngIndex: number; aiIndex: { [playerId: string]: number } }>();

  /**
   * Remembers the match as it was when `stepId` went live (its serialized `TurnState`) together with
   * where the pinned draws and forced moves had got to, so Back can rebuild the match from there.
   */
  public saveSnapshot(stepId: string, state: unknown) {
    // The first snapshot of a step wins: re-entering it after a rewind must not overwrite it with
    // the board as it was before the rewind landed
    if (this.snapshots.has(stepId)) return;
    this.snapshots.set(stepId, { state, rngIndex: this.rngIndex, aiIndex: { ...this.aiIndex } });
  }

  public hasSnapshot(stepId: string) {
    return this.snapshots.has(stepId);
  }

  /** Rewinds the queues to where they were at `stepId` and returns the match state to rebuild from. */
  public restoreSnapshot(stepId: string): unknown | undefined {
    const snap = this.snapshots.get(stepId);
    if (!snap) return undefined;
    // Steps after this one will be played again, possibly differently: forget their snapshots
    const order = (this.spec?.steps ?? []).map((s) => s.id);
    const at = order.indexOf(stepId);
    order.slice(at + 1).forEach((id) => this.snapshots.delete(id));
    this.rngIndex = snap.rngIndex;
    this.aiIndex = { ...snap.aiIndex };
    this.pendingForced = {};
    this.activeStep.value = stepId;
    return snap.state;
  }

  constructor(public readonly spec: TutorialSpec<P, R> | undefined) {
    (spec?.match?.rng ?? []).forEach((value) => this.rngQueue.push({ stepId: SETUP, value }));
    (spec?.steps ?? []).forEach((step) => {
      (step.rng ?? []).forEach((value) => this.rngQueue.push({ stepId: step.id, value }));
      Object.entries(step.ai ?? {}).forEach(([playerId, decisions]) => {
        const q = (this.aiQueues[playerId] ??= []);
        decisions.forEach((decision) => q.push({ stepId: step.id, decision }));
      });
    });
  }

  /** Pinned draws left to hand out */
  get rngRemaining() {
    return this.rngQueue.length - this.rngIndex;
  }

  /** Forced moves left per bot */
  aiRemaining(playerId: string) {
    return (this.aiQueues[playerId]?.length ?? 0) - (this.aiIndex[playerId] ?? 0);
  }

  private warn(message: string) {
    if (this.spec?.strict) {
      throw new Error(`[tutorial ${this.spec.id}] ${message}`);
    }
    console.warn(`[tutorial ${this.spec?.id ?? ""}] ${message}`);
    this.warnings.value = [...this.warnings.value, message];
  }

  private pendingForced: { [playerId: string]: { description: string; declaredBy?: string; mismatch: boolean } } = {};

  /** The `RngSource` to give the match. */
  public readonly rngSource: RngSource = (count: number) => {
    const index = this.rngIndex;
    const entry = this.rngQueue[index];
    const active = this.activeStep.value;
    let values: number[] | undefined;
    let mismatch = false;
    if (entry) {
      this.rngIndex++;
      values = Array.isArray(entry.value) ? entry.value : [entry.value];
      if (values.length !== count) {
        this.warn(
          `rng draw #${index} (declared by step "${entry.stepId}") has ${values.length} value(s) but the game asked for ${count}`,
        );
        values = undefined;
      } else if (entry.stepId !== active) {
        mismatch = true;
        this.warn(`rng draw #${index} was declared by step "${entry.stepId}" but consumed during "${active}"`);
      }
    }
    const log = this.rngLog.value;
    this.rngLog.value = [
      ...log,
      {
        index,
        count,
        values: values ?? [],
        declaredBy: entry?.stepId,
        activeStep: active,
        source: values ? "script" : "random",
        mismatch,
        at: Date.now(),
      },
    ];
    if (!values) {
      // Let TurnState draw from Math.random and record what it drew
      const drawn = Array.from({ length: count }, () => Math.random());
      const entries = this.rngLog.value;
      entries[entries.length - 1] = { ...entries[entries.length - 1], values: drawn };
      this.rngLog.value = [...entries];
      return drawn;
    }
    return values;
  };

  /** AI options (the `choose`, `hold` and `onDecision` hooks) for the bot in `playerId`'s seat. */
  public aiOptionsFor(playerId: string): Pick<AiPlayerOptions, "choose" | "hold" | "onDecision"> {
    return {
      choose: (scored, ctx) => this.choose(playerId, scored, ctx),
      hold: (prompt) => this.waitingForStep(playerId, prompt),
      onDecision: (decision) => this.recordDecision(playerId, decision),
    };
  }

  private bots: AiPlayerHandle[] = [];
  private unsubActiveStep?: () => void;

  /** The bots to wake when the active step changes (a held bot's move may now be due) */
  public attachBots(bots: AiPlayerHandle[]) {
    this.bots = bots;
    this.unsubActiveStep?.();
    this.unsubActiveStep = this.activeStep.on(() => this.bots.forEach((b) => b.prompts.recheck()), false);
  }

  /** Position of a step in the script: -1 for setup, past the end once the tutorial is over */
  private stepOrder(stepId: string) {
    if (stepId === SETUP) return -1;
    const index = (this.spec?.steps ?? []).findIndex((s) => s.id === stepId);
    return index < 0 ? Number.POSITIVE_INFINITY : index;
  }

  /**
   * A bot whose next scripted move belongs to a step that is not on screen yet waits for it, so the
   * move happens while that step is narrating it. The engine's own Confirm (ending a turn or
   * confirming a draw) goes through unless that Confirm is the scripted move: holding it would
   * deadlock a bot that has to finish a turn before its next scripted step can come.
   */
  private waitingForStep(playerId: string, prompt?: PromptSerialization) {
    const entry = this.aiQueues[playerId]?.[this.aiIndex[playerId] ?? 0];
    if (!entry) return false;
    if (prompt && isConfirmOnly(prompt) && entry.decision.button?.toLowerCase() !== "confirm") return false;
    return this.stepOrder(entry.stepId) > this.stepOrder(this.activeStep.value);
  }

  private choose(
    playerId: string,
    scored: { option: AiOption; score: number }[],
    ctx: AiContext<any, any, any>,
  ): number | undefined {
    const queue = this.aiQueues[playerId];
    const index = this.aiIndex[playerId] ?? 0;
    const entry = queue?.[index];
    delete this.pendingForced[playerId];
    if (!entry) {
      return undefined;
    }
    const root = ctx.view as R;
    const me = ctx.me as P;
    const d = entry.decision;
    // The engine's own Confirm: answered as usual unless the scripted move is that Confirm
    const onlyConfirms = scored.every((s) => s.option.kind === "button" && s.option.pick.buttonType === "Confirm");
    if (onlyConfirms && d.button?.toLowerCase() !== "confirm") {
      return undefined;
    }
    if (d.when && !d.when(root, me)) {
      return undefined;
    }
    const chits = d.chit ? new Set(selectChits(d.chit, root, me).map((c) => c.id)) : undefined;
    const targets = d.target ? new Set(selectChits(d.target, root, me).map((c) => c.id)) : undefined;
    const matching = scored
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => {
        const o = s.option;
        if (d.key !== undefined && o.key !== d.key) return false;
        if (chits && !(o.kind !== "button" && chits.has(o.chit.id))) return false;
        if (targets && !(o.kind === "drag" && targets.has(o.target.id))) return false;
        if (d.button !== undefined && !(o.kind === "button" && o.button.label.toLowerCase() === d.button.toLowerCase()))
          return false;
        return true;
      });
    const description = describeForced(d);
    if (matching.length === 0) {
      this.warn(
        `bot ${playerId}: forced move ${description} (declared by step "${entry.stepId}") matches none of ${scored.length} option(s) in "${ctx.prompt.message ?? ""}"; playing normally`,
      );
      this.pendingForced[playerId] = { description: `${description} (no match)`, declaredBy: entry.stepId, mismatch: true };
      return undefined;
    }
    this.aiIndex[playerId] = index + 1;
    const active = this.activeStep.value;
    const mismatch = entry.stepId !== active;
    if (mismatch) {
      this.warn(`bot ${playerId}: forced move ${description} was declared by step "${entry.stepId}" but used during "${active}"`);
    }
    this.pendingForced[playerId] = { description, declaredBy: entry.stepId, mismatch };
    return matching[0].i;
  }

  private recordDecision(playerId: string, decision: AiDecision) {
    const forced = this.pendingForced[playerId];
    delete this.pendingForced[playerId];
    const chosen = decision.scored[decision.chosen]?.option;
    this.decisionLog.value = [
      ...this.decisionLog.value,
      {
        playerId,
        activeStep: this.activeStep.value,
        prompt: decision.prompt.message,
        forced: forced?.description,
        declaredBy: forced?.declaredBy,
        chosen: chosen ? describeOption(chosen) : "?",
        mismatch: forced?.mismatch ?? false,
        at: Date.now(),
      },
    ];
  }
}

/** A prompt whose only options are the engine's Confirm button */
function isConfirmOnly(prompt: PromptSerialization): boolean {
  const picks: { type?: string; details?: { __buttonType?: string } }[] = prompt.details?.picks ?? [];
  return picks.length > 0 && picks.every((p) => p.type === "ButtonPick" && p.details?.__buttonType === "Confirm");
}
