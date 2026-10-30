import { Chit } from "../Chit";
import { OrderedOutlet } from "../OrderedOutlet";
import { PlayerChit } from "../PlayerChit";
import { RootChit } from "../RootChit";
import { PickPrompt } from "../Prompt";
import type { AiSeatInfo } from "../PlayerInfo";
import type { SeatAiPlayersOptions } from "../Match";
import type { Game } from "../Game";
import type { TutorialTheme } from "./TutorialTheme";

/**
 * Names chits in the game: "my hand", "the market cards". Runs against the state the player sees, so
 * it is re-evaluated whenever the board changes and can return nothing while a chit is not there yet.
 */
export type ChitSelector<P extends PlayerChit, R extends RootChit<P>> = (
  root: R,
  me: P,
) => Chit | Chit[] | OrderedOutlet<any> | undefined | null;

/** Something in the 2D UI (not a chit) that a step can point at. The names match `data-tutorial-target` attributes. */
export type UiTarget =
  | `button:${string}` // a prompt button by its label, e.g. "button:Pass" or "button:Confirm"
  | "undo"
  | "log"
  | "time"
  | "players"
  | "prompt" // the whole prompt bar
  | "gallery:inline" // the inline gallery strip, while it shows something
  | "gallery:fullscreen" // the full-screen gallery, while it is open
  | "gallery:toFullscreen" // the inline gallery's "full screen" button
  | "gallery:toInline" // the full-screen gallery's "back to inline" button
  | "gallery:modeButton" // whichever of the two is showing
  | "gallery:context" // the small context gallery in the prompt bar
  | `spark:${string}` // a spark counter by its chit id (`spark:${me.coins.id}`)
  | `panelTab:${string}` // the tab for the panel whose root chit has this id
  | (string & NonNullable<unknown>);

/** Where an arrow points or what a ring surrounds. */
export type Target<P extends PlayerChit, R extends RootChit<P>> =
  | ChitSelector<P, R>
  | {
      chit: ChitSelector<P, R>;
      /** Offset from the chit's centre in units of its bounding box: `{ y: 0.3 }` is 30% of the way to the top edge. */
      offset?: { x?: number; y?: number; z?: number };
      /** Scale the box around the chit: 0.5 rings the middle half of a card. */
      scale?: { x?: number; y?: number };
    }
  | { ui: UiTarget | ((root: R, me: P) => UiTarget) }
  | { screen: { x: number | string; y: number | string } };

/**
 * One thing to draw on the overlay. A step's `focus` is a list, so highlight as many regions as you
 * like: `[{ ring: hand }, { ring: tableau, arrow: true }, { arrow: { ui: "button:Pass" } }]`.
 */
export type Focus<P extends PlayerChit, R extends RootChit<P>> = {
  /** Point an arrow at this. `true` means "at the ring" (each ring, with `separate`). */
  arrow?: Target<P, R> | true;
  /** Draw a ring (rounded box) around this. Several chits get one box around all of them, unless `separate`. */
  ring?: Target<P, R>;
  /** Ring each chit the target names on its own instead of one box around all of them. Default false */
  separate?: boolean;
  /** Ring shape; default "rect" */
  shape?: "rect" | "ellipse";
  /**
   * Spotlight: darken the screen except what the step highlights. Every ring and every arrow target
   * of the step stays lit, not just this entry's. Default false
   */
  dim?: boolean;
  /** Switch to the panel that holds the target and bring it into view. Default true */
  reveal?: boolean;
  /**
   * Frame the ring on a small screen: show its panel full screen, and zoom in on it when it is tiny
   * (see the guide). Default true; false for a ring that is only on screen for a moment, or whose
   * surroundings matter more than its size (it leaves the framing as it is). A number zooms in that
   * much on the ring whatever its size (on a small screen), e.g. 1.6 for a group of things that are each
   * small but together are not.
   */
  zoom?: boolean | number;
};

export type BoxAnchor = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "top" | "bottom" | "center";

export type BoxPlacement<P extends PlayerChit, R extends RootChit<P>> =
  | { anchor: BoxAnchor }
  | { anchor: "near"; target: Target<P, R>; side?: "above" | "below" | "left" | "right" }
  | { anchor: "keep" };

/**
 * Opens, switches or closes a gallery, as the player could with the gallery buttons.
 * - `{ of: hand }` shows a container's children (what tapping a gallery container does)
 * - `{ items: (root) => root.market.cards }` shows exactly those chits
 * - `{ mode: "fullscreen" }` moves whatever gallery is open to full screen (or back with "inline")
 * - `"close"` closes any open gallery
 * `mode` defaults to the player's own choice (the one the gallery buttons remember).
 */
