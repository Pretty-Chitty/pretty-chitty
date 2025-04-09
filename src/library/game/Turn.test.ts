import { expect, test } from "vitest";
import { mock } from "vitest-mock-extended";

import { Chit } from "./Chit";
import { Match } from "./Match";
import { Turn } from "./Turn";
import { TurnState } from "./TurnState";
import { PlayerInfo } from "./PlayerInfo";
import { ClockDetails } from "./ClockDetails";
import { nextTick } from "process";
import { PlayerChit } from "./PlayerChit";

class FakeChit extends Chit {
  public s1 = "s1";
  public s2 = "s1";
}

test("rng is replayable", async () => {
  const match = mock<Match<any, any>>();
  const fn = async (turn: Turn<any, any, any>) => {
    const rngs = [];
    rngs.push(turn.rng());
    rngs.push(turn.rng());
    rngs.push(turn.rng());
    rngs.push(turn.rng());
    rngs.push(turn.rng());
    return rngs;
  };

  const chit = new Chit();
  chit.id = "root";

  const state = new TurnState();

  // different turns, but reusing state
  const result1 = await new Turn("id", match, state, fn, [chit]).execute();
  const result2 = await new Turn("id", match, state, fn, [chit]).execute();

  expect(result1).toEqual(result2);
});

test("basic select choices works", async () => {
  const match = mock<Match<any, any>>();
  const player = new PlayerChit(new PlayerInfo("id", "my name"));
  player.playerId = "p1";

  const c1 = new Chit();
  c1.id = "c1";
  const c2 = new Chit();
  c2.id = "c2";

  // different turns, but reusing state
  let calledCount = 0;
  player.promptStatus.latestPrompt.on((latestPrompt) => {
    if (latestPrompt) {
      calledCount++;
      latestPrompt.resolve("c1");
    }
  });

  const fn = async (turn: Turn<any, any, any>) => {
    const selected = await turn.select([c1, c2]);
    if (selected === c1) {
      return 1;
    }
    return 2;
  };

  const state = new TurnState();
  const t1 = new Turn("id", match, state, fn, [c1, c2], player);
  const result1 = await t1.execute();

  expect(result1).toEqual(1);
  expect(t1.clock).toEqual(0); // prompts do not alter chits and so clock does not actually change
  expect(calledCount).toEqual(2); // 2nd one is the confirm!

  // now if we re-use the state, we should get the same result, but "calledCount" shouldn't increment
  const t2 = new Turn("id", match, state, fn, [c1, c2], player);
  const result2 = await t2.execute();
  expect(result2).toEqual(1);
  expect(t2.clock).toEqual(0);
  expect(calledCount).toEqual(2);
});

test("basic clock mechanics", async () => {
  const match = mock<Match<any, any>>();

  const state = new TurnState();
  let c1s1 = "";
  const run = async () => {
    const c1 = new FakeChit();
    c1.id = "c1";
    const c2 = new FakeChit();
    c2.id = "c2";

    const t = new Turn(
      "id",
      match,
      state,
      async (turn: Turn<any, any, any>) => {
        c1.s1 = "updated s1!";
        turn.flush();
        c1.s1 = "updated s1!"; // this should be a no-op
        turn.flush();
        c1.s1 = `updated s1 again! ${turn.rng()}`;
        turn.flush();
        turn.flush(); // this should bea  no-op
        c2.s1 = "updated c2 s1";
        c1.s2 = "updated c1 s2";
      },
      [c1, c2],
    );
    await t.execute();

    c1s1 = c1.s1;
    return t.clock;
  };

  expect(await run()).toEqual(3);
  const originalC1s1 = c1s1; // make sure rngs get replayed correctly as well

  // now if we re-use the state, we should get the same result
  expect(await run()).toEqual(3);
  expect(originalC1s1, c1s1);
});

