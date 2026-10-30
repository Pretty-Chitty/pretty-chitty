import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { TutorialController, TutorialView } from "./TutorialController";
import { defineTutorial } from "./defineTutorial";
import { TutorialRuntime } from "./TutorialRuntime";
import { PlayerChit } from "../PlayerChit";
import { RootChit } from "../RootChit";
import { ButtonPick } from "../Pick";

// Three narration steps of 6 words each: 2 s each on the reading clock (3 words/second)
const spec = defineTutorial<PlayerChit, RootChit<PlayerChit>>({
  id: "flow",
  locale: "en",
  title: "Flow",
  steps: [
    { id: "a", text: "one two three four five six" },
    { id: "b", text: "one two three four five six" },
    { id: "c", text: "one two three four five six" },
    { id: "d", text: "the end", end: "continue" },
  ],
});

function makeView(): TutorialView<PlayerChit, RootChit<PlayerChit>> {
  const root = new RootChit<PlayerChit>();
  const me = new PlayerChit();
  return {
    root: () => root,
    me: () => me,
    prompt: () => undefined,
    clock: () => 1,
    find: () => undefined,
    latestLog: () => undefined,
    live: () => true,
    onChange: () => () => {},
  };
}

describe("TutorialController flow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const make = () =>
    new TutorialController({ spec, view: makeView(), autoAdvanceDelayMs: 100, now: () => Date.now() });

  test("narration steps advance by themselves when their narration ends", () => {
    const c = make();
    c.start();
    expect(c.index.value).toBe(0);
    vi.advanceTimersByTime(2500);
    expect(c.index.value).toBe(1);
    vi.advanceTimersByTime(2500);
    expect(c.index.value).toBe(2);
    c.dispose();
  });

  test("the next step's recording loads while a step talks (and the first while the start card is up)", () => {
    const audioSpec = defineTutorial<PlayerChit, RootChit<PlayerChit>>({
      id: "audio",
      locale: "en",
      title: "Audio",
      steps: [
        { id: "a", text: "first", audio: "a.mp3" },
        { id: "b", text: "second", audio: "b.mp3" },
        { id: "c", text: "the end", end: "continue" },
      ],
    });
    const preloaded: string[] = [];
    const ends: (() => void)[] = [];
    const narration = {
      play: () => Promise.resolve(),
      stop: () => {},
      pause: () => {},
      resume: () => {},
      playing: true,
      paused: false,
      time: 0,
      duration: 1,
      preload: (audio: string) => preloaded.push(audio),
      onTime: () => () => {},
      onSentence: () => () => {},
      onEnd: (cb: () => void) => {
        ends.push(cb);
        return () => {};
      },
    };
    const c = new TutorialController({ spec: audioSpec, view: makeView(), narration, now: () => Date.now() });
    expect(preloaded).toEqual(["a.mp3"]);
    c.start();
    expect(preloaded).toEqual(["a.mp3", "b.mp3"]);
    c.dispose();
  });

  test("Back pauses: nothing plays or advances until Play", () => {
    const c = make();
    c.start();
    vi.advanceTimersByTime(2500);
    vi.advanceTimersByTime(2500);
    expect(c.index.value).toBe(2);

    c.back();
    expect(c.index.value).toBe(1);
    expect(c.paused.value).toBe(true);
    expect(c.narrating.value).toBe(false);

    // Plenty of time passes: still held on step 2, so a second Back goes further back
    vi.advanceTimersByTime(10000);
    expect(c.index.value).toBe(1);
    c.back();
    expect(c.index.value).toBe(0);

    // Next while held moves one step and stays held
    c.next();
    expect(c.index.value).toBe(1);
    vi.advanceTimersByTime(10000);
    expect(c.index.value).toBe(1);
    expect(c.paused.value).toBe(true);

    // Play resumes: the step narrates from the top, then the flow carries on
    c.play();
    expect(c.paused.value).toBe(false);
    expect(c.narrating.value).toBe(true);
    vi.advanceTimersByTime(2500);
    expect(c.index.value).toBe(2);
    c.dispose();
  });

  test("Pause holds mid-narration and Play continues from there", () => {
    const c = make();
    c.start();
    vi.advanceTimersByTime(1000);
    c.pause();
    vi.advanceTimersByTime(10000);
    expect(c.index.value).toBe(0);
    c.play();
    // one second of narration was left
    vi.advanceTimersByTime(1500);
    expect(c.index.value).toBe(1);
    c.dispose();
  });

  test("Back with a game history rewinds, queues repeated presses, and lands paused on the live step", async () => {
    const restored: string[] = [];
    const saved: string[] = [];
    const c = new TutorialController({
      spec,
      view: makeView(),
      autoAdvanceDelayMs: 100,
      now: () => Date.now(),
      history: {
        save: (id) => saved.push(id),
        restore: (id) =>
          new Promise<boolean>((resolve) => {
            restored.push(id);
            setTimeout(() => resolve(true), 300);
          }),
      },
    });
    c.start();
    vi.advanceTimersByTime(2500);
    vi.advanceTimersByTime(2500);
    expect(c.index.value).toBe(2);
    expect(saved).toEqual(["a", "b", "c"]);

    c.back();
    expect(c.rewinding.value).toBe(true);
    expect(c.index.value).toBe(1);
    expect(c.canAdvance).toBe(false);
    c.back(); // pressed again before the first rewind landed
    expect(c.index.value).toBe(0);

    await vi.advanceTimersByTimeAsync(1000);
    expect(restored).toEqual(["b", "a"]);
    expect(c.rewinding.value).toBe(false);
    expect(c.index.value).toBe(0);
    expect(c.reviewing.value).toBe(false); // the game is back there: it is the live step
    expect(c.frontier.value).toBe(0);
    expect(c.paused.value).toBe(true);

    // Playing on takes fresh snapshots for the steps it re-enters
    c.play();
    await vi.advanceTimersByTimeAsync(2500);
    expect(c.index.value).toBe(1);
    expect(saved).toEqual(["a", "b", "c", "a", "b"]);
    c.dispose();
  });

  test("the game's Undo is the tutorial's Back while it runs", () => {
    let guard: ((a: any) => boolean | "handled") | undefined;
    let undo: { undo: () => void } | undefined;
    const view = { ...makeView(), setGuard: (g: any) => (guard = g), setUndo: (u: any) => (undo = u) };
    const c = new TutorialController({ spec, view, autoAdvanceDelayMs: 100, now: () => Date.now() });
    c.start();
    expect(undo).toBeDefined();
    vi.advanceTimersByTime(2500);
    expect(c.index.value).toBe(1);

    // The engine's Undo, as a prompt would report it, is redirected rather than refused
    expect(guard?.({ type: "undo", fullReset: false })).toBe("handled");
    expect(c.index.value).toBe(0);
    expect(c.paused.value).toBe(true);

    // The Undo button itself
    c.next();
    expect(c.index.value).toBe(1);
    undo?.undo();
    expect(c.index.value).toBe(0);

    // After the tutorial the game owns Undo again
    c.skip();
    expect(undo).toBeUndefined();
    expect(guard).toBeUndefined();
    c.dispose();
  });

  test("playback speed: 2x halves a step's narration time, including a change mid-step", () => {
    const c = make();
    c.setRate(2);
    c.start();
    vi.advanceTimersByTime(1200); // 2 s of reading at 2x, plus the 100 ms auto-advance beat
    expect(c.index.value).toBe(1);

    // Halfway through step 2 at 2x (0.5 s real = 1 s of reading), drop back to 1x: 1 s left
    vi.advanceTimersByTime(500);
    c.setRate(1);
    vi.advanceTimersByTime(800);
    expect(c.index.value).toBe(1);
    vi.advanceTimersByTime(400);
    expect(c.index.value).toBe(2);
    c.dispose();
  });

  test("a do-it step that passes mid-narration finishes its narration before moving on", () => {
    let done = false;
    const listeners: (() => void)[] = [];
    const view = {
      ...makeView(),
      onChange: (cb: () => void) => {
        listeners.push(cb);
        return () => {};
      },
    };
    const doIt = defineTutorial<PlayerChit, RootChit<PlayerChit>>({
      id: "doit",
      locale: "en",
      title: "Do it",
      steps: [
        // 9 words: 3 s on the reading clock
        { id: "act", text: "one two three four five six seven eight nine", waitFor: () => done, allow: "any" },
        { id: "next", text: "the end", end: "continue" },
      ],
    });
    const c = new TutorialController({ spec: doIt, view, satisfiedDelayMs: 200, now: () => Date.now() });
    c.start();
    vi.advanceTimersByTime(500);
    done = true;
    listeners.forEach((l) => l()); // the player did it half a second in
    expect(c.status.value).toBe("satisfied");
    vi.advanceTimersByTime(1500); // well past the old 900 ms cut-off, narration still going
    expect(c.index.value).toBe(0);
    vi.advanceTimersByTime(1300); // narration ends at 3 s, then the 200 ms beat
    expect(c.index.value).toBe(1);
    c.dispose();
  });

  describe("acting ahead", () => {
    // talk, talk, do it (press Go), talk, do it (press Again), the end
    let done = 0;
    const listeners: (() => void)[] = [];
    const saved: string[] = [];
    const events: string[] = [];
    let guard: ((a: any) => boolean | "handled") | undefined;
    const ahead = defineTutorial<PlayerChit, RootChit<PlayerChit>>({
      id: "ahead",
      locale: "en",
      title: "Ahead",
      steps: [
        { id: "talk1", text: "one two three four five six" },
        { id: "talk2", text: "one two three four five six", pause: true },
        { id: "go", text: "press go now", allow: [{ button: "Go" }, { ui: "gallery:modeButton" }], waitFor: () => done >= 1 },
        { id: "talk3", text: "one two three four five six" },
        { id: "again", text: "press again", allow: { button: "Again" }, waitFor: () => done >= 2 },
        { id: "end", text: "the end", end: "continue" },
      ],
    });
    const press = (label: string) => {
      const pick = new ButtonPick();
      pick.button = { label } as any;
      return guard?.({ type: "pick", pick, value: undefined });
    };
    const land = () => {
      done++;
      listeners.forEach((l) => l());
    };
    const make = () => {
      done = 0;
      listeners.length = 0;
      saved.length = 0;
      events.length = 0;
      const view = {
        ...makeView(),
        setGuard: (g: any) => (guard = g),
        onChange: (cb: () => void) => {
          listeners.push(cb);
          return () => {};
        },
      };
      return new TutorialController({
        spec: ahead,
        view,
        autoAdvanceDelayMs: 100,
        satisfiedDelayMs: 200,
        now: () => Date.now(),
        history: { save: (id: string) => saved.push(id), restore: async () => true },
        onEvent: (e) => e.type === "step" && events.push(e.stepId),
      });
    };

    test("the next do-it step's move, made while an earlier step talks, moves on to that step", () => {
      const c = make();
      c.start();
      vi.advanceTimersByTime(500);
      expect(press("Go")).toBe(true);
      // The steps in between count as seen, so Back has somewhere to go
      expect(c.index.value).toBe(2);
      expect(saved).toEqual(["talk1", "talk2", "go"]);
      expect(events).toEqual(["talk1", "talk2", "go"]);
      // The step is not narrated: it would only ask for what was just done
      expect(c.narrating.value).toBe(false);
      land();
      expect(c.status.value).toBe("satisfied");
      vi.advanceTimersByTime(250);
      expect(c.index.value).toBe(3);
      expect(c.narrating.value).toBe(true);
      c.dispose();
    });

    test("a move for a later do-it step, or one nothing asks for, is still refused", () => {
      const c = make();
      c.start();
      expect(press("Again")).toBe(false);
      expect(press("Other")).toBe(false);
      expect(c.index.value).toBe(0);
      c.dispose();
    });

    test("tapping the control the next do-it step allows moves on too, aliases included", () => {
      const c = make();
      c.start();
      c.usedUi("log"); // not asked for
      expect(c.index.value).toBe(0);
      c.usedUi("gallery:toInline"); // "gallery:modeButton" stands for it
      expect(c.index.value).toBe(2);
      // the control's effect did not satisfy the check: narrate after all
      vi.advanceTimersByTime(250);
      expect(c.status.value).toBe("waiting");
      expect(c.narrating.value).toBe(true);
      c.dispose();
    });
  });

  test("poses change chits in the view for their step, keep when asked, and are put back", () => {
    const card = new PlayerChit() as PlayerChit & { faceDown?: boolean; tilt?: number };
    const token = new PlayerChit() as PlayerChit & { faceDown?: boolean; tilt?: number };
    const log: string[] = [];
    const view = {
      ...makeView(),
      pose: (chit: any, change: (c: any) => void) => {
        change(chit);
        log.push(`pose ${chit === card ? "card" : "token"}`);
      },
      unpose: (chit: any) => {
        chit.faceDown = undefined;
        chit.tilt = undefined;
        log.push(`unpose ${chit === card ? "card" : "token"}`);
      },
    };
    const posing = defineTutorial<PlayerChit, RootChit<PlayerChit>>({
      id: "pose",
      locale: "en",
      title: "Pose",
      steps: [
        {
          id: "a",
          text: "one two three. four five six.",
          pose: [
            { chit: () => card, set: { faceDown: true } },
            { chit: () => token, set: (c: any) => (c.tilt = 1), keep: true },
          ],
          // the second sentence turns the card back over
          cues: [{ at: { sentence: 1 }, pose: [{ chit: () => card }] }],
        },
        { id: "b", text: "one two three four five six", pose: [{ chit: () => card, set: { faceDown: true } }] },
        { id: "c", text: "one two three four five six" },
        { id: "d", text: "the end", end: "continue" },
      ],
    });
    const c = new TutorialController({ spec: posing, view, autoAdvanceDelayMs: 100, now: () => Date.now() });
    c.start();
    expect(card.faceDown).toBe(true);
    expect(token.tilt).toBe(1);
    vi.advanceTimersByTime(1100); // into the second sentence
    expect(card.faceDown).toBeUndefined();

    vi.advanceTimersByTime(1100); // step b poses the card again
    expect(c.index.value).toBe(1);
    expect(card.faceDown).toBe(true);
    vi.advanceTimersByTime(2200); // step c: b's pose ends, the kept one stays
    expect(c.index.value).toBe(2);
    expect(card.faceDown).toBeUndefined();
    expect(token.tilt).toBe(1);
    expect(log).toEqual(["pose card", "pose token", "unpose card", "pose card", "unpose card"]);

    // The end of the tutorial puts everything back
    c.skip();
    expect(token.tilt).toBeUndefined();
    c.dispose();
  });

  test("timeline commands hold the board N moments on, until a moment, and let it play again", () => {
    let clock = 10;
    let log: string | undefined;
    const holds: (number | undefined)[] = [];
    const listeners: (() => void)[] = [];
    const show = (c: number, line?: string) => {
      clock = c;
      log = line;
      listeners.forEach((l) => l());
    };
    const view = {
      ...makeView(),
      clock: () => clock,
      latestLog: () => log,
      onChange: (cb: () => void) => {
        listeners.push(cb);
        return () => {};
      },
      timeline: { at: () => clock, hold: (c: number | undefined) => holds.push(c) },
    };
    const timed = defineTutorial<PlayerChit, RootChit<PlayerChit>>({
      id: "timeline",
      locale: "en",
      title: "Timeline",
      steps: [
        // two moments on from the one on screen, then freeze where the second sentence starts
        {
          id: "a",
          text: "one two three. four five six.",
          timeline: { advance: 2 },
          cues: [{ at: { sentence: 1 }, timeline: "hold" }],
        },
        // play until Robin's buy is on the board
        { id: "b", text: "one two three four five six", timeline: { until: (ctx) => ctx.recentLog.some((l) => /Robin buys/.test(l)) } },
        { id: "c", text: "one two three four five six", timeline: "play" },
        { id: "d", text: "the end", end: "continue" },
      ],
    });
    const c = new TutorialController({ spec: timed, view, autoAdvanceDelayMs: 100, now: () => Date.now() });
    c.start();
    expect(holds).toEqual([12]);
    show(11);
    vi.advanceTimersByTime(1100); // the second sentence: hold where the board is now
    expect(holds).toEqual([12, 11]);

    vi.advanceTimersByTime(1100); // step b plays on until the log says so
    expect(c.index.value).toBe(1);
    expect(holds).toEqual([12, 11, undefined]);
    show(12, "Sam passes");
    expect(holds.length).toBe(3);
    show(13, "Robin buys a card");
    expect(holds).toEqual([12, 11, undefined, 13]);
    expect(c.timelineHold.value).toBe(13);

    vi.advanceTimersByTime(2200); // step c lets it play
    expect(c.index.value).toBe(2);
    expect(holds[holds.length - 1]).toBeUndefined();
    c.dispose();
  });

  test("Back and the end of the tutorial let a held board play", async () => {
    const holds: (number | undefined)[] = [];
    const view = { ...makeView(), timeline: { at: () => 5, hold: (c: number | undefined) => holds.push(c) } };
    const held = defineTutorial<PlayerChit, RootChit<PlayerChit>>({
      id: "held",
      locale: "en",
      title: "Held",
      steps: [
        { id: "a", text: "one two three four five six" },
        { id: "b", text: "one two three four five six", timeline: "hold" },
        { id: "c", text: "the end", end: "continue" },
      ],
    });
    const c = new TutorialController({
      spec: held,
      view,
      autoAdvanceDelayMs: 100,
      now: () => Date.now(),
      history: { save: () => {}, restore: async () => true },
    });
    c.start();
    vi.advanceTimersByTime(2200);
    expect(holds).toEqual([5]);
    c.back(); // the rewind needs the board to catch up
    expect(holds).toEqual([5, undefined]);
    await vi.runOnlyPendingTimersAsync();
    c.next();
    expect(holds).toEqual([5, undefined, 5]);
    c.skip();
    expect(holds).toEqual([5, undefined, 5, undefined]);
    c.dispose();
  });

  describe("doing it for the player", () => {
    const build = () => {
      let pressed = 0;
      const listeners: (() => void)[] = [];
      const go = new ButtonPick();
      go.button = { label: "Go" } as any;
      const other = new ButtonPick();
      other.button = { label: "Other" } as any;
      let guard: ((a: any) => boolean | "handled") | undefined;
      const resolved: string[] = [];
      const prompt = {
        picks: [other, go],
        resolvePick: (pick: ButtonPick, value: unknown) => {
          if (guard && !guard({ type: "pick", pick, value })) return;
          resolved.push(pick.button!.label);
          if (pick === go) pressed++;
          listeners.forEach((l) => l());
        },
      };
      const ui: string[] = [];
      const fast: boolean[] = [];
      const view = {
        ...makeView(),
        prompt: () => prompt as any,
        setGuard: (g: any) => (guard = g),
        onChange: (cb: () => void) => {
          listeners.push(cb);
          return () => {};
        },
        pressUi: (name: string) => {
          ui.push(name);
          pressed++;
          listeners.forEach((l) => l());
          return true;
        },
        setFastForward: (on: boolean) => fast.push(on),
      };
      const spec = defineTutorial<PlayerChit, RootChit<PlayerChit>>({
        id: "doit-for-me",
        locale: "en",
        title: "Do it for me",
        steps: [
          { id: "talk", text: "one two three four five six" },
          { id: "go", text: "press go", allow: { button: "Go" }, waitFor: () => pressed >= 1 },
          { id: "open", text: "open the market", allow: { ui: "button:Market" }, waitFor: () => pressed >= 2 },
          { id: "talk2", text: "one two three four five six" },
          { id: "end", text: "the end", end: "continue" },
        ],
      });
      const c = new TutorialController({ spec, view, autoAdvanceDelayMs: 100, satisfiedDelayMs: 200, now: () => Date.now() });
      return { c, resolved, ui, fast, narrating: () => c.narrating.value };
    };

    test("→ makes the waiting step's move: the allowed one, through the guard, then moves on", () => {
      const { c, resolved, ui } = build();
      c.start();
      c.forward(); // Next on a talking step
      expect(c.index.value).toBe(1);
      vi.advanceTimersByTime(1000); // its narration ("press go") is done
      expect(c.status.value).toBe("waiting");
      c.forward(); // the step's move, not the first button on offer
      expect(resolved).toEqual(["Go"]);
      vi.advanceTimersByTime(250);
      expect(c.index.value).toBe(2);
      vi.advanceTimersByTime(1500);
      c.forward(); // a UI step presses its control
      expect(ui).toEqual(["button:Market"]);
      c.dispose();
    });

    test("fast-forward plays through talking and do-it steps and lands on its step, which plays as usual", () => {
      const { c, resolved, ui, fast } = build();
      c.start();
      c.fastForwardTo(3);
      expect(fast).toEqual([true]);
      expect(c.narrating.value).toBe(false);
      vi.advanceTimersByTime(3000); // each step waits for the board to settle (here: always settled)
      expect(resolved).toEqual(["Go"]);
      expect(ui).toEqual(["button:Market"]);
      expect(c.index.value).toBe(3);
      expect(fast).toEqual([true, false]);
      expect(c.fastForwardTarget.value).toBeUndefined();
      expect(c.narrating.value).toBe(true);
      c.dispose();
    });

    test("pausing stops a fast-forward where it is", () => {
      const { c, fast } = build();
      c.start();
      c.fastForwardTo(4);
      c.pause();
      expect(fast).toEqual([true, false]);
      vi.advanceTimersByTime(5000);
      expect(c.index.value).toBe(0);
      c.dispose();
    });
  });

  test("the last sentence stays emphasised through the beat before moving on; a waiting step shows it all", () => {
    const flow = defineTutorial<PlayerChit, RootChit<PlayerChit>>({
      id: "emphasis",
      locale: "en",
      title: "Emphasis",
      steps: [
        { id: "a", text: "One two three. Four five six." },
        { id: "b", text: "Seven eight nine.", pause: true },
        { id: "c", text: "The end.", end: "continue" },
      ],
    });
    const c = new TutorialController({ spec: flow, view: makeView(), autoAdvanceDelayMs: 500, now: () => Date.now() });
    c.start();
    expect(c.sentence.value).toBe(0); // emphasised from the first moment
    vi.advanceTimersByTime(2100); // 6 words at 3/s: narration over, inside the 500 ms beat
    expect(c.index.value).toBe(0);
    expect(c.narrating.value).toBe(false);
    expect(c.sentence.value).toBe(1); // still the last sentence, not the whole paragraph
    vi.advanceTimersByTime(600);
    expect(c.index.value).toBe(1);
    vi.advanceTimersByTime(1200); // step b waits for Next: the whole paragraph comes back
    expect(c.sentence.value).toBe(-1);
    c.dispose();
  });

  test("a start held from a rewind stays silent until Play", () => {
    const c = make();
    c.start(2, { paused: true });
    expect(c.index.value).toBe(2);
    expect(c.narrating.value).toBe(false);
    vi.advanceTimersByTime(10000);
    expect(c.index.value).toBe(2);
    c.toggleNarration();
    vi.advanceTimersByTime(2500);
    expect(c.index.value).toBe(3);
    c.dispose();
  });
});