export type GalleryCommand<P extends PlayerChit, R extends RootChit<P>> =
  | "close"
  | {
      of?: ChitSelector<P, R>;
      items?: ChitSelector<P, R>;
      mode?: "inline" | "fullscreen" | "preferred";
    };

/** An open gallery, for checks: what it shows and how */
export type TutorialGalleryState = {
  mode: "inline" | "fullscreen";
  /** The container whose children it shows, when it was opened from one */
  of?: string;
  /** Ids of the chits it shows */
  chitIds: string[];
};

/**
 * A change to how chits look, in this player's view only. The properties are set on the client's copy
 * of the chit and the engine renders (and animates) them like any other change: a card flips over, a
 * token turns. The game never sees it, and it is put back when the step ends unless `keep` is set.
 *
 * ```ts
 * pose: [{ chit: (root) => root.table.market.cards[0], set: { faceDown: true } }]
 * ```
 */
export type Pose<P extends PlayerChit, R extends RootChit<P>> = {
  /** The chit or chits to change */
  chit: ChitSelector<P, R>;
  /**
   * Properties to set (`{ faceDown: true }`), or a function that changes the chit. Leave it out to put
   * the chit back as the game has it. Only properties are put back: do not move chits with a pose.
   */
  set?: { [prop: string]: unknown } | ((chit: Chit) => void);
  /**
   * Keep the change after the step ends, until a later pose of the chit, Back, or the end of the
   * tutorial. A change from the game to the same chit replaces it either way.
   */
  keep?: boolean;
};

/**
 * What the board's timeline does. The board plays the game's moments (clocks) one after another;
 * holding it freezes the board on a moment while the game carries on behind it, so the narration can
 * talk about what just animated. Only this player's view is affected.
 *
 * - `"hold"`: stop at the moment on screen
 * - `{ advance: n }`: play `n` more moments, then stop
 * - `{ until: check }`: play on until the board shows a moment where the check passes, then stop
 *   (e.g. `checks.logged(/Robin buys/)`)
 * - `"play"`: play on, catching up with the game and following it again
 *
 * A hold lasts until a later command changes it, Back, or the end of the tutorial.
 */
export type TimelineCommand<P extends PlayerChit, R extends RootChit<P>> =
  | "hold"
  | "play"
  | { advance: number }
  | { until: Checker<P, R> };

export type Cue<P extends PlayerChit, R extends RootChit<P>> = {
  /** Seconds into the narration, or the index (0-based) of the sentence this cue starts with. */
  at: number | { sentence: number };
  /** Replaces the current set of arrows and rings. An empty array clears them. */
  focus?: Focus<P, R>[];
  box?: BoxPlacement<P, R>;
  /** Opens, switches or closes a gallery at this point of the narration */
  gallery?: GalleryCommand<P, R>;
  /** Changes how chits look from this point of the narration (see `Pose`) */
  pose?: Pose<P, R>[];
  /** Holds or plays the board's timeline from this point of the narration (see `TimelineCommand`) */
  timeline?: TimelineCommand<P, R>;
};

/** `true` = done. `false` = not yet. A string = not yet, and the hint to show the player. */
export type CheckResult = boolean | string;

export type TutorialContext<P extends PlayerChit, R extends RootChit<P>> = {
  root: R;
  me: P;
  /** What the player is being asked right now, or undefined when it is not their turn */
  prompt?: PickPrompt;
  clock: number;
  find: <C extends Chit = Chit>(id: string) => C | undefined;
  /** Clock when the current step was entered */
  stepStartClock: number;
  /** Log lines written since the current step was entered, oldest first */
  recentLog: string[];
  /** Galleries open right now, full-screen first */
  galleries: TutorialGalleryState[];
};

export type Checker<P extends PlayerChit, R extends RootChit<P>> = ((ctx: TutorialContext<P, R>) => CheckResult) & {
  /** Called when the step is entered, so a check can remember what the board looked like then. */
  reset?: (ctx: TutorialContext<P, R>) => void;
};

/** A move a bot is told to make (see `TutorialStep.ai`). Every field given must match. */
export type ForcedDecision<P extends PlayerChit, R extends RootChit<P>> = {
  /** The pick's `.ai("key")` */
  key?: string;
  /** For chit and drag options: the chit (or one of the chits) to play */
  chit?: ChitSelector<P, R>;
  /** For drag options: where to drop it */
  target?: ChitSelector<P, R>;
  /** For button options: the button's label */
  button?: string;
  /** Only use this entry when this holds (checked against the bot's view) */
  when?: (root: R, me: P) => boolean;
};

