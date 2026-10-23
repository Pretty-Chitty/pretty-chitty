# Writing AI players for a Pretty Chitty game

This guide is for whoever is adding computer opponents to a Pretty Chitty game, whether a
person or a coding agent. Follow it from top to bottom. When you're done:

- every pick in the game is tagged with `.ai("key")`,
- `src/ai.ts` has a scoring rule for every key,
- a `simulateMatches` test shows that bots finish games without getting stuck.

**The goal is bots that never look broken, not bots that win.** A bot that makes reasonable,
legal, purposeful moves is a success. Don't build search trees, simulations or "perfect play".

---

## How it works (read this first)

- A game prompts a player with `turn.pick([...picks])`. Each pick offers options: chits to
  click (`Chit.pick`), chits to drag onto targets (`Chit.dragPick`), or buttons.
- You tag each pick with a key: `.ai("market.buy")`.
- In `src/ai.ts` you write one **rule** per key. A rule receives **one option** and returns a
  **score**. The bot scores every option in the prompt, across all of its picks, and plays the
  highest one.
- By default the bot reads the match's **live game objects** in place, so rules see everything,
  hidden information included. That is fast. If your rules would use information the seat should
  not have, set `serializedView: true` (see Step 4) and the bot sees only what a human in that seat
  would.
- A rule may also return a **plan**, which is saved to the bot's memory if that option wins.
  Later rules can read it, which lets a bot carry intentions across prompts.

The engine already handles these. **Do not reimplement them:**

| Situation | What the engine does |
|---|---|
| Engine-inserted Confirm prompts | Pressed automatically |
| "No valid moves" dead end | Undoes the last answer, marks it dead for that exact situation, tries the next best; backs up further if every option is dead |
| Server rejects an answer | Tries the next best option |
| Untagged pick | Scores 0 (or uses `default`), logs `[AI p1] no rule for "..."` once |
| Game has no `ai` at all | Falls back to random play weighted by `Game.demoPickWeight` |
| Pacing in demo mode and Playground | Pauses 400–900 ms before each answer |

---

## Step 1 — Inventory every pick

Find every prompt in the game:

```sh
grep -rn "turn.pick\|\.pick(\|Chit.pick\|Chit.dragPick\|noValidMoves" src/
```

Make a table before writing any code. Write it in your notes, not in the repo:

| File:line | What the player is deciding | Pick type | Proposed key |
|---|---|---|---|
| phases/build.ts:88 | which factory to place, and where | DragPick | `build.place` |
| phases/build.ts:95 | stop building | ButtonPick (Done) | `build.done` |
| phases/market.ts:40 | which car to buy | ChitPick | `market.buy` |
| phases/market.ts:46 | skip buying | ButtonPick (Pass) | `market.pass` |

**Key naming:** `phase.action`, lowercase, stable, describing the *decision* rather than the
UI. Give each kind of action its own key. Two picks in different places that mean the same
decision may share a key.

## Step 2 — Tag the picks

Add `.ai(key)` to each pick, next to `.message()`:

```ts
await turn.pick([
  Chit.pick(cars, (c) => buy(c)).message("buy a car").ai("market.buy"),
  new PassButton(() => (passed = true)).pick().message("pass").ai("market.pass"),
  Chit.dragPick(factories, DragTarget.from(hexes, place)).message("build").ai("build.place"),
]);
```

Rules for tagging:

- **Tag picks, not prompts.** Each pick in the array gets its own `.ai()`.
- **Don't change game behaviour.** Only add `.ai(...)`. Don't add, remove or reorder picks,
  change callbacks, or add buttons to make the bot's life easier. If the bot can't cope with the
  game as written, fix the rules in `ai.ts`.
- **Bare buttons:** if the code passes `new PassButton(...)` directly into the array, change
  it to `new PassButton(...).pick().ai("x.pass")`. That's the same pick with a tag.
- **Optional data:** `.ai("market.buy", { cost })` passes a JSON hint to the rule. **Every
  client receives it**, so never put hidden information in it. Prefer reading values from the
  option's chit instead.
- Don't tag Confirm prompts the engine inserts automatically, or `turn.noValidMoves()`.

## Step 3 — Write `src/ai.ts`

