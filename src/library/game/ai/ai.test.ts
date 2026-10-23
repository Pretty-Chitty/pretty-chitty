import { describe, expect, test } from "vitest";

import { Chit, HiddenPropertySerializationRule } from "../Chit";
import { Game } from "../Game";
import { GameButton } from "../GameButton";
import { Match } from "../Match";
import { EphemeralMatchStorage } from "../MatchStorage";
import { OrderedOutlet } from "../OrderedOutlet";
import { ChitPick, Pick, PickSerialization } from "../Pick";
import { PlayerChit } from "../PlayerChit";
import { PlayerInfo } from "../PlayerInfo";
import { RootChit } from "../RootChit";
import { Turn } from "../Turn";
import { connectAiPlayer } from "./connectAiPlayer";
import { chooseIndex, chooseSoftmax, createRandom, defineAi, GameAi } from "./defineAi";
import { simulateMatches } from "./simulateMatches";

//
// A tiny game: each player holds one secret card; on their turn they take a card from a public
// market (adding its value to their score) or pass.  Taking a "cursed" card is a dead end.
//

class Card extends Chit {
  value = 0;
  cursed = false;

  override hiddenPropertiesForSerialization(playerIds: string[]): HiddenPropertySerializationRule[] | undefined {
    const owner = this.parent instanceof MarketPlayer ? this.parent.playerId : undefined;
    if (!owner) {
      return undefined;
    }
    return [{ fields: ["value"], playerIds: playerIds.filter((id) => id !== owner) }];
  }
}

class MarketPlayer extends PlayerChit {
  score = 0;
  hand = new OrderedOutlet<Card>("hand", this);
}

class MarketRoot extends RootChit<MarketPlayer> {
  minPlayers = 2;
  market = new OrderedOutlet<Card>("market", this);
}

class PassButton extends GameButton {
  label = "Pass";
}

type MarketConfig = {
  market: number[];
  cursed?: number[];
  rounds?: number;
  ai?: GameAi<MarketPlayer, MarketRoot, any>;
  tag?: boolean;
};

function marketGame(config: MarketConfig): Game<MarketPlayer, MarketRoot> {
  return {
    // Chit.deflate looks chits up by class name, so key them by name too
    chitLibrary: { Root: MarketRoot, Player: MarketPlayer, MarketRoot, MarketPlayer, Card },
    buttonLibrary: { PassButton },
    canvasLibrary: {},
    ai: config.ai,
    async run(setup: Turn<any, MarketPlayer, MarketRoot>, root: MarketRoot) {
      const players = root.players.copy();
      players.forEach((p, i) => p.hand.add(new Card().set((c) => (c.value = 100 + i))));
      config.market.forEach((value) =>
        root.market.add(
          new Card().set((c) => {
            c.value = value;
            c.cursed = config.cursed?.includes(value) ?? false;
          }),
        ),
      );
      setup.flush();

      for (let round = 0; round < (config.rounds ?? 2); round++) {
        for (const player of players) {
          await setup.createTurn([root], player, async (turn) => {
            const take = Chit.pick(root.market, async (c: Card) => {
              player.hand.add(c);
              player.score += c.value;
              if (c.cursed) {
                await turn.noValidMoves("cursed");
              }
            }).message("take a card");
            const pass = new PassButton(() => {
              player.score += 0;
            })
              .pick()
              .message("pass");
            await turn.pick(config.tag === false ? [take, pass] : [take.ai("take"), pass.ai("pass")]);
          });
        }
      }
      return { winners: [players.reduce((a, b) => (b.score > a.score ? b : a))] };
    },
  } as unknown as Game<MarketPlayer, MarketRoot>;
}

async function play(game: Game<MarketPlayer, MarketRoot>, playerCount = 2, extra: (i: number) => object = () => ({})) {
  const players = [...new Array(playerCount)].map((_, i) => new PlayerInfo(`p${i}`, `Bot ${i}`));
  const match = new Match(game, players, new EphemeralMatchStorage("test"), {});
  await match.load();
  const bots = players.map((p, i) => connectAiPlayer(match, p.id, { difficulty: 1, log: false, seed: 1, ...extra(i) }));
  await match.start();
  const root = match.turn.value!.rootChit as MarketRoot;
  return { match, bots, root, remaining: root.market.map((c) => c.value).sort((a, b) => a - b) };
}