/**
 * A move the player is allowed to make during a "do it" step. Every field given must match the
 * attempted move; `"any"` allows everything the game offers.
 */
export type AllowedAction<P extends PlayerChit, R extends RootChit<P>> =
  | "any"
  | {
      /** The pick's `.ai("key")` */
      key?: string;
      /** For taps and drags: the chit (or one of the chits) that may be played */
      chit?: ChitSelector<P, R>;
      /** For drags: where it may be dropped */
      target?: ChitSelector<P, R>;
      /** For buttons (the engine's Confirm included): the label */
      button?: string;
      /**
       * A UI control the player is expected to use (`"button:Market"`, `"gallery:toFullscreen"`).
       * Galleries and other UI are never blocked, so this only says the step waits for the player
       * (not the bots) and matches no game move.
       */
      ui?: UiTarget;
    };

export type TutorialStep<P extends PlayerChit, R extends RootChit<P>> = {
  id: string;
  /** Markdown with the game's `:token:` icons inline. See TokenizedMarkdown. */
  text: string;
  /**
   * Narration: a URL (relative to the game bundle) of an audio file, or `"tts"` to have the browser
   * read the text aloud with speech synthesis (handy while authoring, before the recordings exist).
   */
  audio?: string;
  /** Start time of each sentence in the audio file, in seconds. Enables `{ sentence: n }` cues and sentence emphasis for file audio. */
  sentenceTimes?: number[];
  /** Where the box goes when the step starts. Default: where it was. */
  box?: BoxPlacement<P, R>;
  /** Arrows and rings to show from the start of the step (a cue at 0). */
  focus?: Focus<P, R>[];
  /**
   * Opens, switches or closes a gallery when the step starts. A gallery the script opened stays
   * until a later step or cue changes it; Back closes it.
   */
  gallery?: GalleryCommand<P, R>;
  /**
   * Changes how chits look, in this player's view only, from the start of the step (see `Pose`): a
   * card flipping over, a token turning. Put back when the step ends unless a pose sets `keep`.
   */
  pose?: Pose<P, R>[];
  /**
   * Holds or plays the board's timeline when the step starts (see `TimelineCommand`): let the bots'
   * moves animate up to a point and stop there while the narration explains them. The game itself
   * plays on; a "do it" step usually wants `"play"` so the player's prompt is on the board.
   */
  timeline?: TimelineCommand<P, R>;
  /** Changes during the narration */
  cues?: Cue<P, R>[];
  /** Makes this a "do it" step: Next is locked until this passes, then the tutorial moves on by itself. */
  waitFor?: Checker<P, R>;
  /**
   * The only moves the game accepts while this step is waiting. Anything else the player tries is
   * dropped and the hint is shown. A narration step accepts nothing. Required on a "do it" step in
   * practice: without it nothing is allowed and the step cannot be completed (the dev panel and
   * `runTutorial` warn). Use `allow: []` on a step that waits for the bots or the world rather than
   * the player, to say so explicitly.
   */
  allow?: AllowedAction<P, R> | AllowedAction<P, R>[];
  /**
   * Wait for the player to tap Next after the narration instead of moving on by itself. Default false:
   * a narration step auto-advances when its audio (or reading clock) ends; the last step always waits.
   */
  pause?: boolean;
  /** Shown if `waitFor` has not passed after `after` seconds (default 8). A plain string uses the default delay. */
  hint?: string | { after: number; text: string };
  /** Random draws the game makes while this step is active, in order. See `TutorialSpec.match.rng`. */
  rng?: (number | number[])[];
  /** Forced moves per bot (by player id) while this step is active, in order. */
  ai?: { [playerId: string]: ForcedDecision<P, R>[] };
  /** Bots hold their prompts while this step is showing. Default false */
  pauseAi?: boolean;
  onEnter?: (ctx: TutorialContext<P, R>) => void;
  onExit?: (ctx: TutorialContext<P, R>) => void;
  /** Marks the last step: what happens after it. "continue" keeps playing the match; "back" leaves it. */
  end?: "continue" | "back";
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type TutorialMatchSetup<P extends PlayerChit, R extends RootChit<P>> = {
  /** Seats. Default: `Root.setupDemoGame()` seats, "You" first and a bot in every other seat. */
  players?: { name: string; ai?: AiSeatInfo; imageUrl?: string }[];
  /** Index into `players` of the seat the person plays. Default 0 */
  humanSeat?: number;
  /** Match options. Default: what `setupDemoGame()` selects */
  options?: any;
  /**
   * Random draws made during setup, before the first step: the seating shuffle first (an array of
   * 2 × seats values), then whatever `Game.run` draws before it first prompts the player.
   */
  rng?: (number | number[])[];
  /** How the bots play when no step forces a move. Default `{ temperature: 0, thinkMs: [500, 900] }` */
  ai?: SeatAiPlayersOptions;
};

export type TutorialSpec<P extends PlayerChit, R extends RootChit<P>> = {
  id: string;
  /** BCP-47: "en", "es-MX" */
  locale: string;
  title: string;
  /**
   * Shown on the start card, before the player taps Start (markdown, `:token:` icons). Default: the
   * first step's text. Use it for a welcome line rather than adding a title-card step.
   */
  intro?: string;
  /** Feature flags a host must have on to offer this tutorial. Informational. */
  requires?: string[];
  match?: TutorialMatchSetup<P, R>;
  theme?: Partial<TutorialTheme>;
  /** Throw on a stale pinned draw or an unmatched forced move instead of warning. Default false */
  strict?: boolean;
  steps: TutorialStep<P, R>[];
};

/**
 * Declares a scripted tutorial. List it on `Game.tutorials`.
 *
 * ```ts
 * export const intro = defineTutorial<Player, Root>({
 *   id: "intro",
 *   locale: "en",
 *   title: "How to play",
 *   steps: [
 *     { id: "hand", text: "This is your hand.", focus: [{ ring: (root, me) => me.hand }] },
 *     { id: "buy", text: "Buy a card.", waitFor: checks.countChanged((r, me) => me.hand, 1) },
 *   ],
 * });
 * ```
 *
 * A tutorial runs the way a demo does: an in-process match, one human seat and bots in the rest.
 * See TUTORIAL_GUIDE.md.
 *
 * @group Tutorials
 */
export function defineTutorial<P extends PlayerChit, R extends RootChit<P>>(spec: TutorialSpec<P, R>): TutorialSpec<P, R> {
  const ids = new Set<string>();
  spec.steps.forEach((step) => {
    if (ids.has(step.id)) {
      throw new Error(`Tutorial "${spec.id}": duplicate step id "${step.id}"`);
    }
    ids.add(step.id);
  });
  return spec;
}

export type TutorialSummary = { id: string; locale: string; title: string; requires?: string[]; steps: number };

/** What a game offers, for a host choosing by language and feature flags. @group Tutorials */
export function listTutorials(game: Game<any, any>): TutorialSummary[] {
  return (game.tutorials ?? []).map((t) => ({
    id: t.id,
    locale: t.locale,
    title: t.title,
    requires: t.requires,
    steps: t.steps.length,
  }));
}

/** Finds a tutorial by id, and locale when given. @group Tutorials */
export function findTutorial(game: Game<any, any>, id: string, locale?: string): TutorialSpec<any, any> | undefined {
  const matches = (game.tutorials ?? []).filter((t) => t.id === id);
  if (locale) {
    const exact = matches.find((t) => t.locale === locale);
    if (exact) return exact;
    const language = locale.split("-")[0];
    const sameLanguage = matches.find((t) => t.locale.split("-")[0] === language);
    if (sameLanguage) return sameLanguage;
  }
  return matches[0];
}

/** Normalises a selector's result to a list of chits with ids. @internal */
export function selectChits<P extends PlayerChit, R extends RootChit<P>>(
  selector: ChitSelector<P, R> | undefined,
  root: R | undefined,
  me: P | undefined,
): Chit[] {
  if (!selector || !root || !me) return [];
  let result: Chit | Chit[] | OrderedOutlet<any> | undefined | null;
  try {
    result = selector(root, me);
  } catch {
    return [];
  }
  if (!result) return [];
  if (result instanceof OrderedOutlet) return result.copy();
  if (Array.isArray(result)) return result.filter((c): c is Chit => !!c);
  return [result];
}

/**
 * Splits step text into sentences exactly the way `{ sentence: n }` cues and the narration emphasis
 * count them. Use it in narration tooling (rendering one clip per sentence, measuring `sentenceTimes`)
 * so the counts always agree. Markdown punctuation is left alone.
 *
 * @group Tutorials
 */
export function splitSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?][")'\]]*)\s+(?=\S)/);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}
