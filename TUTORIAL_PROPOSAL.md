# Scripted tutorials: proposal

Status: implemented 2026-10-28. This is the design record; the living guide for authors is
`src/library/game/tutorial/TUTORIAL_GUIDE.md`, the engine code is under `src/library/game/tutorial/`
and `src/library/components/Tutorial/`, and the reference script is `src/demo/market/tutorial.ts`.
Where the code and this document differ, the code and the guide win.

## Goals (from the brief)

- A host (the wrapper outside this repo) starts a match with a chosen tutorial. A game may ship several
  tutorials (per language, per feature flag).
- 2D overlay on top of the player: arrows that point at chits, rings/boxes around chits or groups of
  chits, a movable text box the script positions over time, with step forward / step back.
- The player is sometimes asked to do something. The script checks they did it, against game state,
  with flexibility about order and exact moves.
- One audio file per bit of text. Highlights can change mid-narration (after sentence 1, point
  somewhere else).
- Highlights can carry an x/y/z offset (point at part of a card).
- Looks good, colours customisable, easy to try in the Playground.
- When the script ends the bots keep playing and the match carries on.

## Assumptions (call these out if wrong)

1. **Tutorials are authored in the game's TypeScript**, next to `ai.ts`, with `defineTutorial(...)`,
   and the game lists them on `Game.tutorials`. The host picks one by id (or passes the spec object it
   got from the bundle). Reason: a script has to name chits ("the market deck", "your leftmost card")
   and check state ("you now hold 3 cards"); that is game code, typed against the game's chit classes.
   JSON specs with string selectors would be a second, weaker language for the same thing. Translation
   is handled by building the same step skeleton from a strings+audio table (see "Localisation").
2. **A tutorial runs the way a demo game runs**: an in-process `Match` on `EphemeralMatchStorage`,
   one human seat, every other seat a bot seated by `Match.seatAiPlayers`, nothing saved, no other
   tabs. Today's `DemoWrapper` already does exactly this, so it becomes the tutorial runner, and
   **a demo game is a tutorial with no steps**. The runner always owns the `Match`, so pinning draws, pausing
   the bots and reading state are direct calls. Real (stored, multi-player) matches never carry a
   tutorial.
3. **The overlay reads, never writes, the render loop.** It projects chit bounding boxes to screen in
   its own `requestSharedAnimationFrame` callback. `Viewer.tsx`'s loop is untouched.
4. **Checkers run on the client's copy of the game state** (the deserialised `Root` the player sees,
   hidden info already redacted). That is the exact view the player has, it is typed, and it works
   headlessly in tests. Nothing tutorial-related goes through the server prompt path.

## Authoring model

### The spec

```ts
import { defineTutorial, checks } from "@pretty-chitty/core";
import { Player, Root, Card } from "./chits";

export const introEn = defineTutorial<Player, Root>({
  id: "intro",
  locale: "en",
  title: "How to play",
  // The runner builds the match from this. Omit it and you get what the demo gets today:
  // setupDemoGame() for player count and options, "Human" + "Robot n" seats, bots everywhere but seat 0.
  match: {
    players: [{ name: "You" }, { name: "Robin", ai: { difficulty: 1 } }],
    options: { size: "small" },
    rng: [[0.9, 0.1, 0.4]],       // draws made during setup, before step 1 (the opening shuffle)
    ai: { thinkMs: [600, 900], temperature: 0 },
  },
  theme: { accent: "#ffcc66" },   // optional; otherwise derived from GameTheme
  steps: [
    {
      id: "welcome",
      text: "Welcome! This is your hand. The cards in the middle are the market.",
      audio: "tutorial/en/01-welcome.mp3",
      box: { anchor: "top-right" },
      cues: [
        { at: 0,   focus: [{ ring: (root, me) => me.hand }] },
        { at: 2.6, focus: [{ ring: (root) => root.market.cards, arrow: true }] },
      ],
    },
    {
      id: "take-a-card",
      text: "Take any card from the market by tapping it.",
      audio: "tutorial/en/02-take.mp3",
      box: { anchor: "near", target: (root) => root.market, side: "below" },
      focus: [{ arrow: (root) => root.market.cards, offset: { y: 0.3 } }],
      waitFor: checks.all(
        checks.countChanged((root, me) => me.hand, +1),
        checks.notPrompted(),            // the turn moved on
      ),
      hint: { after: 8, text: "Tap one of the highlighted cards." },
      allowUndo: true,
      rng: [0.12],                       // the refill draw after you take a card: the Knight comes up
    },
    {
      id: "robin-moves",
      text: "Robin takes the red card. Watch the log at the bottom.",
      audio: "tutorial/en/03-robin.mp3",
      focus: [{ arrow: { ui: "log" } }],
      ai: { p1: [{ key: "market.take", chit: (root) => root.market.cards.find((c) => c.color === "red") }] },
      rng: [0.77],                       // Robin's refill draw
      waitFor: checks.promptFor("me"),   // wait until it is our turn again
    },
    {
      id: "done",
      text: "That's the basics. Keep playing against Robin!",
      audio: "tutorial/en/99-done.mp3",
      end: "continue",
    },
  ],
});
```

