import { checks, defineTutorial, TutorialSpec, TutorialStep } from "../../library";
import { Card, Player, Root, SUITS } from "./chits";

/**
 * How the deck is ordered when the game builds it (see MarketGame.run): suit-major, value 1..5, two
 * copies of each. `Deck.draw` pulls two random numbers per draw; using the same number for both
 * makes "the card at index i" leave the deck untouched, so a wanted sequence of cards turns into
 * a sequence of pinned draws.
 */
const DECK_ORDER = SUITS.flatMap((suit) => [1, 2, 3, 4, 5].flatMap((v) => [`${suit}${v}`, `${suit}${v}`]));

/** Pinned `[r, r]` pairs that make `Deck.draw` hand out exactly these cards, in order. */
function pinDraws(wanted: string[], remaining: string[] = [...DECK_ORDER]): number[][] {
  return wanted.map((card) => {
    const i = remaining.indexOf(card);
    if (i < 0) throw new Error(`${card} is not in the deck any more`);
    const r = (i + 0.5) / remaining.length;
    remaining.splice(i, 1);
    return [r, r];
  });
}

// The deal the tutorial is written against. Players draw 2 each (You, Robin, Sam), then the market 4.
const deckAfterSetup = [...DECK_ORDER];
const SETUP_DRAWS = pinDraws(
  ["coin2", "gem3", "star1", "coin4", "gem1", "star3", "coin1", "gem2", "star4", "gem5"],
  deckAfterSetup,
);
// Draws made later, in the order the script expects them
const REFILL_AFTER_YOUR_BUY = pinDraws(["star2"], deckAfterSetup);
const REFILL_AFTER_ROBIN_BUYS = pinDraws(["coin3"], deckAfterSetup);

import en from "./audio/strings.en.json";
import es from "./audio/strings.es.json";
import { narration } from "./audio/index";

/** One locale's strings: the step texts (markdown with :tokens:), hints and labels. See audio/strings.*.json. */
type Strings = {
  locale: string;
  title: string;
  you: string;
  steps: { [stepId: string]: string };
  hints: { [stepId: string]: string };
};

const affordable = (root: Root, me: Player) => root.table.market.cards.filter((c) => c.cost <= me.coins.value);

