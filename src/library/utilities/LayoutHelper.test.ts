import { describe, expect, it } from "vitest";
import { Chit } from "../game/Chit";
import { ContainerNode, LayoutNode, PanelNode, createLayoutFromTree } from "./LayoutHelper";

function panel(id: string, minWidth: number, minHeight: number): PanelNode {
  return { chit: { id } as Chit, minWidth, minHeight };
}

function stackOf(results: ReturnType<typeof createLayoutFromTree>) {
  return results.find((r) => Array.isArray(r.chit))!;
}

function boardOf(results: ReturnType<typeof createLayoutFromTree>) {
  return results.find((r) => !Array.isArray(r.chit))!;
}

// Tabs shrink to fit their stack (PanelTabStack); they never take width from the layout
describe("createLayoutFromTree ignores tabs", () => {
  it("shares a row by the stack's declared width, however many tabs it has", () => {
    const stack = (count: number): LayoutNode => ({
      panels: Array.from({ length: count }, (_, i) => panel(`p${i}`, 200, 200)),
      minWidth: 240,
      minHeight: 200,
    });
    for (const count of [2, 5, 12]) {
      const tree: LayoutNode = { direction: "horizontal", splits: [stack(count), panel("board", 360, 200)] };
      const results = createLayoutFromTree(tree, 2600, 3000);
      expect(stackOf(results).w).toBeCloseTo(1040);
      expect(boardOf(results).w).toBeCloseTo(1560);
    }
  });

  it("gives a stack the engine collapsed the width of its widest panel", () => {
    const stack: ContainerNode = {
      direction: "vertical",
      collapseOrder: 1,
      splits: Array.from({ length: 7 }, (_, i) => panel(`p${i}`, 100, 150)),
    };
    const tree: LayoutNode = { direction: "horizontal", splits: [stack, panel("board", 200, 200)] };
    const results = createLayoutFromTree(tree, 900, 700);
    expect((stackOf(results).chit as Chit[]).length).toBe(7);
    expect(stackOf(results).w).toBeCloseTo(300);
    expect(boardOf(results).w).toBeCloseTo(600);
  });

  it("leaves layouts without stacks alone", () => {
    const tree: LayoutNode = { direction: "horizontal", splits: [panel("a", 100, 100), panel("b", 300, 100)] };
    const results = createLayoutFromTree(tree, 400, 100);
    expect(results.map((r) => r.w)).toEqual([100, 300]);
  });
});
