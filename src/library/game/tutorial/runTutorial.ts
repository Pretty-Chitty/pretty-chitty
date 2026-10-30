import { Game } from "../Game";
import { PlayerChit } from "../PlayerChit";
import { RootChit } from "../RootChit";
import { Chit } from "../Chit";
import { PickPrompt } from "../Prompt";
import { connectAiPlayer } from "../ai/connectAiPlayer";
import type { AiContext, AiOption } from "../ai/defineAi";
import { GalleryCommand, TutorialGalleryState, TutorialSpec, TutorialStep, selectChits } from "./defineTutorial";
import { isAllowed, shapeOfAiOption, stepsWithoutAllow } from "./allowed";
import { createDemoMatch } from "./createDemoMatch";
import { TutorialController, TutorialEvent, TutorialView } from "./TutorialController";

export type RunTutorialOptions<P extends PlayerChit, R extends RootChit<P>> = {
  /**
   * Plays the human seat: given the step the tutorial is on and the legal options, return the index
   * to play, or undefined to take the first option the step's `allow` list accepts (a player
   * following instructions). A step that allows nothing is never answered.
   */
  answer?: (
    step: TutorialStep<P, R> | undefined,
    options: { option: AiOption; score: number }[],
    ctx: AiContext<P, R, any>,
  ) => number | undefined;
  /** Give up on a step after this long. Default 10000 ms */
  stepTimeoutMs?: number;
  /**
   * Does what the player would do outside the game itself when a step starts: open or switch a
   * gallery (`ui.gallery({ of: (root, me) => me.hand })`). Headless runs have no gallery buttons, so a
   * step that waits for one needs this.
   */
  ui?: (step: TutorialStep<P, R>, ui: { gallery: (command: GalleryCommand<P, R>) => void }) => void;
  /** Let the bots log. Default false */
  log?: boolean;
};

export type RunTutorialResult = {
  outcome: "completed" | "stuck" | "error";
  /** Step ids in the order they were entered */
  visited: string[];
  /** The step the run got stuck on, if any */
  stuckOn?: string;
  error?: string;
  warnings: string[];
  rngRemaining: number;
};

/**
 * Plays a tutorial headlessly: builds its match like `DemoWrapper` does, seats the bots, drives the
 * human seat with `answer` (or the game's AI rules), and walks the steps, asserting every `waitFor`
 * becomes satisfiable. Use it in a test so a rules change that breaks a script fails CI.
 *
 * ```ts
 * test("intro tutorial can be completed", async () => {
 *   const result = await runTutorial(new MyGame(), intro);
 *   expect(result.outcome).toBe("completed");
 * });
 * ```
 *
 * @group Tutorials
 */