describe("Pick.ai", () => {
  test("key and data survive serialization", () => {
    const pick = new ChitPick<Chit>().ai("market.buy", { cost: 3 });
    const serialized = JSON.parse(JSON.stringify(pick.serialize())) as PickSerialization;
    expect(serialized.ai).toEqual({ k: "market.buy", d: { cost: 3 } });

    const copy = Pick.deserialize(serialized, () => undefined as any, {});
    expect(copy.aiTag).toEqual({ k: "market.buy", d: { cost: 3 } });
  });

  test("untagged picks serialize without a tag", () => {
    expect(new ChitPick<Chit>().serialize().ai).toBeUndefined();
  });
});

describe("chooseIndex", () => {
  test("picks the best score with no noise", () => {
    expect(chooseIndex([1, 7, 3], 0, createRandom(1))).toBe(1);
  });

  test("avoids -Infinity unless nothing else is possible", () => {
    expect(chooseIndex([-Infinity, -5, -Infinity], 0, createRandom(1))).toBe(1);
    expect(chooseIndex([-Infinity, -Infinity], 0, createRandom(1))).toBeGreaterThanOrEqual(0);
  });
});

describe("chooseSoftmax", () => {
  test("temperature 0 picks the best", () => {
    expect(chooseSoftmax([1, 7, 3], 0, createRandom(1))).toBe(1);
  });
  test("prefers higher scores in proportion to exp(score / temperature)", () => {
    const rng = createRandom(3);
    const counts = [0, 0];
    for (let i = 0; i < 4000; i++) counts[chooseSoftmax([0, Math.log(3)], 1, rng)]++;
    expect(counts[1] / counts[0]).toBeGreaterThan(2.5);
    expect(counts[1] / counts[0]).toBeLessThan(3.5);
  });
  test("avoids -Infinity unless nothing else is possible", () => {
    expect(chooseSoftmax([-Infinity, -5, -Infinity], 5, createRandom(1))).toBe(1);
  });
});