test("ids get autoassigned", async () => {
  const match = mock<Match<any, any>>();

  const state = new TurnState();
  let counter = 0;
  const run = async () => {
    const c = new FakeChit();
    c.id = "root";

    const t = new Turn(
      "id",
      match,
      state,
      async (turn: Turn<any, any, any>) => {
        const sub = new FakeChit();
        c.add(sub);
        sub.s1 = `updated s1 again! ${++counter}`;
        turn.flush();
        const sub2 = new FakeChit();
        c.add(sub2);
        sub2.s1 = `updated s1 again!`;
        const sub3 = new FakeChit();
        c.add(sub3);
        sub3.s1 = `updated s1 again again!`;
        c.remove(sub2);
      },
      [c],
    );
    await t.execute();

    expect(t.clock).toEqual(2);
    expect((t.findChit("id.1") as FakeChit).s1, "updated s1 again again!");
    return (t.findChit("id.0") as FakeChit).s1;
  };

  expect(await run()).toEqual("updated s1 again! 1");
  expect(await run()).toEqual("updated s1 again! 2");
});

test("chits get deleted (and unlocked appropriately)", async () => {
  const match = mock<Match<any, any>>();

  const state = new TurnState();
  let counter = 0;
  const run = async () => {
    const c = new FakeChit();
    c.id = "root";

    const t = new Turn(
      "id",
      match,
      state,
      async (turn: Turn<any, any, any>) => {
        expect(c.lockedBy).toEqual(turn);
        const sub = new FakeChit();
        c.add(sub);
        sub.s1 = `updated s1 again! ${++counter}`;
        turn.flush();
        const sub2 = new FakeChit();
        c.add(sub2);
        sub2.s1 = `updated s1 again!`;
        const sub3 = new FakeChit();
        c.add(sub3);
        sub3.s1 = `updated s1 again again!`;
        sub2.removeFromParent();
        expect(sub3.lockedBy).toEqual(undefined);
        expect(sub2.lockedBy).toEqual(undefined);
        turn.flush();
        expect(sub3.lockedBy).toEqual(turn);
        expect(sub2.lockedBy).toEqual(undefined);
        sub3.removeFromParent();
        expect(sub3.lockedBy).toEqual(turn);
        turn.flush();
        expect(sub3.lockedBy).toEqual(undefined);
      },
      [c],
    );
    await t.execute();

    expect(t.clock).toEqual(3);
    expect((t.findChit("id.1") as FakeChit).s1, "updated s1 again again!");
    return (t.findChit("id.0") as FakeChit).s1;
  };

  expect(await run()).toEqual("updated s1 again! 1");
  expect(await run()).toEqual("updated s1 again! 2");
});

test("single subturn for second player", async () => {
  const match = mock<Match<any, any>>();
  const p1 = new PlayerChit(new PlayerInfo("p1", "player 1"));
  const p2 = new PlayerChit(new PlayerInfo("p2", "player 2"));

  const state = new TurnState();
  const run = async () => {
    const c = new FakeChit();
    c.id = "root";

    const t = new Turn<number, PlayerChit, any>(
      "id",
      match,
      state,
      async (turn) => {
        const sub = new FakeChit();
        c.add(sub);
        sub.s1 = `new sub`;
        turn.flush();
        const subsub = new FakeChit();
        sub.add(subsub);
        subsub.s1 = `new subsub`;
        turn.flush();

        expect(c.lockedBy).toEqual(turn);
        expect(sub.lockedBy).toEqual(turn);
        expect(subsub.lockedBy).toEqual(turn);

        let subsubsub = new FakeChit();

        const result = await turn.createTurn<number>([sub], p2, async (subTurn) => {
          expect(c.lockedBy).toEqual(turn);
          expect(sub.lockedBy).toEqual(subTurn);
          expect(subsub.lockedBy).toEqual(subTurn);
          subsubsub = new FakeChit();
          subsub.add(subsubsub);
          expect(subsubsub.lockedBy).toEqual(undefined);
          subTurn.flush();
          expect(subsubsub.lockedBy).toEqual(subTurn);
          return 1;
        });

        expect(c.lockedBy).toEqual(turn);
        expect(sub.lockedBy).toEqual(turn);
        expect(subsub.lockedBy).toEqual(turn);
        expect(subsubsub.lockedBy).toEqual(turn);

        return result + 1;
      },
      [c, p1, p2],
      p1,
    );
    return await t.execute();
  };

  expect(await run()).toEqual(2);
  expect(await run()).toEqual(2);
});

