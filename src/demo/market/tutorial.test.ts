import { describe, expect, test } from "vitest";
import { runTutorial } from "../../library/game/tutorial/runTutorial";
import { listTutorials } from "../../library/game/tutorial/defineTutorial";
import { MarketGame } from "./MarketGame";
import { marketTutorials } from "./tutorial";

describe("Petty Market tutorials", () => {
  test("the game lists both locales", () => {
    const list = listTutorials(new MarketGame());
    expect(list.map((t) => `${t.id}:${t.locale}`)).toEqual(["intro:en", "intro:es"]);
  });

  test("the intro can be completed by a player who follows instructions", async () => {
    const result = await runTutorial(new MarketGame(), marketTutorials[0], {
      // Headless runs have no buttons: open the market gallery the way the player is asked to
      ui: (step, ui) => {
        if (step.id === "market-button") ui.gallery({ of: (root) => root.table.market });
      },
      answer: (step, options) => {
        if (step?.id === "buy") return options.findIndex((o) => o.option.key === "market.buy");
        if (step?.id === "play") return options.findIndex((o) => o.option.key === "hand.play");
        return undefined;
      },
    });
    expect(result.error).toBeUndefined();
    expect(result.outcome).toBe("completed");
    expect(result.visited).toEqual(marketTutorials[0].steps.map((s) => s.id));
    // Every pinned draw was used, and each one landed in the step that declared it
    expect(result.rngRemaining).toBe(0);
    expect(result.warnings).toEqual([]);
  }, 30000);

  test("runTutorial holds the engine's Confirm on a step that does not allow it", async () => {
    const spec = marketTutorials[0];
    const strict = {
      ...spec,
      steps: spec.steps.map((s) => (s.id === "confirm-draw" ? { ...s, allow: { key: "market.buy" } } : s)),
    };
    const result = await runTutorial(new MarketGame(), strict, {
      stepTimeoutMs: 2000,
      ui: (step, ui) => {
        if (step.id === "market-button") ui.gallery({ of: (root) => root.table.market });
      },
    });
    expect(result.outcome).toBe("stuck");
    expect(result.stuckOn).toBe("confirm-draw");
  }, 30000);
});
