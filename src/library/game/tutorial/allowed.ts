import { Chit } from "../Chit";
import { ButtonPick, ChitPick, DragPick, Pick } from "../Pick";
import { PlayerChit } from "../PlayerChit";
import { RootChit } from "../RootChit";
import type { PickPrompt, PromptAction } from "../Prompt";
import type { AiOption } from "../ai/defineAi";
import { AllowedAction, ChitSelector, TutorialStep, selectChits } from "./defineTutorial";

/** A move in a form both the client prompt and the AI option list can be reduced to. @internal */
export type MoveShape = {
  kind: "chit" | "drag" | "button";
  key?: string;
  chitId?: string;
  targetId?: string;
  buttonLabel?: string;
};

/** @internal */
export function shapeOfPromptAction(action: PromptAction): MoveShape | undefined {
  if (action.type !== "pick") return undefined;
  const pick: Pick = action.pick;
  const key = pick.aiTag?.k;
  if (pick instanceof ChitPick) {
    return { kind: "chit", key, chitId: action.value as string };
  }
  if (pick instanceof DragPick) {
    const v = action.value as { chitId: string; targetChitId: string };
    return { kind: "drag", key, chitId: v?.chitId, targetId: v?.targetChitId };
  }
  if (pick instanceof ButtonPick) {
    return { kind: "button", key, buttonLabel: pick.button?.label };
  }
  return undefined;
}

/** @internal */
export function shapeOfAiOption(o: AiOption): MoveShape {
  switch (o.kind) {
    case "chit":
      return { kind: "chit", key: o.key, chitId: o.chit.id };
    case "drag":
      return { kind: "drag", key: o.key, chitId: o.chit.id, targetId: o.target.id };
    case "button":
      return { kind: "button", key: o.key, buttonLabel: o.button.label };
  }
}

/** Whether a move matches one of the step's allowed actions (none allowed when the step lists none). @internal */
export function isAllowed<P extends PlayerChit, R extends RootChit<P>>(
  allow: AllowedAction<P, R> | AllowedAction<P, R>[] | undefined,
  move: MoveShape,
  root: R | undefined,
  me: P | undefined,
): boolean {
  if (!allow) return false;
  const list = Array.isArray(allow) ? allow : [allow];
  const ids = (sel: ChitSelector<P, R>) => new Set(selectChits<P, R>(sel, root, me).map((c: Chit) => c.id));
  return list.some((a) => {
    if (a === "any") return true;
    if (a.ui !== undefined) return false; // a UI control, never a game move
    if (a.key !== undefined && move.key !== a.key) return false;
    if (a.chit && (move.kind === "button" || !ids(a.chit).has(move.chitId))) return false;
    if (a.target && (move.kind !== "drag" || !ids(a.target).has(move.targetId))) return false;
    if (
      a.button !== undefined &&
      (move.kind !== "button" || (move.buttonLabel ?? "").toLowerCase() !== a.button.toLowerCase())
    )
      return false;
    return true;
  });
}

/** Steps that wait for the player but allow nothing: a script bug worth flagging. @internal */
export function stepsWithoutAllow(steps: TutorialStep<any, any>[]): string[] {
  return steps.filter((s) => s.waitFor && !s.allow).map((s) => s.id);
}

/** UI names that stand for "whichever of these is showing". @internal */
export const UI_ALIASES: { [name: string]: string[] } = {
  "gallery:modeButton": ["gallery:toFullscreen", "gallery:toInline"],
};

/** Whether a step's `allow` lists the UI control the player just used (by its `data-tutorial-target`). @internal */
export function allowsUi<P extends PlayerChit, R extends RootChit<P>>(
  allow: AllowedAction<P, R> | AllowedAction<P, R>[] | undefined,
  used: string,
): boolean {
  if (!allow) return false;
  const list = Array.isArray(allow) ? allow : [allow];
  return list.some(
    (a) => a !== "any" && a.ui !== undefined && (a.ui === used || (UI_ALIASES[a.ui] ?? []).includes(used)),
  );
}

/** One answer to a client prompt, as a tap or drag would give it. @internal */
export type PromptMove = { pick: Pick; value: unknown; shape: MoveShape };

/** Every answer the player's prompt accepts, in prompt order (chit taps, drags, buttons). @internal */
export function promptMoves(prompt: PickPrompt): PromptMove[] {
  const moves: PromptMove[] = [];
  for (const pick of prompt.picks) {
    const key = pick.aiTag?.k;
    if (pick instanceof ChitPick) {
      for (const chit of pick.chits as Chit[]) {
        if (chit.id) moves.push({ pick, value: chit.id, shape: { kind: "chit", key, chitId: chit.id } });
      }
    } else if (pick instanceof DragPick) {
      const targets = pick.dropTargets.flatMap((t) => t.chits as Chit[]);
      for (const chit of pick.chits as Chit[]) {
        for (const target of targets) {
          if (!chit.id || !target.id) continue;
          moves.push({
            pick,
            value: { chitId: chit.id, targetChitId: target.id },
            shape: { kind: "drag", key, chitId: chit.id, targetId: target.id },
          });
        }
      }
    } else if (pick instanceof ButtonPick) {
      moves.push({ pick, value: null, shape: { kind: "button", key, buttonLabel: pick.button?.label } });
    }
  }
  return moves;
}

/**
 * What "do it for me" does on a step: the first entry of `allow` (in the order written) that the
 * player can act on right now, as a game move from the prompt or a UI control to press. @internal
 */
export function scriptedAnswer<P extends PlayerChit, R extends RootChit<P>>(
  allow: AllowedAction<P, R> | AllowedAction<P, R>[] | undefined,
  prompt: PickPrompt | undefined,
  root: R | undefined,
  me: P | undefined,
): { move: PromptMove } | { ui: string } | undefined {
  if (!allow) return undefined;
  const list = Array.isArray(allow) ? allow : [allow];
  const moves = prompt ? promptMoves(prompt) : [];
  for (const entry of list) {
    if (entry !== "any" && entry.ui !== undefined) return { ui: entry.ui };
    const move = moves.find((m) => isAllowed(entry, m.shape, root, me));
    if (move) return { move };
  }
  return undefined;
}