test("concurrent turns are okay", async () => {
  const match = mock<Match<any, any>>();
  const p1 = new PlayerChit(new PlayerInfo("p1", "player 1"));
  const p2 = new PlayerChit(new PlayerInfo("p2", "player 2"));
  let p2CalledCount = 0;
  p2.promptStatus.latestPrompt.on(() => {
    if (p2.promptStatus.latestPrompt.value) {
      p2CalledCount++;
      p2.promptStatus.latestPrompt.value.resolve("id.1");
    }
  });

  const p3 = new PlayerChit(new PlayerInfo("p3", "player 3"));
  let p3CalledCount = 0;
  p3.promptStatus.latestPrompt.on(() => {
    if (p3.promptStatus.latestPrompt.value) {
      p3CalledCount++;
      p3.promptStatus.latestPrompt.value.resolve("id.0");
    }
  });

  const state = new TurnState();
  const run = async () => {
    const c = new FakeChit();
    c.id = "root";

    const t = new Turn<any, any, any>(
      "id",
      match,
      state,
      async (turn) => {
        const p3chit = new FakeChit();
        c.add(p3chit);
        const p2chit = new FakeChit();
        c.add(p2chit);

        const p3result = turn.createTurn<number>([p3chit], p3, async (subTurn) => {
          await subTurn.select([p3chit]);
          return 1;
        });

        const p2result = turn.createTurn<number>([p2chit], p2, async (subTurn) => {
          await subTurn.select([p2chit]);
          return 2;
        });

        return (await p2result) + (await p3result);
      },
      [c, p1, p2, p3],
      p1,
    );
    return await t.execute();
  };

  expect(await run()).toEqual(3);
  expect(p2CalledCount).toEqual(2);
  expect(p3CalledCount).toEqual(2);
  expect(await run()).toEqual(3);
  expect(p2CalledCount).toEqual(2);
  expect(p3CalledCount).toEqual(2);
});

test("concurrent turns with the same player are not okay", async () => {
  const match = mock<Match<any, any>>();
  const p1 = new PlayerChit(new PlayerInfo("p1", "player 1"));
  const p2 = new PlayerChit(new PlayerInfo("p2", "player 2"));
  let p2CalledCount = 0;
  p2.promptStatus.latestPrompt.on(() => {
    if (p2.promptStatus.latestPrompt.value) {
      p2CalledCount++;
      p2.promptStatus.latestPrompt.value.resolve("id.0");
    }
  });

  const state = new TurnState();
  const run = async () => {
    const c = new FakeChit();
    c.id = "root";

    const t = new Turn<any, any, any>(
      "id",
      match,
      state,
      async (turn) => {
        const p2chit = new FakeChit();
        c.add(p2chit);
        const p3chit = new FakeChit();
        c.add(p3chit);

        const [p2result, p2results2] = await Promise.all([
          turn.createTurn<number>([p2chit], p2, async (subTurn) => {
            await subTurn.select([p2chit]);
            return 2;
          }),
          turn.createTurn<number>([p3chit], p2, async (subTurn) => {
            await subTurn.select([p3chit]);
            return 3;
          }),
        ]);

        return p2result + p2results2;
      },
      [c, p1, p2],
      p1,
    );

    return await t.execute();
  };

  await expect(() => run()).rejects.toThrowError(/Only one sub-turn can be active at a time per player/);
  expect(p2CalledCount).toEqual(0);
});