Everything the step needs to find on screen is a function of `(root, me)`. It is re-evaluated every
frame, so arrows follow chits as they animate and survive the chit being re-deserialised.

### Types (engine side, `src/library/game/tutorial/defineTutorial.ts`)

```ts
type ChitSelector<P, R> = (root: R, me: P) => Chit | Chit[] | undefined;

type Target<P, R> =
  | ChitSelector<P, R>
  | { chit: ChitSelector<P, R>; offset?: { x?: number; y?: number; z?: number } } // local units of the chit's bbox
  | { ui: UiTarget }                 // "prompt.button:<label>" | "undo" | "log" | "panelTab:<chitId>" | "player:<id>" | "timeline"
  | { screen: { x: number | string; y: number | string } };

type Focus<P, R> = {
  arrow?: Target<P, R> | true;       // `true` = arrow to the ring target
  ring?: Target<P, R>;               // rounded rect/ellipse around the projected bbox (union if several chits)
  shape?: "ellipse" | "rect";        // default rect for cards, ellipse for round things? keep simple: rect
  dim?: boolean;                     // spotlight: darken everything else
  reveal?: boolean;                  // default true: swipe to the panel / scroll camera so it is visible
};

type BoxPlacement =
  | { anchor: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "top" | "bottom" | "center" }
  | { anchor: "near"; target: Target<P, R>; side?: "above" | "below" | "left" | "right" }
  | { anchor: "keep" };              // leave it where the user dragged it

type Cue<P, R> = {
  at: number | { sentence: number }; // seconds into the audio, or sentence index (0-based)
  focus?: Focus<P, R>[];             // replaces the current focus set
  box?: BoxPlacement;
};

type CheckResult = boolean | string;  // string = not yet, and why (shown as the hint)
type Checker<P, R> = (ctx: TutorialContext<P, R>) => CheckResult;

type TutorialContext<P, R> = {
  root: R;
  me: P;
  prompt?: PickPrompt;               // what the player is being asked right now (undefined if not their turn)
  clock: number;
  find<C extends Chit>(id: string): C | undefined;
  atStepStart: { root: R; clock: number };   // snapshot taken when the step was entered (for "changed by")
  recentLog: string[];
};

type TutorialStep<P, R> = {
  id: string;
  text: string;                      // markdown + the same :token: icons as the action log, see "Text in the box"
  audio?: string;                    // URL, resolved relative to the game bundle
  sentenceTimes?: number[];          // optional: start time of each sentence in the audio (for sentence cues + emphasis)
  box?: BoxPlacement;
  focus?: Focus<P, R>[];             // shorthand for a cue at 0
  cues?: Cue<P, R>[];
  waitFor?: Checker<P, R>;           // "do it" step: Next is locked until this passes, then auto-advances
  hint?: { after: number; text: string } | string;
  allowUndo?: boolean;               // show the Undo affordance in the box (calls prompt.stepBack())
  rng?: (number | number[])[];       // draws the game makes while this step is active, see "Scripting randomness"
  ai?: { [playerId: string]: ForcedDecision[] };   // what the bots do while this step is active, see "Scripting the bots"
  pauseAi?: boolean;                 // bots hold their prompts while this step is showing
  guard?: (option: AiOption) => boolean;  // v2: only these prompt options are clickable; others show the hint
  onEnter?: (ctx: TutorialContext<P, R>) => void;
  onExit?: (ctx: TutorialContext<P, R>) => void;
  end?: "continue" | "back";         // marks the last step and what happens after
};

type TutorialSpec<P, R> = {
  id: string;
  locale: string;                    // BCP-47, "en", "es-MX"
  title: string;
  requires?: string[];               // feature flags the host must have on; purely informational for the host
  match?: {                          // all optional; defaults come from RootChit.setupDemoGame() like the demo today
    players?: { name: string; ai?: AiSeatInfo; imageUrl?: string }[];  // seat 0 is the human unless humanSeat says otherwise
    humanSeat?: number;
    options?: any;
    rng?: (number | number[])[];     // draws made during setup, before the first step
    ai?: SeatAiPlayersOptions;       // how the bots play when no step forces a move (default temperature: 0)
  };
  strict?: boolean;                  // dev: throw on a stale pinned draw or an unmatched forced move (default: warn)
  theme?: Partial<TutorialTheme>;
  steps: TutorialStep<P, R>[];
};
```