```ts
import { defineAi } from "@pretty-chitty/core";
import { Player, Root, Car, Factory, Hex } from "./chits";

type Memory = {
  /** id of the car we intend to buy, then build a factory for */
  targetCar?: string;
};

export const ai = defineAi<Player, Root, Memory>({
  initialMemory: () => ({}),

  rules: {
    "market.buy": (opt, { me }) => {
      if (opt.kind !== "chit") return 0;
      const car = opt.chit as Car;
      if (car.cost > me.money) return -Infinity;
      return {
        score: car.value - car.cost * 0.5,
        plan: (prev) => ({ ...prev, targetCar: car.id }),
      };
    },

    "market.pass": (_opt, { options }) => {
      // pass only when nothing else is worth doing
      return options.some((o) => o.key === "market.buy") ? -1 : 0;
    },

    "build.place": (opt, { memory, find, view }) => {
      if (opt.kind !== "drag") return 0;
      const hex = opt.target as Hex;
      if (hex.occupied) return -Infinity;
      let score = adjacencyBonus(hex, view);
      if (memory.targetCar && find(memory.targetCar) && hex.region === (find(memory.targetCar) as Car).region) {
        score += 10;
      }
      return score;
    },

    "build.done": (_opt, { options }) => (options.some((o) => o.key === "build.place") ? -2 : 1),
  },
});
```

Then wire it into the Game class:

```ts
import { ai } from "./ai";

export class MyGame implements Game<Player, Root> {
  // ...
  ai = ai;
}
```

### The rule signature

```ts
(option: AiOption, ctx: AiContext) => number | { score: number; plan?: Memory | ((prev: Memory) => Memory) }
```

**`option`**

| Field | Meaning |
|---|---|
| `kind` | `"chit"` (click a chit), `"drag"` (drag `chit` onto `target`), or `"button"` |
| `chit` | The chit clicked or dragged. Present for `"chit"` and `"drag"` |
| `target` | The drop target. Present for `"drag"` |
| `button` | The button instance. Present for `"button"` |
| `key`, `data` | From `.ai(key, data)` |
| `pick.message`, `pick.help`, `pick.context`, `pick.buttonType` | Where the option came from |

Narrow on `opt.kind` before using `chit`, `target` or `button`, then cast to your chit class:
`opt.chit as Car`.

**`ctx`**

| Field | Meaning |
|---|---|
| `view` | Root chit as this seat sees it. Query it like game code |
| `me` | This bot's PlayerChit inside `view` |
| `options` | Every legal option in this prompt. Use it to compare ("is there anything better?") |
| `memory` | The current plan. Frozen, so don't mutate it |
| `find(id)` | Look up a chit in `view` by id. `undefined` if it's gone |
| `random()` | Per-bot rng in [0, 1). Use it for variety, never `Math.random` |
| `params` | Whatever the host passed as `connectAiPlayer(…, { params })` for this seat (per-seat weights, a version, a personality); `undefined` if none |
| `prompt.message` | The prompt's text |

### Scores

- **Higher is better.** Only the relative order within one prompt matters.
- **All keys in one prompt share a scale.** A prompt offering `market.buy` and `market.pass`
  compares their numbers directly, so pick units for the game (points or money are good) and
  use them everywhere.
- **`-Infinity`** means "never, unless nothing else is legal". Use it for illegal-in-spirit or
  self-destructive moves.
- **Ties are broken at random**, and a small amount of noise is added, so bots aren't robotic.
  By default the noise is `(max − min) × (1 − difficulty)` of the prompt's scores, so one outlier
  (a −50 "never") makes the bot nearly random among the rest, and close scores make it fully
  predictable. Use `-Infinity` for "never" (it is left out of the spread). For noise in your own
  units, set a **temperature**: `defineAi({ temperature: 1, … })` for every bot of the game, or
  `connectAiPlayer(…, { temperature })` per seat. The bot then picks by softmax: an option one
  score unit worse is chosen e≈2.7× less often at temperature 1, and temperature 0 always plays
  the best.
- **Untagged options in the same prompt score 0.** Keep that in mind when choosing your scale.

## Step 4 — Hidden information

The default view is the live board: the bot *could* read other hands, deck order, and other
players' unfinished simultaneous moves. That is your call as the developer: if your rules only
read the bot's own pieces and public information, leave it — it is many times faster (a 3-player
Excursions game spent ~60% of its time rebuilding serialized views). If fairness depends on it,
opt in:

```ts
export const ai = defineAi<Player, Root, Memory>({ serializedView: true, rules: { … } });
// or per seat: connectAiPlayer(match, playerId, { view: "serialized" })
```

With `serializedView`, the bot's view is redacted exactly like a human's:

- **Every field another player might hide can be `undefined`.** Always default it:
  `const v = card.value ?? AVERAGE_CARD_VALUE;`
- **A face-down deck still has its chits**, with their contents stripped. Count them, but
  don't read them.
- **Never mutate what you read.** With the live view, `view` *is* the game; a rule that sets a field
  changes the real match.
- **Never** read state from anywhere except `ctx` and the option: no module-level game
  singletons, no root captured from `run()`, no imports of live state. Helper functions and
  constant tables (card data, scoring tables) are fine to import.
- A rule that throws scores 0 and is counted in `ruleErrors`. A missing `?? default` is the
  usual cause.

## Step 5 — Plans (memory across prompts)

Use plans when one intention spans several prompts. For example: "buy car X, then build in
X's region", "save money for the 7-cost upgrade", "go for the blue majority".

- Return `{ score, plan }`. The plan is saved **only if this option wins**, so rules can
  propose plans freely while scoring.
- A plain object **replaces** memory. Use the function form to keep other fields:
  `plan: (prev) => ({ ...prev, targetCar: car.id })`.
- Memory must be JSON. Store **chit ids**, not chits, and resolve them with `find(id)`.
- **Plans are hints, not commitments.** Other players can make them stale, and memory resets
  if the bot reconnects. Always guard:

  ```ts
  const target = memory.targetCar ? find(memory.targetCar) : undefined;
  if (target && target.parent === view.market) { /* still buyable */ }
  ```

- When the bot backs out of a dead end, memory rolls back automatically.
- Clear a plan once it's done: `plan: (prev) => ({ ...prev, targetCar: undefined })`.

Keep plans small. Most games need one or two fields, or none.

## Step 6 — Prove it with a soak test

Create `src/ai.test.ts`:

```ts
import { expect, test } from "vitest";
import { simulateMatches } from "@pretty-chitty/core";
import { MyGame } from "./MyGame";

test("AI players finish games without getting stuck", async () => {
  const report = await simulateMatches(new MyGame(), { players: 3, games: 5 });
  expect(report.finished).toBe(5);
  expect(report.stuck).toBe(0);
  expect(report.stalls).toBe(0);
  expect(report.ruleErrors).toBe(0);
  expect(report.untagged).toEqual({});
}, 120_000);
```

Run it at each player count the game supports. How to read a failed report:

| Symptom | Likely cause |
|---|---|
| `untagged` not empty | A pick has no `.ai()` tag, or its key has no rule. The keys of `untagged` are the pick messages |
| `ruleErrors > 0` | A rule threw. Usually it read a hidden field without `?? default` |
| `outcome: "maxPrompts"` | The bot loops: a free-arrange or "keep going" pick always outscores Done/Pass. Make the stop option win once progress is made (see the cookbook) |
| `stepBacks` very high | Rules keep choosing moves that lead to "no valid moves". Score those moves `-Infinity` up front |
| `stalls > 0` | A pick callback can leave state unchanged, so the server never responds. That's a game bug; report it rather than working around it |
| `stuck > 0` | Every option leads to a dead end and the bot can't undo further. Usually a game bug |

To print details, use `const report = await simulateMatches(game, { log: true });` and
`console.log(report.matches)`.

Then watch one game in the browser: open the game's demo page (`/demo`), or use Playground
with AI players checked. Moves should look purposeful.

---

## Step 7 — Measure and tune (optional)

Hand-written rules encode assumptions, and some will be wrong. Three hooks let a harness test them
by playing:

- **`params`**: give each seat its own weights (`connectAiPlayer(…, { params: { weights } })`,
  read as `ctx.params` in rules). Put every constant your rules use in one weights object, and a
  tournament can play variants against each other: seat them at random, rank by the share of
  opponents each finished ahead of, keep the best, mutate, repeat. Rotate seats every game —
  turn order alone can be worth ±20 points of win rate.
- **`onDecision(d)`**: called after every choice with each option's score, the chosen index and
  the `ctx`. Log it to compare what the bot expected with what happened.
- **`choose(scored, ctx)`**: return an index to force the answer. With it a harness can fork a
  match at a decision — copy `match.state` (the decision history), load it into a new `Match`,
  and the engine replays it to the pending prompt — then force each option in turn and play the
  game out. Comparing options by playout finds wrong assumptions that no weight change can fix:
  a value that should depend on the board, two things that only pay together, a goal no rule
  pursues.

Headless runs: set `match.immediateNotify = true` and use `new EphemeralMatchStorage(id, true)`
(lazy saves). Both are off by default because they change behaviour a server relies on; see
their doc comments.