test("serial turns with the same player are okay", async () => {
  const match = mock<Match<any, any>>();
  const p1 = new PlayerChit(new PlayerInfo("p1", "player 1"));
  const p2 = new PlayerChit(new PlayerInfo("p2", "player 2"));
  let p2CalledCount = 0;
  p2.promptStatus.latestPrompt.on(() => {
    if (p2.promptStatus.latestPrompt.value) {
      p2CalledCount++;
      p2.promptStatus.latestPrompt.value.resolve("id.0");
    }
  });

  const state = new TurnState();
  const run = async () => {
    const c = new FakeChit();
    c.id = "root";

    const t = new Turn(
      "id",
      match,
      state,
      async (turn) => {
        const p2chit = new FakeChit();
        c.add(p2chit);

        const p2result = await turn.createTurn<number>([p2chit], p2, async (subTurn) => {
          await subTurn.select([p2chit]);
          return 2;
        });

        const p2result2 = await turn.createTurn<number>([p2chit], p2, async (subTurn) => {
          await subTurn.select([p2chit]);
          return 2;
        });

        return p2result + p2result2;
      },
      [c],
      p1,
    );
    return await t.execute();
  };

  // cannot have two ongoing turns with the same player
  expect(await run()).toEqual(4);
  expect(p2CalledCount).toEqual(4);
});

async function runTurn(choices: { playerId: string; choice: string }[]) {
  const match = mock<Match<any, any>>();
  const playerLookup: { [id: string]: PlayerChit } = {
    p1: new PlayerChit(new PlayerInfo("p1", "player 1")),
    p2: new PlayerChit(new PlayerInfo("p2", "player 2")),
  };

  const root = new FakeChit();
  root.id = "root";

  const t = new Turn(
    "id",
    match,
    new TurnState(),
    async (turn) => {
      const a = new FakeChit();
      a.s1 = "a";
      root.add(a);
      turn.flush();

      const b = new FakeChit();
      b.s1 = "b";
      root.add(b);
      turn.flush();

      const c = new FakeChit();
      c.s1 = "c";
      root.add(c);
      turn.flush();

      a.s1 = "a2";
      b.s1 = "b2";
      turn.flush();

      await Promise.all([
        turn.createTurn<number>([a], playerLookup.p1, async (subTurn) => {
          a.s1 = "a2.1";
          await subTurn.select([a]);
          a.s1 = "a2.2";
          await subTurn.select([a]);
          return 2;
        }),
        turn.createTurn<number>([b], playerLookup.p2, async (subTurn) => {
          b.s1 = "b2.1";
          await subTurn.select([b]);
          b.s1 = "b2.2";
          await subTurn.select([b]);
          return 2;
        }),
      ]);

      a.s1 = "a3";
      b.s1 = "b3";
      turn.flush();
      b.s1 = "b4";
      turn.flush();

      await turn.createTurn<number>([a], playerLookup.p1, async (subTurn) => {
        await subTurn.select([a]);
        return 3;
      });

      return 1;
    },
    [root, ...Object.values(playerLookup)],
  );

  t.execute();

  for (let i = 0; i < choices.length; i++) {
    await new Promise((resolve) => {
      const p = playerLookup[choices[i].playerId];
      const fn = () => {
        if (p.promptStatus.latestPrompt.value) {
          nextTick(() => {
            p.promptStatus.latestPrompt.value?.resolve(choices[i].choice);
            resolve("ok");
          });
          unsubscribe();
        }
      };
      const unsubscribe = p.promptStatus.latestPrompt.on(fn);
      fn();
    });
  }

  // goofy - not ideal?  we want to evaluate stuff after it has "settled".
  await new Promise((resolve) => setTimeout(resolve, 1));

  return t;
}

// test("serialization", async () => {
//   const confirm = (
//     message: string,
//     turn: Turn<any, any, any>,
//     clock: number,
//     clockDetails?: ClockDetails,
//     a?: string,
//     b?: string,
//     c?: string,
//   ) => {
//     const chit = new FakeChit();
//     const serialized = turn.serialize(clock, clockDetails);
//     expect(serialized.clockDetails.clock).toBe(clock);

