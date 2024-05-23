type SplayResults = { x: number; y: number; z: number };
export type SplayOrientation = "center" | "decreasing" | "increasing";

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
): SplayResults[] {
  if (splayOrder[key]) {
    return splayOrder[key];
  }

  const midX = midFromOrientation(columns, columnOrientation);
  const midY = midFromOrientation(rows, rowOrientation);
  const order: SplayResults[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      order.push({ x: column - midX, y: row - midY, z: row * rows + column });
    }
  }

  order.sort((a, b) => {
    const d1 = Math.abs(a.x) + Math.abs(a.y);
    const d2 = Math.abs(b.x) + Math.abs(b.y);
    if (d1 == d2) {
      return a.z - b.z;
    }
    return d1 - d2;
  });
  splayOrder[key] = order;
  return order;
}

export class Splay {
  public rows: number = 1;
  public columns: number = 1;
  public rowOrientation: SplayOrientation = "center";
  public columnOrientation: SplayOrientation = "center";

  public enabled: boolean = false;
  public zSpacingMultiplier: number = 1;
  public spacingMultiplier: number = 1;
  public itemWidth?: number = undefined;
  public itemHeight?: number = undefined;


  /** @internal */
  toString() {
    return `${this.rows} ${this.columns} ${this.rowOrientation} ${this.columnOrientation} ${this.enabled} ${this.zSpacingMultiplier} ${this.spacingMultiplier} ${this.itemWidth} ${this.itemHeight}`;
  }

  private get splayOrder() {
    return getSplayOrder(
      `${this.rows}_${this.columns}_${this.rowOrientation}_${this.columnOrientation}`,
      this.rows,
      this.columns,
      this.rowOrientation,
      this.columnOrientation,
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
      z: sizeZ * this.zSpacingMultiplier * zIndex,
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
