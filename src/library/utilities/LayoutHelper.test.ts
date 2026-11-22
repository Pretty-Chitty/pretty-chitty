import { describe, expect, it } from "vitest";
import { Chit } from "../game/Chit";
import { ContainerNode, LayoutNode, PANEL_TAB_WIDTH, PanelNode, createLayoutFromTree } from "./LayoutHelper";

function panel(id: string, minWidth: number, minHeight: number): PanelNode {
  return { chit: { id } as Chit, minWidth, minHeight };
}

/** Seven small panels that collapse into one tabbed stack, beside a board */
function stackBesideBoard(direction: ContainerNode["direction"]): LayoutNode {
  const stack: ContainerNode = {
    direction: "vertical",
    collapseOrder: 1,
    splits: Array.from({ length: 7 }, (_, i) => panel(`p${i}`, 100, 150)),
  };
  return { direction, splits: [stack, panel("board", 200, 200)] };
}

function stackOf(results: ReturnType<typeof createLayoutFromTree>) {
  return results.find((r) => Array.isArray(r.chit))!;
}

const SEVEN_TABS = 7 * PANEL_TAB_WIDTH;

describe("createLayoutFromTree tab room", () => {
  it("lays a stack out where its tabs fit, rather than in a narrow column", () => {
    const results = createLayoutFromTree(stackBesideBoard("optimize"), 390, 700);
    const stack = stackOf(results);
    expect((stack.chit as Chit[]).length).toBe(7);
    // Beside the board it would get ~130 wide; stacked above it, it gets the full width
    expect(stack.w).toBeGreaterThanOrEqual(SEVEN_TABS);
  });

  it("gives a stack its share of a fixed row by its tabs' width", () => {
    const results = createLayoutFromTree(stackBesideBoard("horizontal"), 1000, 700);
    expect(stackOf(results).w).toBeGreaterThanOrEqual(SEVEN_TABS);
  });

  it("counts tabs at screen size when the layout is worked out larger than the screen", () => {
    // A layout twice the screen's size, so tabs take twice the units. At one unit per pixel the
    // stack would fit beside the board (300 + 200 < 780) and get only ~470 units, too few for its tabs
    const results = createLayoutFromTree(stackBesideBoard("optimize"), 780, 1000, { unitsPerPixel: 2 });
    expect(stackOf(results).w).toBeGreaterThanOrEqual(SEVEN_TABS * 2);
  });

  it("still lays out when the tabs cannot fit even across the whole width", () => {
    const results = createLayoutFromTree(stackBesideBoard("optimize"), 200, 600);
    expect(results.length).toBe(2);
    expect(stackOf(results).w).toBeLessThanOrEqual(200);
  });

  it("leaves layouts without stacks alone", () => {
    const tree: LayoutNode = { direction: "horizontal", splits: [panel("a", 100, 100), panel("b", 300, 100)] };
    const results = createLayoutFromTree(tree, 400, 100);
    expect(results.map((r) => r.w)).toEqual([100, 300]);
  });
});