describe("AI players", () => {
  test("read per-seat params, can be overridden, and report decisions", async () => {
    const ai = defineAi<MarketPlayer, MarketRoot>({
      rules: {
        // params.sign = -1 makes a seat prefer the lowest card
        take: (opt, { params }) => (opt.kind === "chit" ? (opt.chit as Card).value * (params?.sign ?? 1) : 0),
        pass: () => -1000,
      },
    });
    const decisions: { player: string; chosen: number; n: number }[] = [];
    const { root } = await play(marketGame({ market: [1, 5, 3, 2, 9, 4], ai, rounds: 1 }), 2, (i) => ({
      params: { sign: i === 0 ? 1 : -1 },
      onDecision: (d: any) => decisions.push({ player: d.playerId, chosen: d.chosen, n: d.scored.length }),
    }));
    const hands = root.players.copy().map((p) => p.hand.map((c) => c.value).filter((v) => v < 100));
    expect(hands.flat().sort()).toEqual([1, 9]);
    expect(decisions.length).toBe(2);
    expect(decisions.every((d) => d.chosen >= 0 && d.chosen < d.n)).toBe(true);

    // `choose` forces the answer (here: always pass)
    const forced = await play(marketGame({ market: [1, 5, 3], ai, rounds: 1 }), 2, () => ({
      choose: (scored: any[]) => scored.findIndex((s) => s.option.key === "pass"),
    }));
    expect(forced.remaining).toEqual([1, 3, 5]);
  });

  test("pick the highest-scoring option", async () => {
    const ai = defineAi<MarketPlayer, MarketRoot>({
      rules: {
        take: (opt) => (opt.kind === "chit" ? (opt.chit as Card).value : 0),
        pass: () => -1,
      },
    });
    const { remaining } = await play(marketGame({ market: [1, 5, 3, 2, 9, 4], ai }));
    // 2 players x 2 rounds take the four best cards
    expect(remaining).toEqual([1, 2]);
  });

  const seeHands = (serializedView: boolean | undefined) => {
    const seen: { mine?: number; theirs?: number; marketTotal?: number }[] = [];
    const ai = defineAi<MarketPlayer, MarketRoot>({
      serializedView,
      rules: {
        take: (opt, { me, view }) => {
          const opponent = view.players.find((p) => p.id !== me.id)!;
          seen.push({
            mine: me.hand.get(0)?.value,
            theirs: opponent.hand.get(0)?.value,
            marketTotal: view.market.reduce((sum, c) => sum + c.value, 0),
          });
          return (opt as any).chit.value;
        },
        pass: () => -1,
      },
    });
    return { seen, ai };
  };

  test("with serializedView, only see what their seat is sent", async () => {
    const { seen, ai } = seeHands(true);
    await play(marketGame({ market: [1, 2], rounds: 1, ai }));

    expect(seen.length).toBeGreaterThan(0);
    seen.forEach((s) => {
      expect(s.mine).toBeGreaterThanOrEqual(100); // own secret card is visible
      expect(s.theirs).toBeUndefined(); // the opponent's is not
      expect(s.marketTotal).toBeGreaterThan(0); // public cards are
    });
  });

  test("by default, read the live board (hidden information included)", async () => {
    const { seen, ai } = seeHands(undefined);
    await play(marketGame({ market: [1, 2], rounds: 1, ai }));

    expect(seen.length).toBeGreaterThan(0);
    seen.forEach((s) => {
      expect(s.mine).toBeGreaterThanOrEqual(100);
      expect(s.theirs).toBeGreaterThanOrEqual(100); // the live view does not redact
      expect(s.marketTotal).toBeGreaterThan(0);
    });
  });

  test("commit only the winning option's plan, and later prompts can read it", async () => {
    type Memory = { takes: number; lastTaken?: string };
    const ai = defineAi<MarketPlayer, MarketRoot, Memory>({
      initialMemory: () => ({ takes: 0 }),
      rules: {
        take: (opt) => ({
          score: (opt as any).chit.value,
          plan: (prev) => ({ takes: prev.takes + 1, lastTaken: (opt as any).chit.id }),
        }),
        // take once, then pass
        pass: (_opt, { memory }) => ({
          score: memory.takes >= 1 ? 100 : -100,
          plan: (prev) => ({ ...prev, takes: 99 }),
        }),
      },
    });
    const { bots, root, remaining } = await play(marketGame({ market: [1, 5, 3, 2, 9, 4], ai }));
    expect(remaining).toEqual([1, 2, 3, 4]);

    bots.forEach((bot) => {
      const memory = bot.prompts.memorySnapshot as Memory;
      const player = root.players.find((p) => p.id === bot.playerId)!;
      // the losing "take" plans in round 2 were discarded, the winning "pass" plan was committed
      expect(memory.takes).toBe(99);
      // the plan from round 1's winning take points at the card actually in hand
      expect(player.hand.map((c) => c.id)).toContain(memory.lastTaken);
    });
  });

  test("back out of dead ends and try something else", async () => {
    const ai = defineAi<MarketPlayer, MarketRoot>({
      rules: {
        take: (opt) => (opt as any).chit.value,
        pass: () => -1,
      },
    });
    const { bots, remaining } = await play(marketGame({ market: [9, 5, 3, 2], cursed: [9], rounds: 1, ai }));
    // Both bots try the 9 first, hit "no valid moves", undo, and take the next best card
    expect(remaining).toEqual([2, 9]);
    bots.forEach((bot) => {
      expect(bot.prompts.stats.stepBacks).toBe(1);
      expect(bot.prompts.stats.stuck).toBe(0);
    });
  });

  test("restore memory when backing out of a dead end", async () => {
    type Memory = { took: number[] };
    const ai = defineAi<MarketPlayer, MarketRoot, Memory>({
      initialMemory: () => ({ took: [] }),
      rules: {
        take: (opt) => ({
          score: (opt as any).chit.value,
          plan: (prev) => ({ took: [...prev.took, (opt as any).chit.value] }),
        }),
        pass: () => -1,
      },
    });
    const { bots } = await play(marketGame({ market: [9, 5, 3, 2], cursed: [9], rounds: 1, ai }));
    const memories = bots.map((b) => (b.prompts.memorySnapshot as Memory).took);
    // the 9 that led to a dead end was rolled back out of memory
    memories.forEach((took) => expect(took).not.toContain(9));
    expect(memories.flat().sort()).toEqual([3, 5]);
  });

  test("fall back to random when a game has no AI", async () => {
    const report = await simulateMatches(marketGame({ market: [1, 2, 3, 4, 5], tag: false }), {
      players: 3,
      games: 3,
    });
    expect(report.finished).toBe(3);
    expect(report.stuck).toBe(0);
    expect(report.untagged["take a card"]).toBeGreaterThan(0);
  });

  test("simulateMatches reports untagged prompts when a game has partial rules", async () => {
    const ai = defineAi<MarketPlayer, MarketRoot>({ rules: { pass: () => 0 } });
    const report = await simulateMatches(marketGame({ market: [1, 2, 3], ai, tag: true }), { players: 2, games: 2 });
    expect(report.finished).toBe(2);
    expect(Object.keys(report.untagged)).toContain("take a card");
  });
});