//     const confirmChit = (id: string, value?: string) => {
//       if (value === undefined) {
//         expect(serialized.chits[id], id + message).toBe(undefined);
//       } else if (value === "DELETED") {
//         chit.deserialize(serialized.chits[id], () => chit);
//         expect(chit.parent, id + message).toBe(undefined);
//       } else {
//         chit.deserialize(serialized.chits[id], () => chit);
//         expect(chit.s1, id + message).toBe(value);
//       }
//     };

//     confirmChit("id.0", a);
//     confirmChit("id.1", b);
//     confirmChit("id.2", c);
//     return serialized.clockDetails;
//   };

//   const t1 = await runTurn([{ playerId: "p1", choice: "id.0" }]);
//   const details1 = confirm("details1", t1, 1, undefined, "a", undefined, undefined);
//   confirm("post details1", t1, 2, undefined, "a", "b", undefined);
//   const details2b = confirm("details2b", t1, 2, details1, undefined, "b", undefined);
//   const details3 = confirm("details3", t1, 3, undefined, "a", "b", "c");
//   confirm("3.1", t1, 3, details1, undefined, "b", "c");
//   confirm("3.2", t1, 3, details2b, undefined, undefined, "c");
//   confirm("3.3", t1, 4, undefined, "a2", "b2", "c");
//   confirm("3.4", t1, 4, details3, "a2", "b2", undefined);
//   const details5 = confirm("details5", t1, 5, undefined, "a2.1", "b2", "c");
//   expect(details5.subTurns && details5.subTurns["id.0"].clock).toBe(1);
//   // the p2's turn hasn't made a move yet but their turn has flushed
//   const details7 = confirm("details7", t1, 7, undefined, "a2.2", "b2.1", "c");
//   expect(details7.subTurns && details7.subTurns["id.1"].clock).toBe(1);

//   // now go backwards!
//   const details5back = confirm("details5back", t1, 4, details5, "a2", undefined, undefined);
//   expect(!details5back.subTurns).toBe(true);
//   confirm("5.1", t1, 3, details5, "a", "b", undefined);
//   confirm("5.2", t1, 2, details5, "a", "b", "DELETED");

//   // if there is a pass mismatch it will reseserialize it all
//   confirm("5.3", t1, 3, details2b, undefined, undefined, "c");
//   details2b.pass = 99;
//   confirm("5.4", t1, 3, details2b, "a", "b", "c");

//   // if there is a pass mismatch it will reseserialize it all
//   confirm("5.5", t1, 4, details3, "a2", "b2", undefined);
//   details3.subTurns = { someTurnThatDoesntExist: { clock: 5, pass: 1 } };
//   confirm("5.6", t1, 4, details3, "a2", "b2", "c");

//   const t1b = await runTurn([
//     { playerId: "p1", choice: "id.0" },
//     { playerId: "p1", choice: "id.0" },
//     { playerId: "p2", choice: "id.1" },
//   ]);
//   // weird funky case where it really has to reserialize everything
//   confirm("weird funky serialize all", t1b, 8, details7, "a2.2", "b2.1", "c");

//   const t1c = await runTurn([
//     { playerId: "p2", choice: "id.1" },
//     { playerId: "p1", choice: "id.0" },
//     { playerId: "p1", choice: "id.0" },
//     { playerId: "p2", choice: "id.1" },
//   ]);
//   // weird funky case where it really has to reserialize everything
//   // const details7c =
//   confirm("details7c", t1c, 8, details7, "a2.2", "b2.1", "c");

//   // these got messed up by adding confirm :(
//   // const details8 = confirm("details8", t1c, 8, details7c, undefined, "b2.2", undefined);
//   // confirm("a3b3", t1c, 9, details8, "a3", "b3", undefined);
// });
