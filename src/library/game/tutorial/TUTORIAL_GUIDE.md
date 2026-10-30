# Writing a scripted tutorial for a Pretty Chitty game

This guide is for whoever adds a tutorial to a game, whether a person or a coding agent. Follow it
top to bottom. When you're done:

- `src/tutorial.ts` exports one `defineTutorial(...)` per locale, listed on `Game.tutorials`,
- every step either narrates or asks the player to do one thing and checks it against game state,
- every random draw and every bot move the script relies on is pinned to the step it happens in,
- a `runTutorial` test proves the script can be completed.

The reference implementation is the engine's own demo: `src/demo/market/tutorial.ts` (the script),
`src/demo/market/MarketGame.ts` (the game it runs on) and `src/demo/market/tutorial.test.ts`.

---

## How it works (read this first)

- A tutorial runs **the way a demo game runs**: an in-process match on ephemeral storage, the person
  in one seat and an engine bot in every other seat. A demo *is* a tutorial with no steps. Hosts start
  one with `DemoWrapper` (`createDemoMatchViewer` in a bundle); the Playground's **Demo** tab lists
  every tutorial the game declares.
- The script is a list of **steps**. A step shows text in a floating box (markdown with the game's
  `:token:` icons), optionally reads it aloud, and draws **rings** and **arrows** on a 2D layer over
  the player. Targets are selectors over game state (`(root, me) => me.hand`), re-resolved every
  frame, so highlights follow chits as they move and the overlay switches to whatever panel holds
  them.
- A step with `waitFor` is a **"do it" step**: the box says "Your move" and shows no Next until
  the check passes, then the tutorial moves on by itself. Checks are predicates on the state the player sees, so order and
  alternatives are tolerated by construction.
- **The game only accepts what the script allows.** While a tutorial runs, every tap, drag, button
  and undo goes through a guard: a narration step lets nothing through, and a "do it" step lets
  through only the moves in its `allow` list. Anything else is dropped and the box shows the hint.
  The game's **Undo button is the tutorial's Back** while a tutorial runs: it shows exactly when it
  normally would, and pressing it (or long-pressing it) puts the board back the same way the box's
  Back does. When the tutorial ends, everything is allowed again.
- **Acting ahead is stepping forward.** If, while a narration step is talking, the player makes a
  move the *next* "do it" step allows (or taps a control it lists as `{ ui }`), the tutorial jumps
  to that step and the move goes through. The steps skipped over still count as seen: their
  snapshots are taken for Back and their `onEnter`/`onExit` and step events run, but their
  narration, focus and gallery commands do not. The "do it" step itself is not narrated, since it
  would only ask for what was just done; it moves on after the usual short beat once its check
  passes, and narrates as usual if the check does not pass. Only the first "do it" step ahead counts,
  so nothing jumps past a step that waits.
- A step without `waitFor` **narrates and moves on by itself** when its audio ends (or its reading
  clock, when there is no audio). Set `pause: true` to wait for Next instead. The last step always
  waits for Finish.
- **Back puts the game back** where it was when that step started. The runner snapshots the match as
  each step goes live; Back hands that snapshot to the running match, which reruns from it in place
  (decisions replay deterministically, the pinned draws and forced moves rewind with it) while the
  viewer animates the board back. Rapid presses queue up. **Back also pauses the tutorial**: the
  bots hold their moves, further Back and Next presses move silently between steps, and nothing plays
  or advances until the player presses **Resume** (or completes a "do it" step, which counts as
  resuming). Headless runs have no match to rewind, so there Back only reviews the earlier step's text.
- **The box never sits on what the step points at.** It takes the step's `box` placement unless that
  hides a ring or arrow target, in which case it moves to the corner that hides the least, and it
  moves again when a cue changes the targets. A dragged box stays put unless a target appears under it.
