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
              root.lastMover = player.id;
            }).message("take a card");
            const pass = new ChoiceButton(() => {
              root.lastMover = player.id;
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
  clockSteps: { turns?: AnyTurn[] }[];
  _checkpoints: { nextIndex: number }[];
  serialize: (playerId: string, clock: number) => any;
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

/** Runs `fn` with every checkpoint in the tree hidden and none created: a replay from the locked snapshots. */
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
function comparable(response: any): string {
  return JSON.stringify(response, (key, value) => (key === "pass" ? undefined : value));
}

describe("Turn.serialize checkpoints", () => {
  test("match a full replay for every player at every clock, as the game runs", async () => {
    // A short interval so a small game spans several checkpoints
    const defaultInterval = Turn.serializeCheckpointInterval;
    Turn.serializeCheckpointInterval = 8;
    const players = [0, 1, 2].map((i) => new PlayerInfo(`p${i}`, `Bot ${i}`));
    const match = new Match(tableGame(6), players, new EphemeralMatchStorage("serialize"), {});
    await match.load();
    const bots = players.map((p) => connectAiPlayer(match, p.id, { log: false, seed: 1 }));

    let checks = 0;
    const mismatches: string[] = [];
    const resets: string[] = [];
    match.onChange(() => {
      const root = match.turn.value as unknown as AnyTurn | undefined;
      if (!root) return;
      for (const p of players) {
        const max = root.playerVisibleClockTime(p.id);
        // forwards like a client playing the timeline, then backwards like one scrubbing it
        const clocks = [...Array(max).keys()].map((c) => c + 1);
        for (const clock of [...clocks, ...clocks.reverse()]) {
          const expected = withoutCheckpoints(root, () => comparable(root.serialize(p.id, clock)));
          const actual = comparable(root.serialize(p.id, clock));
          checks++;
          if (actual !== expected) {
            mismatches.push(`${p.id}@${clock}`);
          }
        }
        // A move must not throw the walk away: after reading the latest clock, the last
        // checkpoint reaches every step but the one still in motion.
        const last = root._checkpoints[root._checkpoints.length - 1];
        if (root.clockSteps.length > 1 && (!last || last.nextIndex < root.clockSteps.length - 1)) {
          resets.push(`${p.id}: ${last?.nextIndex ?? "none"} of ${root.clockSteps.length}`);
        }
      }
    }, false);

    await match.start();

    expect(mismatches).toEqual([]);
    expect(resets).toEqual([]);
    expect(checks).toBeGreaterThan(1000);

    const root = match.turn.value as unknown as AnyTurn;
    root.serialize("p0", root.playerVisibleClockTime("p0"));
    expect(root.clockSteps.length).toBeGreaterThan(Turn.serializeCheckpointInterval);
    expect(root._checkpoints.length).toBeGreaterThanOrEqual(3);
    expect(root._checkpoints[root._checkpoints.length - 1].nextIndex).toBe(root.clockSteps.length);

    bots.forEach((b) => b.dispose());
    match.dispose();
    Turn.serializeCheckpointInterval = defaultInterval;
  });
});
