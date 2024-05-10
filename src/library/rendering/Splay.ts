type SplayResults = { x: number; y: number; z: number };

const splayOrder: { [key: string]: SplayResults[] } = {};
function getSplayOrder(key: string, rows: number, columns: number): SplayResults[] {
  if (splayOrder[key]) {
    return splayOrder[key];
  }
  const midX = (columns - 1) / 2;
  const midY = (rows - 1) / 2;
  const order: SplayResults[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      order.push({ x: column, y: row, z: row * rows + column });
    }
  }

  order.sort((a, b) => {
    const d1 = Math.abs(a.x - midX) + Math.abs(a.y - midY);
    const d2 = Math.abs(b.x - midX) + Math.abs(b.y - midY);
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
  public angle: number = 0;
  public enabled: boolean = false;
  public spacingMultiplier: number = 1;

  processSplay(childIndex: number, sizeX: number, sizeY: number, sizeZ: number): SplayResults {
    const order = getSplayOrder(`${this.rows}_${this.columns}`, this.rows, this.columns);
    const zIndex = Math.floor(childIndex / order.length);
    const orderIndex = childIndex % order.length;
    const orderItem = order[orderIndex];
    return {
      x: sizeX * this.spacingMultiplier * orderItem.x,
      y: sizeY * this.spacingMultiplier * orderItem.y,
      z: sizeZ * this.spacingMultiplier * zIndex,
    };
  }
}