describe("TutorialRuntime forced moves", () => {
  test("a bot waits for the step that scripts its next move, and is woken when it arrives", () => {
    const scripted = defineTutorial<PlayerChit, RootChit<PlayerChit>>({
      id: "bots",
      locale: "en",
      title: "Bots",
      steps: [
        { id: "talk", text: "Watch." },
        { id: "robin", text: "Robin moves.", ai: { p1: [{ key: "market.buy" }] } },
        { id: "after", text: "Done.", end: "continue" },
      ],
    });
    const runtime = new TutorialRuntime(scripted);
    const robin = runtime.aiOptionsFor("p1");
    const sam = runtime.aiOptionsFor("p2");
    const rechecks: string[] = [];
    runtime.attachBots([
      { playerId: "p1", prompts: { recheck: () => rechecks.push("p1") } } as any,
      { playerId: "p2", prompts: { recheck: () => rechecks.push("p2") } } as any,
    ]);

    const prompt: any = { id: "x", type: "PickPrompt", details: { picks: [{ type: "ChitPick", details: {} }] } };
    expect(robin.hold?.(prompt)).toBe(true); // setup: Robin's move belongs to the "robin" step
    expect(sam.hold?.(prompt)).toBe(false); // nothing scripted for Sam: plays normally
    runtime.activeStep.value = "talk";
    expect(robin.hold?.(prompt)).toBe(true);
    runtime.activeStep.value = "robin";
    expect(robin.hold?.(prompt)).toBe(false);
    runtime.activeStep.value = "done";
    expect(robin.hold?.(prompt)).toBe(false);
  });

  test("a waiting bot still answers the engine's Confirm, unless that Confirm is its scripted move", () => {
    const confirmOnly: any = {
      id: "c1",
      type: "PickPrompt",
      canReset: false,
      canStageInEarly: 0,
      details: { picks: [{ type: "ButtonPick", details: { __buttonType: "Confirm", __f: [] } }] },
    };
    const buyPrompt: any = {
      id: "b1",
      type: "PickPrompt",
      canReset: false,
      canStageInEarly: 0,
      details: { picks: [{ type: "ChitPick", details: { c: ["card1"], f: [] } }] },
    };
    const scripted = defineTutorial<PlayerChit, RootChit<PlayerChit>>({
      id: "confirms",
      locale: "en",
      title: "Confirms",
      steps: [
        { id: "talk", text: "Watch." },
        {
          id: "later",
          text: "Moves.",
          ai: { p1: [{ key: "market.buy" }], p2: [{ button: "Confirm" }] },
        },
      ],
    });
    const runtime = new TutorialRuntime(scripted);
    runtime.activeStep.value = "talk";
    const robin = runtime.aiOptionsFor("p1");
    const sam = runtime.aiOptionsFor("p2");
    expect(robin.hold?.(buyPrompt)).toBe(true); // its buy waits for "later"
    expect(robin.hold?.(confirmOnly)).toBe(false); // but it can still end the turn it is in
    expect(sam.hold?.(confirmOnly)).toBe(true); // Sam's scripted move is that Confirm: it waits
  });
});
