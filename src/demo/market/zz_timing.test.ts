import { test } from "vitest";
import { runTutorial } from "../../library/game/tutorial/runTutorial";
import { MarketGame } from "./MarketGame";
import { marketTutorials } from "./tutorial";

test("timing", async () => {
  for (const until of ["market", "buy", "robin", "end-turn", "end-turn"]) {
    const t = performance.now();
    const r = await runTutorial(new MarketGame(), marketTutorials[0], { until, stepTimeoutMs: 5000 });
    console.log(until, Math.round(performance.now() - t), "ms", r.stuckOn ?? "", r.visited.length);
  }
}, 60000);