`Game` gains `tutorials?: TutorialSpec<P, R>[]`, exactly like `ai`. A spec with `steps: []` is a plain
demo game; the runner treats "no tutorial given" as that.

### Checkers

Checkers are plain predicates on state, so "did the user do it right" tolerates order and alternatives
by construction: `checks.any(...)`, `checks.all(...)`, or a hand-written function. Ship a small
library in `checks.ts`:

| Helper | Passes when |
|---|---|
| `countChanged(sel, delta)` | `sel(root, me)` has `delta` more (or fewer) chits than at step start |
| `moved(sel, parentSel \| outlet)` | every chit in `sel` now lives under the given parent/outlet |
| `prop(sel, key, pred)` | a chit property matches (`prop(me => me, "money", m => m >= 5)`) |
| `promptFor("me" \| "other" \| "none")` | whose turn it is |
| `promptMessage(/regex/)` | the current prompt message matches |
| `logged(/regex/)` | a log line since step start matches |
| `clockAdvanced(n?)` | at least `n` clock ticks since step start |
| `any(...)`, `all(...)`, `not(...)` | combinators |

Returning a string instead of `false` lets a checker explain itself ("You took a card, but not from
the market."), which the box shows as the hint without the author writing a second branch.

### Text in the box

Step text is markdown with the game's `:token:` icons inline, rendered by one new component,
`TokenizedMarkdown`, which the box, hints and the end screen all use:

- `react-markdown` (already a dependency) does the structure: paragraphs, **bold**, *italics*,
  bullet and numbered lists, headings, links, images, block quotes. No raw HTML.
- Every text node is run through `parseMessageTokens` with the same `useTokenMap()` the action log
  uses, so `:p1:`, `:coin:`, `:thingy:` render exactly as they do in log lines, player avatars included.
  No new icon registry: whatever is in `game.tokenMap` is available.
- Images: `![alt](tutorial/en/market.png)` for a file in the game bundle, or
  `![alt](token:thingy)` to render a token's `ImageSpec` (spritemap art) at image size rather than
  inline icon size. Images are capped to the box width and keep their aspect.
- Sentence emphasis and `{ sentence: n }` cues count sentences across the text nodes in document
  order, so a bullet list of three one-sentence bullets is three sentences.

```ts
text: `**Your turn.** Take a card from the market:

- a :coin: card gives you money now
- a :thingy: card scores at the end

![The market](token:market)`,
```

`TokenizedMessage` stays as it is for single-line places (log, prompt bar). Prompt help text
(`pick.help`) can switch to `TokenizedMarkdown` for free later; PromptControls already has a
commented-out `<Markdown>` for it.

### Scripting randomness

Pinned draws live on the step they belong to. `step.rng` lists the values the game's `turn.rng()` /
`turn.takeRng(n)` calls return while that step is active, in call order; `match.rng` covers the draws
made during setup before step one (the opening shuffle). A plain number answers one `rng()`; an array
answers one `takeRng(n)` (length must equal `n`, otherwise the runner throws with the step id and call
index). So the author reads a step and sees, in one place, what they say, what the player must do,
and what the world does in response.

How it runs: steps are sequential, so the runner concatenates `match.rng` and every `step.rng` in
step order into one queue and feeds it to the match; the game consumes it in call order. The step
boundary is not a hard gate (a bot can draw a beat after the narration auto-advanced, and draws must
never block the game), but each value remembers which step declared it, and the runner compares that
with the step that was active when it was consumed. A mismatch is a warning in the dev panel, or a
throw with `strict`, because it means the author's model of "which draw happens when" is off, and the
narration is probably wrong too. When the queue is exhausted the match falls back to `Math.random`,
so the scripted part is fixed and the rest of the game is a normal game.

No seed: a seed makes a deal repeatable but not chosen. Pinned values are what an author actually
needs ("the top card is the Knight"), and they are honest about the cost: if the game's rules or setup
order change, the values may stop producing the intended deal and have to be re-tuned by playing with
them until the right thing comes up. The Playground makes that cheap (see "RNG log" below). Engine
side this is one injection point: `TurnState` draws from an `RngSource` the `Match` is given instead
of calling `Math.random` directly; draws are persisted in `decisions` exactly as today.

### Scripting the bots

Same shape, same reason: `step.ai` gives each bot the forced decisions it makes while that step is
active, wired into the existing `AiPlayerOptions.choose` hook per seat. The runner concatenates them
per bot in step order into one queue, with the same step attribution and the same stale-entry warning.

```ts
type ForcedDecision = {
  key?: string;                        // the pick's .ai("key")
  chit?: ChitSelector<P, R>;           // for chit and drag options: the chit (or any of the chits) to play
  target?: ChitSelector<P, R>;         // for drag options: where to drop it
  button?: string;                     // for button options: the label
  when?: (ctx: TutorialContext<P, R>) => boolean;   // only consume if this holds
};
```

On every prompt the bot takes the first unconsumed entry; if it matches exactly one scored option,
that option is played and the entry is consumed. If it matches nothing (the human did something that
changed the board, so the option is gone) the bot plays normally and the entry stays, unless
`strict` is on, which throws so the author sees it in the Playground. When the queue is empty the bot
plays normally with `match.ai` (default `temperature: 0`, so even "normal" play is predictable).
Selectors run against the bot's live view, which in a demo match is the match's own objects.

This is what lets a step say "Robin takes the red card, watch" and be right.

### Localisation

The engine is locale-agnostic. The recommended pattern in game code is one skeleton, many tables:

```ts
const makeIntro = (locale: string, t: IntroStrings, audio: (key: string) => string) =>
  defineTutorial<Player, Root>({ id: "intro", locale, title: t.title, match, steps: [
    { id: "welcome", text: t.welcome, audio: audio("welcome"), ... },
  ]});

export const tutorials = [makeIntro("en", en, k => `tutorial/en/${k}.mp3`), makeIntro("es", es, k => `tutorial/es/${k}.mp3`)];
```

Sentence cue indices stay valid across languages as long as translators keep sentence counts; time
cues (`at` in seconds) need per-locale values, which is why `cues` live in the table too when audio
timing differs.

## Runtime design

### Pieces

```
DemoWrapper (game, tutorial?)        today's demo runner: ephemeral Match, seat p0 human, bots elsewhere
  └─ MatchViewer
       ├─ TutorialProvider            holds TutorialController (plain class, EventChannels); absent for a step-less demo
       ├─ TopBar / PanelContents / BottomBar   (existing; gain data-tutorial-target attrs + PanelNavigation)
       └─ TutorialOverlay             absolute, inset 0, pointer-events none, zIndex 250
            ├─ <svg> highlights + arrows (recomputed per frame from projected bboxes)
            └─ TutorialBox            draggable, pointer-events auto
```

`DemoWrapper` keeps its name and its no-argument behaviour. With a `tutorial` it builds the match from
the spec's `match` block (falling back to `setupDemoGame()` for anything omitted), seats the bots, and
hands the `Match` to the provider. `ClientTrustMatchViewer` and `ServerTrustMatchViewer` are untouched.

**TutorialController** (`src/library/game/tutorial/TutorialController.ts`)

- State as EventChannels: `stepIndex`, `status` (`idle | narrating | waiting | satisfied | done`),
  `activeFocus`, `boxPlacement`, `audioTime`, `hint`.
- Inputs: `clientTime.rootChit` / `currentClock` (re-run `waitFor` on every change), `clientPrompts.currentPrompt`
  (for `prompt`, `pauseAi`, `allowUndo`), `clientTimeState.live` (overlay hides while scrubbing history),
  the audio element's `timeupdate` (cues).
- Owns one `HTMLAudioElement`. Mobile browsers need a user gesture before audio plays, so the tutorial
  opens with a "Start" tap on the box; that gesture unlocks audio for the rest of the session. Without
  audio (or audio muted), cue `at` times run on a reading clock (`words / 3 per second`) so scripts
  behave the same.
- `next()` / `back()`: back always allowed (re-enters the previous step's cues at 0, no game undo).
  Next is locked while a `waitFor` step is unsatisfied; a satisfied step auto-advances after a short
  beat so the player sees the confirmation state.
- `pauseAi`: toggles `match.ai.enabled` on the `Match` the runner owns.
- Persistence: none. A demo match is ephemeral, so a reload restarts the tutorial from step one, same
  as reloading a demo restarts the game. If that turns out to hurt (long tutorials on flaky phones),
  the step index can go in localStorage keyed by tutorial id and the match can move to
  `LocalMatchStorage`; both are small, later changes.
- Events for the host: `onEvent({ type: "started" | "step" | "completed" | "skipped", stepId })`.

**Target resolution** (`useTargetRects.ts`)

- Chit targets: `chit.renderInstance.bbox` is a unit box scaled/positioned to the chit's bounds. Take
  its 8 corners (plus the optional offset, in the bbox's local units so `{ y: 0.3 }` means "30% up the
  card"), `localToWorld`, `project(rootRenderInstance.camera)`, then
  `rootRenderInstance.convertCameraSpaceToScreenSpace`. The screen rect is the union of the corners,
  intersected with the panel's own bounds (so a chit half off-panel is clipped, not drawn over the
  neighbour). Several chits → union rect for the ring, individual rects for arrows.
- Chits with no render instance yet (still deserialising / animating in) are skipped that frame.
- UI targets: elements opt in with `data-tutorial-target="prompt.button:Pass"`. Add the attribute to
  `BottomBarButton` (label-based), the Undo button, `PanelTab`, `TopBarPlayers`, `TimeControlBar`,
  `ActionLogDisplay`. Resolution is one `querySelector` + `getBoundingClientRect`.
- All rects are converted into the overlay's coordinate space (overlay root's bounding rect).

**PanelNavigation** (`usePanelNavigation.tsx`, provided by `PanelContents`)

New, small, and useful beyond tutorials:

- `revealChit(chit): Promise<void>` finds the panel that owns the chit (walk `parent` until a chit that
  appears in `getFlatLayout`), and if that panel sits in a `MultiPanel` tab stack, selects it via the
  existing `manuallyChangeSelectedIndex` (that is the "swipe"). If a `focusedPanel` is zoomed in on
  another panel, clears it first. Resolves after the slide transition (`ANIMATION_DURATION`) so arrows
  fade in once the panel is in place.
- Camera: if the projected rect is outside the panel after the reveal (user zoomed in), nudge via
  `cameraWrapper.handlePan` toward the target. Best-effort; v1 can stop at the panel switch.
- Chits inside a gallery render (`absorbsClickEventsForChildren`) resolve to the gallery container.
  Opening the gallery automatically is a v2 item.

**TutorialOverlay** (`src/library/components/Tutorial/`)

- `TutorialOverlay.tsx`: mounts when the provider has a controller and `live` is true. A full-size
  `<svg>` for rings/arrows/dim mask and the `TutorialBox` on top. Updates rects every frame while a
  focus is active (and stops the loop when there is none).
- `TutorialHighlight`: rounded rect (or ellipse) with padding, 2px stroke in `highlightColor`, soft
  outer glow, a slow pulse (scale 1 → 1.03). `dim: true` uses an SVG mask so everything but the
  targets drops to `dimColor` at `dimOpacity`.
- `TutorialArrow`: quadratic curve from the box's nearest edge (or from a free point if the box is
  hidden) to the nearest edge of the target rect, with an arrowhead, a short "nudge" animation along
  the curve. Colour `arrowColor`. Re-routes when the box is dragged.