- Randomness and the bots are **scripted per step**: `step.rng` pins the values `turn.rng()` returns
  while that step is active; `step.ai` forces the bots' moves. **A bot whose next scripted move
  belongs to a later step waits for that step** to be on screen, so the move happens while the step
  narrates it. It still answers the engine's own Confirm meanwhile (ending a turn the script never
  mentions), unless that Confirm is the scripted move. Once the script runs out, the match carries on normally with the same bots.
- A **"do it" step that passes while it is still narrating finishes the narration** before moving
  on (Next skips the wait).

What the engine does for you. **Do not reimplement these:**

| Situation | What the engine does |
|---|---|
| Target chit is in another panel (phone tab stack) or a zoomed panel | Switches to it, then draws (nothing is ringed while its panel is behind another) |
| On a small screen (shorter side under 700 px), everything a step rings on the table sits in one panel with under 60% of the screen | Shows that panel full screen, as zooming in does (every panel becomes a tab at the bottom); a step ringing things in several panels goes back to the normal layout, so they show side by side. Already full screen (the player zoomed in), it switches tabs instead of leaving |
| A ringed thing is still tiny (under ~56 px with the whole table shown) | Zooms its panel's camera in until it is readable, centred, and back out when the step moves on (not if the player zoomed meanwhile). Rings in a gallery do not zoom, nor a ring with `zoom: false` (which leaves the framing as it is: for rings that only flash by); `zoom: 1.6` zooms that much on a small screen whatever the size (a group of small things); the framing waits half a second, so rings that follow each other quickly (one per word) do not move it |
| A prompt's own strip (a toggle button's gallery that opens by itself) is up while the player only watches | Puts it away so the board gets the room; it comes back when it is the player's move or a step points into it (a gallery target, a `gallery:`/`button:` UI target, or one of its chits). A strip the player opens stays open |
| Narration on a phone | The next step's recording loads while a step talks; the box shows about four lines and scrolls to keep the spoken sentence in view, and stays on screen when dragged |
| Audio on a phone | Plays after the Start tap (the gesture browsers require) |
| No audio file yet | `audio: "tts"` reads the text with the browser's speech synthesis (authoring only; voices vary per device) |
| No audio at all | Cues run on a reading clock (3 words/second) |
| A pinned draw has the wrong length, or lands in a different step than declared | Warns in the console and the dev panel (throws with `strict: true`) |
| A forced bot move matches no legal option | Warns; the bot plays normally |
| Engine Confirm prompts ("confirm draw or roll", "confirm turn end") | Nothing special: point at `{ ui: "button:Confirm" }` and check the state after |

---

## Before you start — make the game focus its picks

The engine brings a panel to the front on the player's turn only for picks that call `.focus()`
(`Chit.pick(cards, …).focus()`, `Chit.dragPick(hand, …).focus()`). A game that skips it leaves the
tab stack wherever the last animation put it, which on phones means the player's own panel can be
hidden on their turn. The tutorial's reveal is a backstop for what a step points at, not a substitute.
Check every pick the script will ask for:

```sh
grep -rn "Chit.pick\|Chit.dragPick" src/ | grep -v "\.focus("
```

## Step 1 — Decide the deal

A tutorial is written against one fixed board. Work out, in order, every random draw the game makes
before and during the script, and what you want each to produce:

1. The engine shuffles the seats first: one `takeRng(2 × seats)` draw. Zeros keep the order.
2. Then whatever `Game.run` draws before its first prompt (the deal).
3. Then each draw that happens while a step is active (a refill after a buy, a bot's draw…).

Find your game's draws with:

```sh
grep -rn "rng(\|takeRng(\|\.draw(\|\.shuffle(" src/
```

Write a helper that turns "I want *this* card" into the numbers, so the script stays readable. The
demo's `pinDraws` does it for its deck. Pinned values are honest about their cost: if the rules or the
setup order change, re-tune them in the Playground (the RNG log has "copy rng" per step).

## Step 2 — Write the match block

```ts
match: {
  players: [{ name: "You" }, { name: "Robin", ai: {} }, { name: "Sam", ai: {} }], // seat 0 is the person
  options: { rounds: "3" },                 // match options, like the Playground's dialog
  rng: [[0, 0, 0, 0, 0, 0], ...SETUP_DRAWS], // seating shuffle, then the deal
  ai: { thinkMs: [600, 1000] },             // bots: temperature 0 by default, so "normal" play is predictable
},
```

Omit `match` entirely and you get the demo's defaults (`setupDemoGame()` seats, bots everywhere but seat 0).

The start card (before the player taps Start) shows the spec's `intro` (markdown), or the first
step's text when there is none. Use `intro` for a welcome line instead of a title-card step.

## Step 3 — Write the steps

```ts
{
  id: "buy",                                   // stable, unique; shows in logs and the dev panel
  text: "**Your move.** Buy a card: tap any highlighted card you can afford.",
  audio: narration.en.buy.url,                 // an imported MP3 (see "Narration files"); "tts" while authoring
  sentenceTimes: narration.en.buy.sentenceTimes,
  box: { anchor: "top-right" },                // or { anchor: "near", target, side }, or "keep"
  focus: [{ ring: affordable, arrow: true, dim: true }],
  cues: [{ at: { sentence: 1 }, focus: [...] }],   // change highlights mid-narration
  allow: { key: "market.buy" },                 // the only moves accepted while waiting; "any" opens everything
  waitFor: checks.countChanged((root, me) => me.hand, 1, "Tap one of the highlighted cards."),
  hint: { after: 6, text: "…" },               // shown if the check hasn't passed after 6 s
  pause: true,                                 // wait for Next after the narration (default: move on by itself)
  pauseAi: true,                               // bots hold their prompts during this step
  rng: [[0.5, 0.5]],                           // draws made while this step is active
  ai: { p1: [{ key: "market.buy", chit: affordable }] }, // forced bot moves while active
},
```

Rules of thumb:

- **One action per "do it" step.** If the engine will ask for a Confirm afterwards, make that its own
  step with an arrow at `{ ui: "button:Confirm" }` and `allow: { button: "Confirm" }`.
- **Every "do it" step needs `allow`.** It is matched like a forced bot move: `key`, `chit`,
  `target`, `button`, or `"any"`; `allow: []` says the step waits for the bots, not the player. The
  dev panel flags a waiting step without one, and `runTutorial` warns and then gets stuck on it.
- **Check state, not events.** `checks.state((root) => root.market.cards.length === 4)` passes
  whether the player confirmed just now or a second before the step started.
  `checks.logged(...)` only sees log lines written *during* the step.
- **Narrate what the bots do only when you force it.** A step that says "Robin buys a card" has
  `ai: { p1: [{ key: "market.buy", … }] }` on it and `waitFor: checks.promptFor("me")` so the
  tutorial waits for the bots to finish.
- **Pause the bots while you talk** (`pauseAi: true`) when the next thing the bots do would change
  what the step is pointing at.
- **Highlight as many regions as the step needs.** `focus` is a list; each entry has its own ring
  and arrow (`[{ ring: hand }, { ring: tableau, arrow: true }]`). A ring around several chits is one
  box around all of them; add `separate: true` to ring each one on its own. `dim` keeps every ring
  and arrow target of the step lit.
- **Point at parts of a chit** with `{ chit, offset: { y: 0.3 } }` (bbox units, half-extent 0.5, +y
  toward the top of the chit) and `scale: { y: 0.3 }` to ring a band of it.
- **UI targets:** `button:<Label>`, `undo`, `log`, `time`, `players`, `prompt`,
  `spark:<chitId>` (a counter, use `(root, me) => \`spark:${me.coins.id}\``), `panelTab:<chitId>`,
  and the gallery ones below. Any component can expose more with a `data-tutorial-target` attribute.
- **Last step** has `end: "continue"` (keep playing) or `"back"`.

### Galleries

Some actions only happen in a gallery (a hand shown as a strip, a toggle button's cards), so a
tutorial can point into galleries, open and close them, and wait for the player to open one. The
demo's `market-button`, `gallery-tour` and `buy` steps use all of it.

- **Rings and arrows reach gallery items.** A chit selector finds the chit in an open gallery first
  (full-screen, then inline), then on the table, so `ring: (root, me) => me.hand.tryGet(0)` circles
  the card where the player can tap it. An item scrolled out of the gallery's view is scrolled in.
  `offset`, `scale`, `separate` and `dim` work the same. Identical chits merged into one "2x" item
  resolve to that item.
- **The gallery controls are UI targets:**

  | Target | What it is |
  |---|---|
  | `button:<Label>` | the show/hide toggle in the bottom bar (a `ToggleGalleryButton`, e.g. `button:Hand`) |
  | `gallery:toFullscreen` | the inline gallery's "full screen" button |
  | `gallery:toInline` | the full-screen gallery's "back to inline" button |
  | `gallery:modeButton` | whichever of those two is showing |
  | `gallery:inline` / `gallery:fullscreen` | the gallery itself, to ring the whole strip or screen |
  | `gallery:context` | the small context gallery in the prompt bar |

- **The script can open, switch and close galleries** with `gallery` on a step or a cue:
  `{ of: (root, me) => me.hand }` shows a container's children (like tapping it),
  `{ items: (root) => root.market.cards }` shows exactly those chits, `{ mode: "fullscreen" }` moves
  the open gallery to full screen (or `"inline"`), and `"close"` closes it. `mode` defaults to the
  player's own inline/full-screen choice. A gallery the script opened stays until a step or cue
  changes it; Back closes it.
- **Waiting for the player to open one:** `waitFor: checks.galleryOpen({ of: hand })` (or
  `{ mode: "fullscreen" }`; `checks.galleryClosed()` for the reverse), with
  `allow: { ui: "button:Hand" }` to say the step waits for the player to use a control rather than
  make a game move. Gallery buttons are never blocked by the guard; taps on gallery items that make
  a move go through `allow` like any other move. Tapping that control during an earlier narration
  step acts ahead, as above.
- **Headless:** `runTutorial` has no buttons, so a step that waits for the player to open a gallery
  needs `ui: (step, ui) => step.id === "open-hand" && ui.gallery({ of: (root, me) => me.hand })`.

### Poses: changing how chits look

A pose sets properties on the **player's own copy** of a chit, and the engine renders and animates
the change as it would any other: a card flips over, a token turns. The match never hears of it, so
rules, checks, bots and the history are untouched. Put `pose` on a step (from its start) or on a cue
(from that point of the narration):

```ts
{
  id: "welcome",
  // the market starts face down...
  pose: [{ chit: (root) => root.table.market.cards, set: { faceDown: true } }],
  cues: [
    // ...and turns over as the narration reaches it: no `set` puts the chit back as the game has it
    { at: { sentence: 3 }, pose: [{ chit: (root) => root.table.market.cards }] },
  ],
}
```

- **`set`** is an object of properties or a function `(chit) => { ... }`. Its effect is whatever the
  chit's `render` does with those properties, so the game needs a property that drives the look you
  want (Petty Market's `Card.faceDown` turns the card with `spec.rotateY = Math.PI`).
- **How long it lasts:** until the step ends, unless the pose sets `keep: true`; then until a later
  pose of that chit or the end of the tutorial. Back puts every pose back, and the step it lands on
  poses its own again. A step that poses the same chit as the step before keeps it posed without a
  flicker.
- **The game wins.** If the match changes a posed chit, the client loads the new state over the pose.
- **Only properties come back.** Don't move chits between parents with a pose.
- **It can only show what the client knows.** A property the server hides from this player (a
  face-down card's face) is not on the client, so a pose cannot reveal it.
- `runTutorial` ignores poses: they are looks, not state.

### Holding the board's timeline

The board plays the game's moments (clocks) one after another, animating each. `timeline` on a step
or cue holds it on a moment so the narration can talk about what just moved, while the game itself
carries on behind it. It changes only this player's view.

```ts
{
  id: "robin",
  // play Robin's buy and the market refill, then hold there...
  timeline: { until: checks.logged(/A new card joins the market/) },
  // ...and play on (Sam's pass, then the player's prompt) at the next sentence
  cues: [{ at: { sentence: 1 }, timeline: "play" }],
}
```

- `"hold"` stops at the moment on screen. `{ advance: n }` plays `n` more moments, then stops.
  `{ until: check }` plays on until a moment where the check passes (its `recentLog` counts from the
  command). `"play"` catches up with the game and follows it again.
- A hold lasts until a later command, Back, or the end of the tutorial. The Skip/Live and Forward
  buttons stop at it too.
- Release the board before a step that needs it: the player's prompt and most `waitFor` checks only
  show up once the board reaches them. A "do it" step entered while the board is held warns in the
  console unless it sets `timeline` itself.
- A play-through from the workbench ignores holds until it lands.

### Narration files

Ship recordings, not browser speech: an MP3 per step plus `sentenceTimes` (start of each sentence,
in seconds) so sentence cues and the emphasis are exact. Split text with the exported
`splitSentences` in your narration tooling, so its sentence count always matches the cues'. The demo generates its files with the
machine's text-to-speech so the pipeline is real end to end: `yarn demo:audio` renders every sentence
of every step with macOS `say`, measures each clip, concatenates them, and writes
`src/demo/market/audio/<locale>/<step>.mp3` and a generated `index.ts` with the imports and timings
(see `src/demo/market/audio/generate.mjs`). Swap any MP3 for a studio recording and re-run with
`--timings-only`, or use the workbench's sentence-timing recorder for a file whose sentences you cannot
measure. Audio files are bundled as assets (`*.mp3` imports resolve to URLs), so `audio` can be an
imported file or any URL the host serves.

Players can speed narration up (1×, 1.25×, 1.5×, 2×; remembered per device). `sentenceTimes` and
`at` cues are always in the recording's own seconds, so nothing in the script changes with speed.

### Text in the box

Markdown: paragraphs, **bold**, lists, headings, links, block quotes, images. `:token:` references
render with the same icons and player avatars as the action log. `![alt](token:gem)` shows a token's
art at image size; a URL shows a file from the bundle. Sentence cues (`{ sentence: n }`) and the
narration emphasis count sentences across the whole text in document order.

### Localisation

Keep one script skeleton and one strings file per locale. The demo keeps each locale's step texts,
hints, title and voice in `src/demo/market/audio/strings.<locale>.json`; `intro(strings)` in
`tutorial.ts` builds the same steps from any of them, and `yarn demo:audio` renders each locale's
narration with that file's voice. Sentence cue indices survive translation as long as translators
keep sentence counts; `at` seconds need per-locale values when the audio differs. A host picks a
locale with `findTutorial(game, id, locale)` (exact match, then same language, then the first one).

### Colours and type

The overlay derives its colours from the game's `GameTheme` (highlight colour, bar colours, font).
Override any of them, from broadest to narrowest; later layers win:

```ts
theme.tutorial = { accent: "#ffcc66", arrowColor: "#ffffff" };        // the game's default (GameTheme)
defineTutorial({ ..., theme: { highlightColor: "#9cf" } });             // one tutorial
<DemoWrapper game={game} tutorial="intro" tutorialTheme={{ boxBackground: "#102030ee" }} /> // one host
```

Fields (`TutorialTheme`): `boxBackground`, `boxTextColor`, `accent` (buttons, progress, the sentence
being read), `boxShadow`, `borderRadius`, `arrowColor`, `highlightColor`, `highlightGlow`,
`dimColor`, `dimOpacity` (the spotlight), `fontFamily`, `fontScalar`, `boxWidth`.

## Step 4 — Wire it into the game

```ts
import { marketTutorials } from "./tutorial";
export class MyGame implements Game<Player, Root> {
  // ...
  tutorials = marketTutorials;
}
```

## Step 5 — Test it

```ts
test("intro can be completed", async () => {
  const result = await runTutorial(new MyGame(), intro, {
    // Optional: by default the player takes the first move the step's `allow` accepts
    answer: (step, options) => {
      if (step?.id === "buy") return options.findIndex((o) => o.option.key === "market.buy");
      return undefined;
    },
  });
  expect(result.outcome).toBe("completed");
  expect(result.warnings).toEqual([]);   // every pinned draw/move landed in the step that declared it
});
```

`runTutorial` plays the person's seat with a stand-in that answers only while a "do it" step is
waiting, and only with a move that step's `allow` accepts. That includes the engine's own Confirm
prompts, so a step that forgets `allow: { button: "Confirm" }` gets stuck in the test just as it
would for a player. Every other prompt it holds. The stand-in is not one of the bots, so `pauseAi`
never pauses it and resuming the bots never lets it act during narration. The run fails with the
step id when a step can never be completed, which is what a rules change that breaks the script
looks like.

## Step 6 — Watch it in the Playground

Demo tab → pick the tutorial → the workbench on the right shows the steps (click to jump), the live
check result and hint, the RNG log with step attribution and "copy rng", the bot decisions, warnings,
a sentence-timing recorder (space while the narration plays, then copy `sentenceTimes`), and toggles
for muting and showing target rects. "Open full screen" gives a phone-sized check at
`/demo?tutorial=<id>&locale=<locale>`.

Keyboard, anywhere a tutorial runs: **→** next step, **←** previous step, **Space** play/pause. On a
step waiting for the player's move, → makes the move for them: the first entry of the step's `allow`
(in the order written) that the prompt can take, or the UI control an entry names. It goes through the
same guard as a tap, so the game sees an ordinary move. Pressing → over and over plays the whole
tutorial. While the sentence recorder is on, Space marks a sentence instead.

In the workbench, clicking a later step **plays through to it**: narration skipped, animations
rushed, the player's moves made the same way, the bots playing as scripted. It waits for the board
to settle before each step, and the step it lands on plays as usual. Alt-click jumps without
playing. Back, Pause or another jump stops a play-through, and one stuck on a step for 20 s gives up
there. The status line shows the board's clock (for counting `{ advance: n }`) and any hold.

## Starting a tutorial from a host

A tutorial is a demo with a script, so a host starts it the way it starts a demo:

```tsx
import { DemoWrapper, listTutorials } from "@pretty-chitty/core";

listTutorials(game); // [{ id: "intro", locale: "en", title: "How to play", requires: [], steps: 11 }, …]

<DemoWrapper
  game={game}
  tutorial="intro"            // an id (or a spec); omit it for a plain demo
  locale="es"                 // picks the matching translation
  tutorialTheme={{ … }}       // optional colour overrides
  onTutorialEvent={(e) => …}  // "started" | "step" | "satisfied" | "completed" | "skipped"
  onBack={() => …}            // the back button, and where `end: "back"` goes
/>
```

The match is in-process and ephemeral: a reload starts the tutorial again. When the last step's
Finish is pressed (or the player skips), the box goes away and the same match carries on as a normal
game against the same bots.

---

## Checklist before you're done

- [ ] Every pick the script asks for calls `.focus()`.
- [ ] Every step has a unique `id` and a `text`.
- [ ] Every "do it" step's `waitFor` is state-based, has a `hint`, and lists what it `allow`s.
- [ ] Every move that only happens in a gallery has a step that opens it (or asks the player to) first.
- [ ] Every draw the script depends on is pinned on the step it happens in; `runTutorial` reports no warnings.
- [ ] Bot moves the narration mentions are forced on that step.
- [ ] The last step has `end`.
- [ ] A locale table exists per language the game ships, and `Game.tutorials` lists them all.
- [ ] The test passes and the script was watched once on a phone-sized screen.
