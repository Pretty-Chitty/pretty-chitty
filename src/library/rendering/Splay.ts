type SplayResults = { x: number; y: number; z: number };
export type SplayOrientation = "center" | "decreasing" | "increasing";
/**
 * The order a splay hands out its slots, measured from the anchor (the slot the orientations put at 0,0).
 * - `"nearest"`: closest to the anchor first (Manhattan distance), so a grid fills in rings: a 4×2 fills diagonally.
 * - `"rows"`: the anchor's row first, working away from the anchor column, then the next row away from the anchor.
 *   With `columnOrientation = "increasing"` and `rowOrientation = "decreasing"` that is reading order from the top
 *   left: a window of identical markers filled the way a person fills it.
 * - `"columns"`: the same, column by column.
 */
export type SplayFill = "nearest" | "rows" | "columns";

function midFromOrientation(max: number, orientation: SplayOrientation) {
  switch (orientation) {
    case "center":
      return (max - 1) / 2;
    case "decreasing":
      return max - 1;
    case "increasing":
      return 0;
  }
}

const splayOrder: { [key: string]: SplayResults[] } = {};

function getSplayOrder(
  key: string,
  rows: number,
  columns: number,
  rowOrientation: SplayOrientation,
  columnOrientation: SplayOrientation,
  fill: SplayFill,
): SplayResults[] {
  if (splayOrder[key]) {
    return splayOrder[key];
  }

  const midX = midFromOrientation(columns, columnOrientation);
  const midY = midFromOrientation(rows, rowOrientation);
  const order: SplayResults[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      order.push({ x: column - midX, y: row - midY, z: row * columns + column });
    }
  }

  // the primary and secondary distance from the anchor for each fill; ties keep row-major order
  const keys = (o: SplayResults): [number, number] => {
    switch (fill) {
      case "rows":
        return [Math.abs(o.y), Math.abs(o.x)];
      case "columns":
        return [Math.abs(o.x), Math.abs(o.y)];
      default:
        return [Math.abs(o.x) + Math.abs(o.y), 0];
    }
  };
  order.sort((a, b) => {
    const [a1, a2] = keys(a);
    const [b1, b2] = keys(b);
    return a1 - b1 || a2 - b2 || a.z - b.z;
  });
  splayOrder[key] = order;
  return order;
}

export class Splay {
  public rows: number = 1;
  public columns: number = 1;
  public rowOrientation: SplayOrientation = "center";
  public columnOrientation: SplayOrientation = "center";
  /** the order slots fill in (see {@link SplayFill}); `"nearest"` by default */
  public fill: SplayFill = "nearest";

  public enabled: boolean = false;
  public zSpacingMultiplier: number = 1;
  public zPerIndexMultiplier: number = 0;
  public spacingMultiplier: number = 1;
  public itemWidth?: number = undefined;
  public itemHeight?: number = undefined;

  toString() {
    return `${this.rows} ${this.columns} ${this.rowOrientation} ${this.columnOrientation} ${this.fill} ${this.enabled} ${this.zSpacingMultiplier} ${this.spacingMultiplier} ${this.itemWidth} ${this.itemHeight}`;
  }

  private get splayOrder() {
    return getSplayOrder(
      `${this.rows}_${this.columns}_${this.rowOrientation}_${this.columnOrientation}_${this.fill}`,
      this.rows,
      this.columns,
      this.rowOrientation,
      this.columnOrientation,
      this.fill,
    );
  }

  processSplay(childIndex: number, sizeX: number, sizeY: number, sizeZ: number): SplayResults {
    const order = this.splayOrder;
    const zIndex = Math.floor(childIndex / order.length);
    const orderIndex = childIndex % order.length;
    const orderItem = order[orderIndex];
    return {
      x: (this.itemWidth ?? sizeX) * this.spacingMultiplier * orderItem.x,
      y: (this.itemHeight ?? sizeY) * this.spacingMultiplier * orderItem.y,
      z: sizeZ * this.zSpacingMultiplier * zIndex + this.zPerIndexMultiplier * childIndex,
    };
  }

  /** @internal */
  splayEndPosition(
    itemWidth: number,
    itemHeight: number,
    position: "top" | "left" | "right" | "bottom" = "bottom",
  ): { x: number; y: number } {
    const counter = this.rows * this.columns;

    let x = 0,
      y = 0;
    for (let i = 0; i < counter; i++) {
      const splayResult = this.processSplay(i, itemWidth, itemHeight, 1);
      switch (position) {
        case "top":
          y = Math.max(splayResult.y + itemHeight / 2, y);
          break;
        case "bottom":
          y = Math.min(splayResult.y - itemHeight / 2, y);
          break;
        case "left":
          x = Math.min(splayResult.x - itemWidth / 2, x);
          break;
        case "right":
          x = Math.max(splayResult.x + itemWidth / 2, x);
          break;
      }
    }

    return { x, y };
  }
}
