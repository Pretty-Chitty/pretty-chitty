import { describe, expect, test } from "vitest";

import { Chit } from "./Chit";
import { Game } from "./Game";
import { GameButton } from "./GameButton";
import { Match } from "./Match";
import { EphemeralMatchStorage } from "./MatchStorage";
import { OrderedOutlet } from "./OrderedOutlet";
import { PlayerChit } from "./PlayerChit";
import { PlayerInfo } from "./PlayerInfo";
import { RootChit } from "./RootChit";
import { Turn } from "./Turn";
import { connectAiPlayer } from "./ai/connectAiPlayer";

//
// A small game that exercises every kind of clock step: sequential sub-turns, parallel sub-turns,
// flushes with and without logs, amended logs and zips.  Bots play it at random.
//

class Card extends Chit {
  value = 0;
}

class Seat extends PlayerChit {
  score = 0;
  ready = 0;
  hand = new OrderedOutlet<Card>("hand", this);
}

class Table extends RootChit<Seat> {
  minPlayers = 2;
  lastMover = "";
  market = new OrderedOutlet<Card>("market", this);
}

class ChoiceButton extends GameButton {
  label = "Choice";
}

function tableGame(rounds: number): Game<Seat, Table> {
  return {
    chitLibrary: { Root: Table, Player: Seat, Table, Seat, Card },
    buttonLibrary: { ChoiceButton },
    canvasLibrary: {},
    async run(setup: Turn<any, Seat, Table>, root: Table) {
      const players = root.players.copy();
      for (let i = 0; i < 30; i++) {
        root.market.add(new Card().set((c) => (c.value = i)));
      }
      setup.flush();
      setup.log("setup");

      for (let round = 0; round < rounds; round++) {
        for (const player of players) {
          await setup.createTurn([root], player, async (turn) => {
            const take = Chit.pick(root.market, async (c: Card) => {
              player.hand.add(c);
              player.score += c.value;
              root.lastMover = player.id ?? "";
            }).message("take a card");
            const pass = new ChoiceButton(() => {
              root.lastMover = player.id ?? "";
            })
              .pick()
              .message("pass");
            await turn.pick([take, pass]);
            turn.log(`${player.id} moved`);
            turn.zip();
          });
        }
        setup.amendLog((previous) => `${previous} (round ${round})`);

        await setup.runParallelTurns(
          players,
          (p) => [p],
          async (player, turn) => {
            const ready = new ChoiceButton(() => {
              player.ready += 1;
            })
              .pick()
              .message("ready");
            const wait = new ChoiceButton(() => {
              player.ready += 2;
            })
              .pick()
              .message("wait");
            await turn.pick([ready, wait]);
            turn.log(`${player.id} ready`);
          },
        );
        setup.log(`round ${round} done`);
      }
      return { winners: [players[0]] };
    },
  } as unknown as Game<Seat, Table>;
}

// Private engine structure the test reaches into
type AnyTurn = {
  clockSteps: { turns?: AnyTurn[]; absorbed?: AnyTurn[] }[];
  _checkpoints: { nextIndex: number }[];
  lockedChitStates: Record<string, string>;
  absorbed: boolean;
  serialize: (playerId: string, clock: number) => { chits: Record<string, string> };
  chitsHistory: (playerId: string, ids: string[]) => unknown;
  playerVisibleClockTime: (playerId: string) => number;
};

function allTurns(turn: AnyTurn): AnyTurn[] {
  const result = [turn];
  for (const step of turn.clockSteps) {
    for (const sub of step.turns ?? []) {
      result.push(...allTurns(sub));
    }
  }
  return result;
}

/** Every turn in the tree its parent has absorbed */
function finishedTurns(root: AnyTurn): AnyTurn[] {
  return allTurns(root).flatMap((t) => t.clockSteps.flatMap((s) => s.absorbed ?? []));
}

/** Runs `fn` as if every finished turn had released its snapshot and checkpoints at absorption. */
function withReleasedTurns<T>(root: AnyTurn, fn: () => T): T {
  const turns = finishedTurns(root);
  const saved = turns.map((t) => ({ locked: t.lockedChitStates, checkpoints: t._checkpoints, absorbed: t.absorbed }));
  turns.forEach((t) => {
    t.lockedChitStates = {};
    t._checkpoints = [];
    t.absorbed = true;
  });
  try {
    return fn();
  } finally {
    turns.forEach((t, i) => {
      t.lockedChitStates = saved[i].locked;
      t._checkpoints = saved[i].checkpoints;
      t.absorbed = saved[i].absorbed;
    });
  }
}

/** Runs `fn` with every checkpoint in the tree hidden and none created: a replay from the snapshots. */
function withoutCheckpoints<T>(root: AnyTurn, fn: () => T): T {
  const turns = allTurns(root);
  const saved = turns.map((t) => t._checkpoints);
  turns.forEach((t) => (t._checkpoints = []));
  Turn.serializeCheckpoints = false;
  try {
    return fn();
  } finally {
    Turn.serializeCheckpoints = true;
    turns.forEach((t, i) => (t._checkpoints = saved[i]));
  }
}

