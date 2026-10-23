import { Chit, defineAi } from "../library";
import { Card, Player, Root } from "./ChitLibrary";

/**
 * Reference AI for the demo game.  Each key matches a `.ai("...")` tag in DemoGame.ts.
 *
 * Rules score one option at a time using only what this player can see (`view`, `me`, and the
 * option's chits).  A rule can also return a `plan`, which is kept only if that option wins
 * and is readable by later rules as `memory`.
 */
type DemoMemory = {
  /** how many pieces we've moved in the "drag pieces around" phase */
  moves: number;
  /** the piece we liked most when taking pieces; we'll raise it later if we get the chance */
  favorite?: string;
};

/** True if `maybeChild` is `chit` or sits somewhere inside it (dropping there would make a loop) */
function isWithin(maybeChild: Chit, chit: Chit) {
  for (let c: Chit | undefined = maybeChild; c; c = c.parent) {
    if (c === chit) {
      return true;
    }
  }
  return false;
}

/** Hidden fields arrive as undefined, so always give them a default */
const valueOf = (card: Chit) => (card as Card).something ?? 0;

export const demoAi = defineAi<Player, Root, DemoMemory>({
  initialMemory: () => ({ moves: 0 }),

  rules: {
    // Drag a piece onto another piece.  Never drop a piece onto itself, into its own stack, or
    // where it already is, and prefer stacking onto valuable pieces.
    "demo.move": (opt) => {
      if (opt.kind !== "drag") {
        return 0;
      }
      if (isWithin(opt.target, opt.chit) || opt.chit.parent === opt.target) {
        return -Infinity;
      }
      return {
        score: 1 + valueOf(opt.target) / 100,
        plan: (prev) => ({ ...prev, moves: prev.moves + 1 }),
      };
    },

    // Stop dragging after a couple of moves, rather than forever (or immediately)
    "demo.stopMoving": (_opt, { memory }) => (memory.moves >= 2 ? 10 : -10),

    // Take the most valuable piece we can see, and remember it
    "demo.take": (opt) => {
      if (opt.kind !== "chit") {
        return 0;
      }
      return { score: valueOf(opt.chit), plan: (prev) => ({ ...prev, favorite: opt.chit.id }) };
    },

    // The token is only worth it if nothing else is
    "demo.token": () => 0,

    // Raise our favorite piece if it's an option; otherwise prefer pieces that aren't raised yet
    "demo.raise": (opt, { memory, find }) => {
      if (opt.kind !== "chit") {
        return 0;
      }
      if (memory.favorite && find(memory.favorite) && opt.chit.id === memory.favorite) {
        return 10;
      }
      return (opt.chit as Card).raised ? -1 : 1;
    },
  },
});
