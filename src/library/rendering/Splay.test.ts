import { describe, expect, it } from "vitest";
import { Splay } from "./Splay";

/** the grid slot (column, row) each child index lands on, in unit item sizes */
function slots(s: Splay): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.rows * s.columns; i++) {
    const r = s.processSplay(i, 1, 1, 1);
    out.push(`${r.x},${r.y}`);
  }
  return out;
}

function grid(rows: number, columns: number, set: Partial<Splay> = {}): Splay {
  const s = new Splay();
  s.enabled = true;
  s.rows = rows;
  s.columns = columns;
  Object.assign(s, set);
  return s;
}

describe("Splay fill", () => {
  it("fills a 4×2 window in reading order from the top left with fill 'rows'", () => {
    const s = grid(2, 4, { fill: "rows", columnOrientation: "increasing", rowOrientation: "decreasing" });
    // y up the table: the top row is y 0, the next y -1
    expect(slots(s)).toEqual(["0,0", "1,0", "2,0", "3,0", "0,-1", "1,-1", "2,-1", "3,-1"]);
  });

  it("fills column by column with fill 'columns'", () => {
    const s = grid(2, 4, { fill: "columns", columnOrientation: "increasing", rowOrientation: "decreasing" });
    expect(slots(s)).toEqual(["0,0", "0,-1", "1,0", "1,-1", "2,0", "2,-1", "3,0", "3,-1"]);
  });

  it("keeps 'nearest' as the default: closest to the anchor first", () => {
    const s = grid(2, 4, { columnOrientation: "increasing", rowOrientation: "decreasing" });
    expect(s.fill).toBe("nearest");
    const order = slots(s);
    expect(order[0]).toBe("0,0");
    // distances never decrease
    const d = order.map((o) => o.split(",").reduce((a, v) => a + Math.abs(Number(v)), 0));
    expect([...d].sort((a, b) => a - b)).toEqual(d);
  });

  it("breaks distance ties in row-major order on a non-square grid", () => {
    // centred 2×4: the four inner slots, then the four outer ones row by row (the old tie-break, row * rows + column,
    // took the outer ones column by column on a grid that is not square)
    const s = grid(2, 4);
    expect(slots(s)).toEqual([
      "-0.5,-0.5", "0.5,-0.5", "-0.5,0.5", "0.5,0.5",
      "-1.5,-0.5", "1.5,-0.5", "-1.5,0.5", "1.5,0.5",
    ]);
  });

  it("piles past the grid: the next child goes back to the first slot, one layer up", () => {
    const s = grid(2, 2, { fill: "rows", columnOrientation: "increasing", rowOrientation: "decreasing" });
    const r = s.processSplay(4, 1, 1, 1);
    expect([r.x, r.y, r.z]).toEqual([0, 0, 1]);
  });
});
