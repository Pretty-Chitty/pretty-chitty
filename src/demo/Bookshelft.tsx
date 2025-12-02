import { Chit, ChitRenderSpec, extrudeSVGToGeometry, Ordered, OrderedOutlet } from "../library";

import { BoxGeometry, Group, Mesh, MeshPhongMaterial, Vector3 } from "three";

const BOX_HEIGHT = 0.365;
const BOX_WIDTH = 0.3;
const SHELF_WIDTH = 0.025;
const BOOK_DEPTH = 0.25;
const geo = new BoxGeometry(BOX_WIDTH + SHELF_WIDTH * 2, BOX_HEIGHT + SHELF_WIDTH * 2, SHELF_WIDTH);
const verticalGeo = new BoxGeometry(SHELF_WIDTH, BOX_HEIGHT + SHELF_WIDTH * 2, BOOK_DEPTH);
const horizontalGeo = new BoxGeometry(BOX_WIDTH + SHELF_WIDTH * 2, SHELF_WIDTH, BOOK_DEPTH);

export class ShelfSpace extends Chit {
  public render(spec: ChitRenderSpec): void {
    const mat = new MeshPhongMaterial({ color: "#4e3020" });
    const group = new Group();

    // back face
    group.add(new Mesh(geo, mat));

    // left face
    const left = new Mesh(verticalGeo, mat);
    left.position.set(-(BOX_WIDTH + SHELF_WIDTH) / 2, 0, BOOK_DEPTH / 2);
    group.add(left);

    // right face
    const right = new Mesh(verticalGeo, mat);
    right.position.set((BOX_WIDTH + SHELF_WIDTH) / 2, 0, BOOK_DEPTH / 2);
    group.add(right);

    // top face
    const top = new Mesh(horizontalGeo, mat);
    top.position.set(0, (BOX_HEIGHT + SHELF_WIDTH) / 2, BOOK_DEPTH / 2);
    group.add(top);

    // bottom face
    const bottom = new Mesh(horizontalGeo, mat);
    bottom.position.set(0, -(BOX_HEIGHT + SHELF_WIDTH) / 2, BOOK_DEPTH / 2);
    group.add(bottom);

    group.position.set(0, 0, -BOOK_DEPTH / 2);

    spec.object = group;

    spec.splay.enabled = true;
    spec.splay.columnOrientation = "increasing";
    spec.splay.columns = 100;
    spec.splay.rows = 1;
  }
}

export class ShelfRow extends Chit {
  public points = 1;

  public isFull() {
    return false;
  }

  @Ordered
  public spaces = new OrderedOutlet<ShelfSpace>();

  public render(spec: ChitRenderSpec): void {
    spec.splay.enabled = true;
    spec.splay.rowOrientation = "increasing";
    spec.splay.columns = 1;
    spec.splay.rows = 3;
    spec.splay.itemHeight = BOX_HEIGHT + SHELF_WIDTH * 2;

    spec.highlight.color = "#ffffff";
    spec.highlight.childrenInheritOutline = true;
  }
}

export class Bookshelf extends Chit {
  @Ordered(new Vector3(-2.65, -0.7, 0))
  public longRows = new OrderedOutlet<ShelfRow>();

  @Ordered(new Vector3(0.9, -0.7, 0))
  public shortRows = new OrderedOutlet<ShelfRow>();

  get rows() {
    return [...this.longRows.copy(), ...this.shortRows.copy()];
  }

  setup() {
    for (let i = 0; i < 3; i++) {
      this.longRows.add(
        new ShelfRow().set((c) => {
          c.points = 2;
          for (let j = 0; j < 9; j++) {
            c.spaces.add(new ShelfSpace());
          }
        }),
      );
      this.shortRows.add(
        new ShelfRow().set((c) => {
          for (let j = 0; j < 6; j++) {
            c.spaces.add(new ShelfSpace());
          }
        }),
      );
    }
  }

  override render(_spec: ChitRenderSpec) {}

  public availableRows(): ShelfRow[] {
    return [...this.longRows.copy(), ...this.shortRows.copy()].filter((row) => !row.isFull());
  }
}