export async function runTutorial<P extends PlayerChit, R extends RootChit<P>>(
  game: Game<P, R>,
  spec: TutorialSpec<P, R>,
  options: RunTutorialOptions<P, R> = {},
): Promise<RunTutorialResult> {
  const demo = await createDemoMatch(game, spec, {
    immediateNotify: true,
    ai: { thinkMs: 0, log: options.log ?? false },
  });
  const { match, playerId, runtime } = demo;
  const visited: string[] = [];
  let error: string | undefined;

  // Headless galleries: no screen, just what is open, so gallery checks and commands behave
  let galleries: TutorialGalleryState[] = [];
  let uiListeners: (() => void)[] = [];
  const simulateGallery = (command: GalleryCommand<P, R>): boolean => {
    if (command === "close") {
      galleries = [];
      return false;
    }
    const root = view.root();
    const me = view.me();
    let state: TutorialGalleryState | undefined;
    let opened = false;
    if (command.of) {
      const container = selectChits(command.of, root, me)[0];
      if (container) {
        state = { mode: "inline", of: container.id, chitIds: container.children.map((c) => c.id ?? "") };
        opened = true;
      }
    } else if (command.items) {
      const chits = selectChits(command.items, root, me);
      if (chits.length > 0) {
        state = { mode: "inline", chitIds: chits.map((c) => c.id ?? "") };
        opened = true;
      }
    } else if (galleries[0]) {
      state = { ...galleries[0] };
    }
    if (!state) return false;
    if (command.mode === "fullscreen" || command.mode === "inline") state.mode = command.mode;
    galleries = [state];
    return opened;
  };

  const view: TutorialView<P, R> = {
    root: () => match.turn.value?.rootChit as R | undefined,
    me: () => match.turn.value?.rootChit.players.find((p) => p.id === playerId) as P | undefined,
    prompt: () => {
      const p = match.turn.value?.rootChit.players.find((pl) => pl.id === playerId);
      const prompt = p?.promptStatus.latestPrompt.value;
      return prompt instanceof PickPrompt ? prompt : undefined;
    },
    clock: () => match.turn.value?.clockDetails(playerId).clock ?? 0,
    find: (id: string) => {
      let found: Chit | undefined;
      match.turn.value?.rootChit.walk((c) => {
        if (c.id === id) found = c;
        return !found;
      });
      return found;
    },
    latestLog: () => {
      const logs = match.turn.value?.gameLog(playerId);
      return logs?.[logs.length - 1]?.message;
    },
    live: () => true,
    onChange: (cb) => {
      uiListeners.push(cb);
      const unsub = match.onChange(cb, false);
      return () => {
        unsub();
        uiListeners = uiListeners.filter((l) => l !== cb);
      };
    },
    galleries: () => galleries,
    setGallery: (command) => {
      const opened = simulateGallery(command);
      uiListeners.forEach((l) => l());
      return opened;
    },
  };

  let finished = false;
  let finishedEnd: TutorialEvent | undefined;
  // The human seat is played by a bot that behaves like a player following instructions: it answers
  // only while a "do it" step is waiting, and only with a move the step allows (the engine's Confirm
  // included); any other prompt it holds until the script lets it act. `answer` can pick for it.
  // eslint-disable-next-line prefer-const
  let human: ReturnType<typeof connectAiPlayer> | undefined;
  const controller = new TutorialController<P, R>({
    spec,
    view,
    runtime,
    ai: match.ai,
    satisfiedDelayMs: 0,
    // Headless: narration takes no time, so a step's own narration never delays the run
    readingSpeed: Number.POSITIVE_INFINITY,
    onEvent: (e) => {
      if (e.type === "step") {
        visited.push(e.stepId);
        const step = controller.step;
        if (step && options.ui) {
          options.ui(step, { gallery: (command) => view.setGallery?.(command) });
        }
      }
      if (e.type === "completed" || e.type === "skipped") {
        finished = true;
        finishedEnd = e;
      }
      // The step or its state changed: a held prompt may now be answerable (or not)
      human?.prompts.recheck();
    },
  });

  human = connectAiPlayer(match, playerId, {
    thinkMs: 0,
    log: options.log ?? false,
    temperature: 0,
    choose: (scored, ctx) => {
      const step = controller.step;
      if (!step?.waitFor || controller.status.value !== "waiting") return null;
      const chosen = options.answer?.(step, scored, ctx as AiContext<P, R, any>);
      if (chosen !== undefined) return chosen;
      const root = ctx.view as R;
      const me = ctx.me as P;
      const index = scored.findIndex((s) => isAllowed(step.allow, shapeOfAiOption(s.option), root, me));
      return index >= 0 ? index : null;
    },
  });
  // It plays the person, not a bot: keep it out of the bots' switch, so `pauseAi` and resuming the
  // bots never pause it or let it act during narration
  match.ai.unregister(human);
  human.prompts.setEnabled(true);
  stepsWithoutAllow(spec.steps).forEach((id) =>
    console.warn(`[tutorial ${spec.id}] step "${id}" waits for the player but allows no move (set \`allow\`)`),
  );

  const run = match.start().catch((e) => {
    error = e instanceof Error ? e.message : String(e);
  });

  // Wait for the board and for setup to reach its first prompt (so setup draws stay "setup"), then start
  await waitUntil(() => !!match.turn.value?.rootChit || !!error, 5000);
  await waitUntil(
    () =>
      !!error ||
      !!match.errorState.value ||
      !!match.turn.value?.rootChit.players.some((p) => !!p.promptStatus.latestPrompt.value),
    10000,
  );
  controller.start();

  const stepTimeout = options.stepTimeoutMs ?? 10000;
  let stuckOn: string | undefined;
  while (!finished && !error && !match.errorState.value) {
    const index = controller.index.value;
    const step = controller.step;
    if (!step) break;
    // Narration steps advance when the reading clock ends; speed that up headlessly
    if (!step.waitFor) {
      await waitUntil(() => controller.status.value === "narrating" || finished, 1000);
      controller.next();
      continue;
    }
    const moved = await waitUntil(() => controller.index.value !== index || finished || !!error, stepTimeout);
    if (!moved) {
      stuckOn = step.id;
      break;
    }
  }

  const outcome: RunTutorialResult["outcome"] = error || match.errorState.value ? "error" : stuckOn ? "stuck" : "completed";
  controller.dispose();
  human?.dispose();
  match.dispose();
  void run;
  void finishedEnd;

  return {
    outcome,
    visited,
    stuckOn,
    error: error ?? match.errorState.value,
    warnings: runtime.warnings.value,
    rngRemaining: runtime.rngRemaining,
  };
}

async function waitUntil(pred: () => boolean, timeoutMs: number): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (pred()) return true;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return pred();
}