- `TutorialBox`: card with `boxBackground`, `boxTextColor`, `accent`; grab handle on the title row
  ("Step 3 of 9"); body uses `TokenizedMarkdown` (see "Text in the box") so lists, images and
  `:p1:`-style tokens render; current sentence is emphasised while narrating (others at 60% opacity)
  so a mid-text cue change reads naturally. Footer:
  Back, Play/Pause (hidden without audio), Next (or a "Your move" state with a pulsing dot while
  waiting), Undo (when `allowUndo` and `prompt.canReset`), Skip (long-press to confirm). Drag with
  pointer events (not Hammer, to stay out of `PanelContents`' gesture manager); CSS transition on
  position when the script moves it. On `mobile` layout (`theme.layoutSize`), it docks below the top
  bar at full width and `near` placements fall back to top/bottom.
- z-index: new `ZINDEX_TUTORIAL = 250` (above the top bar at 210; galleries at 160 stay below, so a
  step can point at a gallery's container but not into a modal; document that).

**Theme** (`TutorialTheme.ts`)

```ts
type TutorialTheme = {
  boxBackground: string; boxTextColor: string; accent: string; boxShadow: string; borderRadius: number;
  arrowColor: string; highlightColor: string; highlightGlow: string; dimColor: string; dimOpacity: number;
  fontFamily: string; fontScalar: number;
};
```

Defaults derive from `GameTheme` (`barTopDropdownColor`, `barActiveTextColor`, `chitHighlightColor`,
`fontFamily`). Overridable in three layers: `GameTheme.tutorial` (game default), `TutorialSpec.theme`
(per tutorial), and a `tutorialTheme` prop from the host (per deployment).

### End of a tutorial

The last step has `end: "continue"`. On Next the controller fires `completed`, the overlay unmounts,
`match.ai.enabled` is restored, and what is left is exactly a demo game: the same ephemeral match,
bots seated since the start, the player keeps playing. `end: "back"` calls `onBack` instead. Skip
behaves like `continue`.

## Engine changes outside the tutorial folder

| Change | Why |
|---|---|
| `Game.tutorials?: TutorialSpec[]` | discovery; same shape as `ai` |
| `Match` accepts an `RngSource`; `TurnState` draws from it instead of `Math.random` | pinned draws; values are persisted in `decisions` as today, so replay/undo are unaffected |
| `connectAiPlayer` gains nothing: the runner builds a `choose` per seat from the steps' `ai` queues | forced bot moves on an existing hook |
| `DemoWrapper` props `tutorial?: string \| TutorialSpec`, `tutorialTheme?`, `onTutorialEvent?`, `onBack?`; builds the match from the spec's `match` block and hands the `Match` to the provider | the runner; a demo is the no-tutorial case |
| `MatchViewer` renders `TutorialOverlay` as the last child of the outer `Stack` | overlay mount |
| `PanelContents` provides `PanelNavigation`; `MultiPanel` registers a `select(chit)` | swipe-to-reveal |
| `data-tutorial-target` on bottom bar buttons, undo, panel tabs, top bar players, log, timeline | pointing at UI |
| `listTutorials(game)` → `{ id, locale, title, requires }[]` | hosts choose by language/flags without touching specs |
| exports in `index.ts` | `defineTutorial`, `checks`, types, `runTutorial`, `listTutorials` |

Host-side (not this repo, Josh applies): the CLI's generated `entry.tsx` grows
`createDemoMatchViewer(container, tutorial?, { theme?, onEvent?, onBack? })` and exports
`listTutorials`. The wrapper picks a tutorial by language and flags and calls that; no storage, players
or AI plumbing on its side. Every game bundle needs a rebuild once core ships this.

## Playground / sandbox

- The **Demo** tab (today a redirect to `/demo`) becomes the tutorial workbench: a select listing
  `game.tutorials` as `title (locale)` plus "Demo (no tutorial)", a Restart button, and the
  `DemoWrapper` below it. The URL mirrors the choice (`/demo?tutorial=intro`) so a phone can open the
  same thing full-screen. Restart rebuilds the ephemeral match and replays the pinned draws.
- **Tutorial dev panel** (right-hand drawer, toggle in the Demo tab's toolbar, never in production):
  - step list with the current one marked; click to jump (re-enters the step; game state is whatever
    it is, which is also how you test "what if they're already past this?");
  - live `waitFor` result and hint text, re-evaluated on every clock change;
  - cue timeline: a scrubber over the audio with cue markers; **Record timings** plays the audio and
    logs a time on each keypress, then prints a `cues: [...]` / `sentenceTimes: [...]` snippet to copy;
  - **RNG log**: every draw in order (the step that was active, the step that declared the value,
    count, values, the log line that followed, pinned vs `Math.random`), mismatches highlighted, with
    "copy as `rng: [...]`" per step so an author can play a demo until the deal looks right, copy the
    values into the step, and pin them; editable in place with Restart to re-tune after a rules change;
  - **Bot decisions**: the `onDecision` stream per seat, with the forced entry that matched (or did
    not), which step declared it, and the queue's remaining entries;
  - toggles: mute audio (reading clock), show target rects, slow animations (reuses
    `animationSpeedMultiplier`), theme overrides with live colour pickers that print the resulting
    `theme: {}` block.
- Hot reload already covers spec edits because the spec is game code.
- The demo game ships `src/demo/tutorial.ts` as the reference script, exercising every feature
  (arrows, rings with offset, sentence cues, waitFor with hints, undo, pauseAi, UI targets).

### Headless test helper

`runTutorial(spec, { answer })` in `src/library/game/tutorial/runTutorial.ts`, modelled on
`simulateMatches`: creates the match the same way `DemoWrapper` does (shared `createDemoMatch(game,
spec)` helper so the test and the runner cannot drift), seats bots, drives the human seat
through a scripted `answer(prompt, step)` callback, and asserts each `waitFor` becomes satisfiable in
order, failing with the step id if a step dead-ends. Checkers never touch rendering, so this runs in
vitest. The demo game gets one such test; the board-game-port skill can require one per tutorial.

## Delivery plan

Phases are independently shippable; each ends with the demo tutorial exercising what landed.

1. **Foundation (engine, no UI)**: types, `defineTutorial`, `checks`, `Game.tutorials`, `RngSource`
   in `TurnState`, forced-decision `choose` builder, `createDemoMatch` shared by `DemoWrapper` and
   tests, `TutorialController` with step/cue/waitFor logic driven by a fake clock, `runTutorial` test
   helper, demo `tutorial.ts` + vitest. ~2 days.
2. **Overlay**: target projection, `PanelNavigation.revealChit`, SVG rings/arrows/dim,
   `TokenizedMarkdown`, the box with drag + placements + sentence emphasis, theme, audio with cues,
   `data-tutorial-target` attributes. ~3–4 days. This is where the "feel" work is; budget a polish pass
   on mobile.
3. **Interaction**: waitFor wiring to client state, hints, undo, `pauseAi`, persistence, end-of-tutorial
   handoff, host events. ~1–2 days.
4. **Playground**: Demo tab as workbench, dev panel, cue recorder, `/demo?tutorial=`. ~2 days.
5. **Hosts + docs**: `DemoWrapper` props, `listTutorials`, exports, `TUTORIAL_GUIDE.md` (same shape
   as `AI_GUIDE.md`, written for a coding agent porting a game). CLI `createDemoMatchViewer` and wrapper
   edits are Josh's. ~0.5 day in this repo.

## Risks and open questions

- **Projected rects during panel slides**: `MultiPanel` animates panels with CSS transitions, so rects
  move for 125 ms after a reveal. Arrows fade in after `revealChit` resolves; rings just follow.
- **Overlay vs gestures**: the overlay is `pointer-events: none` except the box, so taps and pans still
  reach `PanelContents`' Hammer manager. The box must stop propagation so dragging it never pans a panel.
- **Audio on iOS**: needs the Start tap; also `audio.play()` can reject if the tab is backgrounded.
  Cues fall back to the reading clock if playback fails.
- **Galleries and modals** sit below the overlay but above the panels; v1 points at containers only.
- **Checkers see redacted state**: fine for tutorials, but a step cannot check an opponent's hidden
  hand. Document it.
- **Where tutorials live**: this proposal says game code. If the wrapper needs to ship tutorials
  without rebuilding the game bundle, add a JSON form later whose selectors are names registered by the
  game (`root.named("market")`). Not recommended for v1.
- **No resume**: a reload restarts the tutorial, like a demo. Cheap to add localStorage resume later.
- **Pinned rng is brittle by design**: a rules or setup-order change can shift which draw feeds which
  shuffle. The `runTutorial` test catches it in CI (a step's `waitFor` stops being reachable, or a
  `takeRng` length mismatch throws), and the RNG log makes re-tuning a few minutes' work.
- **Forced bot moves can go stale** when the human plays differently than the script assumed. Default
  is to warn and play normally; write the narration so it does not depend on an exact bot move unless
  the step pins the human's move too (`waitFor` + `guard`).
- **Tutorials inside real matches**: deliberately not supported. If a game ever wants in-match coaching
  (hints during a stored multiplayer game), the overlay and checkers carry over; only the runner differs.
