import { expect, test } from "vitest";

import { simulateMatches } from "../library";
import { DemoGame } from "./DemoGame";

test("demo bots finish the demo game without getting stuck", async () => {
  const report = await simulateMatches(new DemoGame(), { games: 3 });
  expect(report.finished).toBe(3);
  expect(report.stuck).toBe(0);
  expect(report.stalls).toBe(0);
  expect(report.ruleErrors).toBe(0);
  expect(report.untagged).toEqual({});
}, 60000);
