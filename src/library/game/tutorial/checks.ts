import { Chit } from "../Chit";
import { PlayerChit } from "../PlayerChit";
import { RootChit } from "../RootChit";
import { CheckResult, Checker, ChitSelector, TutorialContext, selectChits } from "./defineTutorial";

type P_ = PlayerChit;
type R_ = RootChit<any>;

function make<P extends P_, R extends R_>(
  fn: (ctx: TutorialContext<P, R>) => CheckResult,
  reset?: (ctx: TutorialContext<P, R>) => void,
): Checker<P, R> {
  const result = fn as Checker<P, R>;
  if (reset) result.reset = reset;
  return result;
}

function count<P extends P_, R extends R_>(sel: ChitSelector<P, R>, ctx: TutorialContext<P, R>) {
  return selectChits(sel, ctx.root, ctx.me).length;
}

/**
 * Building blocks for `TutorialStep.waitFor`. Every check is a plain predicate on the state the
 * player sees, so "did they do it" tolerates order and alternatives by construction. Return a string
 * from your own checker to explain why not yet; the box shows it as the hint.
 *
 * ```ts
 * waitFor: checks.all(checks.countChanged((r, me) => me.hand, 1), checks.promptFor("none"))
 * ```
 *
 * @group Tutorials
 */
export const checks = {
  /** Every check passes. Hints come from the first one that fails. */
  all<P extends P_, R extends R_>(...list: Checker<P, R>[]): Checker<P, R> {
    return make(
      (ctx) => {
        for (const c of list) {
          const r = c(ctx);
          if (r !== true) return r;
        }
        return true;
      },
      (ctx) => list.forEach((c) => c.reset?.(ctx)),
    );
  },

  /** Any one check passes. The hint is the last failing one's. */
  any<P extends P_, R extends R_>(...list: Checker<P, R>[]): Checker<P, R> {
    return make(
      (ctx) => {
        let last: CheckResult = false;
        for (const c of list) {
          const r = c(ctx);
          if (r === true) return true;
          last = r;
        }
        return last;
      },
      (ctx) => list.forEach((c) => c.reset?.(ctx)),
    );
  },

  not<P extends P_, R extends R_>(c: Checker<P, R>, hint?: string): Checker<P, R> {
    return make(
      (ctx) => (c(ctx) === true ? (hint ?? false) : true),
      (ctx) => c.reset?.(ctx),
    );
  },

  /** The selector returns `delta` more chits (negative: fewer) than when the step started. */
  countChanged<P extends P_, R extends R_>(sel: ChitSelector<P, R>, delta: number, hint?: string): Checker<P, R> {
    let start = 0;
    return make(
      (ctx) => {
        const now = count(sel, ctx);
        if (delta >= 0 ? now - start >= delta : now - start <= delta) return true;
        return hint ?? false;
      },
      (ctx) => {
        start = count(sel, ctx);
      },
    );
  },

  /** The selector returns at least `n` chits (default 1). */
  exists<P extends P_, R extends R_>(sel: ChitSelector<P, R>, n = 1, hint?: string): Checker<P, R> {
    return make((ctx) => (count(sel, ctx) >= n ? true : (hint ?? false)));
  },

  /** Every chit the selector returns now lives under a chit the parent selector returns (or has that outlet name). */
  moved<P extends P_, R extends R_>(
    sel: ChitSelector<P, R>,
    parent: ChitSelector<P, R> | string,
    hint?: string,
  ): Checker<P, R> {
    return make((ctx) => {
      const chits = selectChits(sel, ctx.root, ctx.me);
      if (chits.length === 0) return hint ?? false;
      const ok = chits.every((c) => {
        if (typeof parent === "string") return c.parentOutlet === parent;
        const parents = selectChits(parent, ctx.root, ctx.me);
        return parents.some((p) => c.parent === p);
      });
      return ok ? true : (hint ?? false);
    });
  },

  /** A property on the chit(s) the selector returns satisfies `pred` (every chit, if several). */
  prop<P extends P_, R extends R_, C extends Chit = Chit>(
    sel: ChitSelector<P, R>,
    pred: (chit: C) => boolean,
    hint?: string,
  ): Checker<P, R> {
    return make((ctx) => {
      const chits = selectChits(sel, ctx.root, ctx.me) as C[];
      return chits.length > 0 && chits.every(pred) ? true : (hint ?? false);
    });
  },

  /** A value derived from the state satisfies `pred`. The simplest escape hatch. */
  state<P extends P_, R extends R_>(pred: (root: R, me: P) => boolean, hint?: string): Checker<P, R> {
    return make((ctx) => (pred(ctx.root, ctx.me) ? true : (hint ?? false)));
  },

  /** Whose turn it is: "me" (the player has a prompt), "none" (they do not). */
  promptFor<P extends P_, R extends R_>(who: "me" | "none", hint?: string): Checker<P, R> {
    return make((ctx) => {
      const mine = !!ctx.prompt;
      return (who === "me") === mine ? true : (hint ?? false);
    });
  },

  /** The player's current prompt message matches. */
  promptMessage<P extends P_, R extends R_>(re: RegExp, hint?: string): Checker<P, R> {
    return make((ctx) => (ctx.prompt && re.test(ctx.prompt.message) ? true : (hint ?? false)));
  },

  /** One of the prompt's buttons has this label (e.g. the engine's Confirm). */
  promptHasButton<P extends P_, R extends R_>(label: string, hint?: string): Checker<P, R> {
    return make((ctx) =>
      ctx.prompt?.buttons.some((b) => b.label.toLowerCase() === label.toLowerCase()) ? true : (hint ?? false),
    );
  },

  /** A log line written since the step started matches. */
  logged<P extends P_, R extends R_>(re: RegExp, hint?: string): Checker<P, R> {
    return make((ctx) => (ctx.recentLog.some((l) => re.test(l)) ? true : (hint ?? false)));
  },

  /** The clock moved on by at least `n` (default 1) since the step started. */
  clockAdvanced<P extends P_, R extends R_>(n = 1, hint?: string): Checker<P, R> {
    return make((ctx) => (ctx.clock - ctx.stepStartClock >= n ? true : (hint ?? false)));
  },

  /**
   * A gallery is open: any, or one showing a container's children (`of`), or one in a given mode.
   * `of` matches a gallery opened from that container, or one that shows exactly its children.
   */
  galleryOpen<P extends P_, R extends R_>(
    opts: { of?: ChitSelector<P, R>; mode?: "inline" | "fullscreen" } = {},
    hint?: string,
  ): Checker<P, R> {
    return make((ctx) => {
      const of = opts.of ? selectChits(opts.of, ctx.root, ctx.me)[0] : undefined;
      const ok = ctx.galleries.some((g) => {
        if (opts.mode && g.mode !== opts.mode) return false;
        if (!of) return true;
        if (g.of === of.id) return true;
        const children = of.children.map((c) => c.id);
        return children.length > 0 && children.every((id) => id && g.chitIds.includes(id));
      });
      return ok ? true : (hint ?? false);
    });
  },

  /** No gallery is open */
  galleryClosed<P extends P_, R extends R_>(hint?: string): Checker<P, R> {
    return make((ctx) => (ctx.galleries.length === 0 ? true : (hint ?? false)));
  },

  /** Passes right away. For a "do it" step that only exists to pause the bots or run `onEnter`. */
  always<P extends P_, R extends R_>(): Checker<P, R> {
    return make(() => true);
  },
};