/** The intro script, shared by every locale; only the strings (and the narration) differ. */
function intro(t: Strings): TutorialSpec<Player, Root> {
  const locale = t.locale;
  // Narration recorded by `yarn demo:audio` (MP3 + exact sentence times). Falls back to the browser's
  // speech synthesis for a step that has no recording yet.
  const voice = (id: string) => {
    const n = narration[locale]?.[id];
    return n ? { audio: n.url, sentenceTimes: n.sentenceTimes } : { audio: "tts" as const };
  };
  const steps: TutorialStep<Player, Root>[] = [
    {
      id: "welcome",
      text: t.steps["welcome"],
      ...voice("welcome"),
      box: { anchor: "top-right" },
      // Poses change how chits look in the player's view only: the market starts face down and
      // flips over as the narration gets to it
      pose: [{ chit: (root) => root.table.market.cards, set: { faceDown: true } }],
      cues: [
        // Sentence 0 is "Welcome to Petty Market!", so the table is sentence 1
        { at: { sentence: 1 }, focus: [{ ring: (root) => root.table, reveal: true }] },
        { at: { sentence: 2 }, focus: [{ ring: (root) => root.table.deck, arrow: true }] },
        {
          at: { sentence: 3 },
          focus: [{ ring: (root) => root.table.market.cards, arrow: true }],
          pose: [{ chit: (root) => root.table.market.cards }], // no `set`: back as the game has it
        },
      ],
    },
    {
      id: "market",
      text: t.steps["market"],
      ...voice("market"),
      box: { anchor: "near", target: (root) => root.table.market.cards, side: "below" },
      focus: [{ ring: (root) => root.table.market.cards, arrow: true, dim: true }],
      cues: [
        {
          at: { sentence: 2 },
          // +y is toward the top of the card: ring the band where the number is
          focus: [{ ring: { chit: (root) => root.table.market.cards.tryGet(0), scale: { y: 0.3 }, offset: { y: 0.35 } }, arrow: true, dim: true }],
        },
      ],
    },
    {
      id: "hand",
      text: t.steps["hand"],
      ...voice("hand"),
      box: { anchor: "top-left" },
      focus: [{ ring: (_root, me) => me.hand, arrow: true, shape: "ellipse" }],
      cues: [{ at: { sentence: 2 }, focus: [{ ring: (_root, me) => me.tableau, arrow: true }] }],
    },
    {
      id: "coins",
      text: t.steps["coins"],
      ...voice("coins"),
      box: { anchor: "top-right" },
      focus: [{ arrow: { ui: (_root, me) => `spark:${me.coins.id}` } }],
      cues: [{ at: { sentence: 1 }, focus: [{ arrow: { ui: "players" } }] }],
    },
    {
      // The player opens a gallery with its toggle button: a UI action, so `allow` names the control
      id: "market-button",
      text: t.steps["market-button"],
      ...voice("market-button"),
      box: { anchor: "top-right" },
      focus: [{ arrow: { ui: "button:Market" } }],
      allow: { ui: "button:Market" },
      waitFor: checks.galleryOpen({ of: (root) => root.table.market }, t.hints["market-button"]),
      hint: { after: 6, text: t.hints["market-button"] },
      pauseAi: true,
    },
    {
      // The script drives the gallery: (re)opens it inline, points at its mode button, then switches
      // it to full screen and circles items inside it
      id: "gallery-tour",
      text: t.steps["gallery-tour"],
      ...voice("gallery-tour"),
      box: { anchor: "top-right" },
      gallery: { of: (root) => root.table.market, mode: "inline" },
      focus: [{ ring: { ui: "gallery:inline" } }],
      cues: [
        { at: { sentence: 1 }, focus: [{ arrow: { ui: "gallery:modeButton" } }] },
        {
          at: { sentence: 2 },
          gallery: { mode: "fullscreen" },
          focus: [{ ring: affordable, separate: true }],
        },
      ],
      pauseAi: true,
    },
    {
      id: "buy",
      text: t.steps["buy"],
      ...voice("buy"),
      box: { anchor: "top-right" },
      // Each card you can afford gets its own ring and arrow, in the gallery while it is open
      focus: [{ ring: affordable, separate: true, arrow: true, dim: true }],
      allow: { key: "market.buy" },
      waitFor: checks.countChanged((_root, me) => me.hand, 1, t.hints["buy"]),
      hint: { after: 6, text: t.hints["buy"] },
      pauseAi: true,
    },
    {
      id: "confirm-draw",
      text: t.steps["confirm-draw"],
      ...voice("confirm-draw"),
      box: { anchor: "bottom-left" },
      gallery: "close",
      focus: [{ arrow: { ui: "button:Confirm" } }],
      allow: { button: "Confirm" },
      waitFor: checks.state((root) => root.table.market.cards.length === 4, t.hints["confirm-draw"]),
      hint: { after: 6, text: t.hints["confirm-draw"] },
      rng: REFILL_AFTER_YOUR_BUY,
      pauseAi: true,
    },
    {
      id: "robin",
      text: t.steps["robin"],
      ...voice("robin"),
      box: { anchor: "top-right" },
      focus: [{ arrow: { ui: "log" } }],
      // The board plays Robin's buy and the market refill, then holds there while the narration
      // introduces the turns; it plays on (Sam's pass, then the player's prompt) at the next sentence
      timeline: { until: checks.logged(/A new card joins the market/) },
      cues: [
        {
          at: { sentence: 1 },
          focus: [{ arrow: { ui: "log" } }, { ring: (root) => root.players.tryGet(1), reveal: false }],
          timeline: "play",
        },
      ],
      ai: {
        p1: [{ key: "market.buy", chit: affordable }],
        p2: [{ key: "turn.pass" }],
      },
      rng: REFILL_AFTER_ROBIN_BUYS,
      allow: [], // waits for the bots, not the player
      waitFor: checks.promptFor("me"),
    },
    {
      id: "play",
      text: t.steps["play"],
      ...voice("play"),
      box: { anchor: "top-right" },
      // Two regions: where the card comes from and where it goes
      focus: [
        { ring: (_root, me) => me.hand },
        { arrow: { chit: (_root, me) => me.hand.tryGet(0), offset: { y: 0.3 } } },
        { ring: (_root, me) => me.tableau, dim: true },
      ],
      allow: { key: "hand.play" },
      waitFor: checks.countChanged((_root, me) => me.tableau.cards, 1, t.hints["play"]),
      hint: { after: 8, text: t.hints["play"] },
      pauseAi: true,
    },
    {
      id: "end-turn",
      text: t.steps["end-turn"],
      ...voice("end-turn"),
      box: { anchor: "bottom-left" },
      focus: [{ arrow: { ui: "button:Confirm" } }],
      allow: { button: "Confirm" },
      // State-based on purpose: passes whether the player confirms now or already did
      waitFor: checks.promptFor("none", t.hints["end-turn"]),
      hint: { after: 6, text: t.hints["end-turn"] },
      pauseAi: true,
    },
    {
      id: "history",
      text: t.steps["history"],
      ...voice("history"),
      pause: true, // worth a look before moving on; every other narration step auto-advances
      box: { anchor: "top-right" },
      focus: [{ arrow: { ui: "time" } }],
      cues: [{ at: { sentence: 1 }, focus: [{ arrow: { ui: "log" } }] }],
      pauseAi: true,
    },
    {
      id: "done",
      text: t.steps["done"],
      ...voice("done"),
      box: { anchor: "center" },
      focus: [],
      end: "continue",
    },
  ];

  return defineTutorial<Player, Root>({
    id: "intro",
    locale,
    title: t.title,
    match: {
      players: [{ name: t.you }, { name: "Robin", ai: {} }, { name: "Sam", ai: {} }],
      options: { rounds: "3" },
      // Seating shuffle first (2 values per seat; zeros keep the order), then the setup deal.
      rng: [[0, 0, 0, 0, 0, 0], ...SETUP_DRAWS],
      ai: { thinkMs: [600, 1000] },
    },
    theme: { accent: "#ffcc66" },
    steps,
  });
}

export const marketTutorials: TutorialSpec<Player, Root>[] = [intro(en), intro(es)];
export type { Card };