// `pass` is wall-clock based; everything else must match exactly
function comparable(response: unknown): string {
  return JSON.stringify(response, (key, value) => (key === "pass" ? undefined : value));
}

const PLAYERS = [0, 1, 2].map((i) => new PlayerInfo(`p${i}`, `Bot ${i}`));

/** Plays the game with seeded bots, calling `onChange(root)` at every match change, and returns the root turn. */
async function play(onChange: (root: AnyTurn) => void): Promise<AnyTurn> {
  const match = new Match(tableGame(6), PLAYERS, new EphemeralMatchStorage("serialize"), {});
  await match.load();
  const bots = PLAYERS.map((p) => connectAiPlayer(match, p.id, { log: false, seed: 1 }));
  match.onChange(() => {
    const root = match.turn.value as unknown as AnyTurn | undefined;
    if (root) onChange(root);
  }, false);
  await match.start();
  bots.forEach((b) => b.dispose());
  const root = match.turn.value as unknown as AnyTurn;
  match.dispose();
  return root;
}

/**
 * Compares two ways of reading the match for every player at every clock, forwards like a client
 * playing the timeline, then backwards like one scrubbing it, and the history of every chit.
 * Returns the readings that differed.
 */
function compareEveryReading(
  root: AnyTurn,
  read: (fn: () => string) => [expected: string, actual: string],
  counter: { checks: number },
): string[] {
  const mismatches: string[] = [];
  const check = (label: string, fn: () => string) => {
    const [expected, actual] = read(fn);
    counter.checks++;
    if (expected !== actual) mismatches.push(label);
  };
  for (const p of PLAYERS) {
    const max = root.playerVisibleClockTime(p.id);
    const clocks = [...Array(max).keys()].map((c) => c + 1);
    for (const clock of [...clocks, ...clocks.reverse()]) {
      check(`${p.id}@${clock}`, () => comparable(root.serialize(p.id, clock)));
    }
    const ids = Object.keys(root.serialize(p.id, max).chits);
    check(`${p.id} history`, () => JSON.stringify(root.chitsHistory(p.id, ids)));
  }
  return mismatches;
}

describe("Turn.serialize", () => {
  test("checkpoints match a full replay for every player at every clock, as the game runs", async () => {
    // A short interval so a small game spans several checkpoints
    const defaultInterval = Turn.serializeCheckpointInterval;
    Turn.serializeCheckpointInterval = 8;
    try {
      const counter = { checks: 0 };
      const mismatches: string[] = [];
      const resets: string[] = [];
      const root = await play((root) => {
        mismatches.push(...compareEveryReading(root, (fn) => [withoutCheckpoints(root, fn), fn()], counter));
        // A move must not throw the walk away: after reading the latest clock, the last
        // checkpoint reaches every step but the one still in motion.
        const last = root._checkpoints[root._checkpoints.length - 1];
        if (root.clockSteps.length > 1 && (!last || last.nextIndex < root.clockSteps.length - 1)) {
          resets.push(`${last?.nextIndex ?? "none"} of ${root.clockSteps.length}`);
        }
      });

      expect(mismatches).toEqual([]);
      expect(resets).toEqual([]);
      expect(counter.checks).toBeGreaterThan(1000);

      root.serialize("p0", root.playerVisibleClockTime("p0"));
      expect(root.clockSteps.length).toBeGreaterThan(Turn.serializeCheckpointInterval);
      expect(root._checkpoints.length).toBeGreaterThanOrEqual(3);
      expect(root._checkpoints[root._checkpoints.length - 1].nextIndex).toBe(root.clockSteps.length);
    } finally {
      Turn.serializeCheckpointInterval = defaultInterval;
    }
  });

  test("finished turns read the same without their snapshots and checkpoints", async () => {
    // Reference game: every finished turn keeps its locked snapshot and checkpoints. At every
    // change, each reading is taken that way and again as a plain replay with them released.
    Turn.releaseAbsorbedTurns = false;
    try {
      const counter = { checks: 0 };
      const mismatches: string[] = [];
      const root = await play((root) => {
        mismatches.push(
          ...compareEveryReading(
            root,
            (fn) => [fn(), withReleasedTurns(root, () => withoutCheckpoints(root, fn))],
            counter,
          ),
        );
      });
      expect(mismatches).toEqual([]);
      expect(counter.checks).toBeGreaterThan(1000);
      expect(finishedTurns(root).length).toBeGreaterThan(10);
      expect(finishedTurns(root).filter((t) => Object.keys(t.lockedChitStates).length === 0)).toEqual([]);
    } finally {
      Turn.releaseAbsorbedTurns = true;
    }

    // As shipped, a finished turn holds nothing; the live root keeps its own snapshot
    const root = await play(() => {});
    root.serialize("p0", root.playerVisibleClockTime("p0"));
    const finished = finishedTurns(root);
    expect(finished.length).toBeGreaterThan(10);
    expect(finished.filter((t) => !t.absorbed)).toEqual([]);
    expect(finished.filter((t) => Object.keys(t.lockedChitStates).length > 0)).toEqual([]);
    expect(finished.filter((t) => t._checkpoints.length > 0)).toEqual([]);
    expect(Object.keys(root.lockedChitStates).length).toBeGreaterThan(0);
  });
});