## Heuristic cookbook

Start every key with **1**, **2** and **6**. That alone usually stops a bot looking broken.

1. **Take immediate value.** Score = what the action is worth right now, in the game's units.
2. **Prefer progress to passing.** Pass/Done should lose while useful options exist:

   ```ts
   "x.pass": (_o, { options }) => (options.some((o) => o.key !== "x.pass") ? -1 : 0),
   ```

3. **Pay attention to cost.** Score = gain − cost, in the same units.
4. **Finish what you start.** Commit a plan on step one and add a bonus on the next step for
   options that fulfil it.
5. **Deny the leader cheaply.** Add a small bonus for taking something the leading opponent
   clearly needs, using only public information.
6. **Never do the obviously broken thing:** dropping a piece onto itself or into its own
   stack, moving something back where it came from, discarding instead of building, buying
   what you can't use. Return `-Infinity` or a large negative.
7. **Converge in loops.** For "keep acting until Done" picks, track progress in memory and
   make Done win after enough actions, or when nothing scores above 0:

   ```ts
   "arrange.move": (o) => ({ score: moveValue(o), plan: (m) => ({ ...m, moves: m.moves + 1 }) }),
   "arrange.done": (_o, { memory }) => (memory.moves >= 3 ? 10 : -10),
   ```

   Reset the counter when the loop starts again (for example, when the round number in
   `view` changes).

8. **Add a little personality.** `ctx.random() * 0.5` on near-equal choices makes bots feel
   less mechanical. The engine already adds some noise (or set a `temperature`). For bots that
   differ from each other, give each seat its own weights through `params`.

## Anti-patterns

- ❌ Changing game code, picks or callbacks to make the AI easier.
- ❌ Reading hidden state from anywhere other than `ctx`.
- ❌ Calling `Math.random()` or `Date.now()` in rules. Use `ctx.random()`.
- ❌ Mutating `memory` or any chit in `view`. Rules must be side-effect free.
- ❌ Expensive work in rules, such as cloning the board or simulating turns. Rules run once per
  option, and drags can have hundreds of options. Keep each rule cheap, and precompute shared
  values outside the per-option logic where possible.
- ❌ Scoring everything the same. That gives a random bot with extra steps.
- ❌ Leaving `untagged` non-empty "for later".

## Reference

```ts
// Tag a pick
pick.ai(key: string, data?: unknown): this

// Define the AI (set as `ai` on your Game)
defineAi<P, R, M>({
  serializedView?: boolean, // rules see only what the seat is sent (slower)
  temperature?: number,     // default softmax temperature for every bot of the game
  initialMemory?: () => M,
  rules?: { [key: string]: (option, ctx) => number | { score, plan? } },
  default?: (option, ctx) => number | { score, plan? }, // for untagged picks
})

// Seat a bot (hosts; demo mode and Playground already do this)
connectAiPlayer(match, playerId, {
  difficulty?: 0..1, temperature?: number, thinkMs?: number | [min, max], seed?, log?,
  view?: "live" | "serialized", params?: unknown,
  choose?: (scored, ctx) => number | undefined,  // harnesses: force an answer
  onDecision?: (decision) => void,               // harnesses: every choice, with all scores
})

// Headless soak test
simulateMatches(game, { players?, games?, maxPrompts?, stallMs?, timeoutMs?, matchOptions?, difficulty?, log? })
```

- **Worked example:** `src/demo/ai.ts` with the tags in `src/demo/DemoGame.ts`, in the
  pretty-chitty repo. It includes drag rules that avoid self-drops and cycles, a stop-after-a-
  few-moves loop, and a plan read back by a later prompt.
- **Engine source:** `src/library/game/ai/` (`defineAi.ts` has the types,
  `AiClientPrompts.ts` the bot).

## Done checklist

- [ ] Every `turn.pick` option in the game has an `.ai(key)` tag, and no game behaviour changed
- [ ] `src/ai.ts` has a rule for every key, and `ai` is set on the Game class
- [ ] Every read of a field that could be hidden has a `?? default`
- [ ] Pass/Done/Stop options lose while useful work remains, and win once it doesn't
- [ ] Obviously broken moves score `-Infinity`
- [ ] `simulateMatches` test: all matches finish; `stuck`, `stalls` and `ruleErrors` are 0;
      `untagged` is empty, at every supported player count
- [ ] Watched one game in demo mode or Playground and the moves look purposeful
