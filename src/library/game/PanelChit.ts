import { NonEditable } from "../utilities/Annotations";
import { Chit } from "./Chit";

export type PanelLayoutCell = {
  width: number;
  contents: PanelLayout;
};

export type PanelLayoutRow = {
  height: number;
  contents: Chit | Chit[] | PanelLayoutCell[];
};

export type PanelLayout = Chit | Chit[] | PanelLayoutCell[] | PanelLayoutRow[];

export type PanelLayoutResult = {
  w: number;
  h: number;
  x: number;
  y: number;
  id?: string;
  chit: Chit | Chit[];
};

export class PanelChit extends Chit {
  /** @internal */
  _type = "panel";

  getLayout(_width: number, _height: number): PanelLayout {
    return [
      {
        height: 1,
        contents: this,
      },
    ];
  }

  getFlatLayout(width: number, height: number): PanelLayoutResult[] {
    const layout = this.getLayout(width, height);

    const flatten = (
      layout: PanelLayout,
      x: number,
      y: number,
      w: number,
      h: number
    ): PanelLayoutResult[] => {
      if (
        layout instanceof Chit ||
        (Array.isArray(layout) && layout[0] instanceof Chit)
      ) {
        const layoutArray = layout as Chit[];
        return [
          {
            x,
            y,
            w,
            h,
            id:
              Array.isArray(layout) && layoutArray.length > 0
                ? layoutArray[0]._id
                : (layout as Chit)._id,
            chit: Array.isArray(layout) ? layoutArray : layout,
          },
        ];
      }
      if (Array.isArray(layout)) {
        if ((layout[0] as PanelLayoutCell).width !== undefined) {
          const cells = layout as PanelLayoutCell[];

          if (cells.length === 1 && cells[0].contents instanceof Chit) {
            return flatten(cells[0].contents, x, y, w, h);
          }

          const totalWidth = cells.reduce((total, col) => total + col.width, 0);
          return cells
            .map((c) => {
              const newW = (w / totalWidth) * c.width;
              const result = flatten(c.contents, x, y, newW, h);
              x += newW;
              return result;
            })
            .flat();
        } else if ((layout[0] as PanelLayoutRow).height !== undefined) {
          const rows = layout as PanelLayoutRow[];
          const totalHeight = rows.reduce(
            (total, row) => total + row.height,
            0
          );

          if (rows.length === 1 && rows[0].contents instanceof Chit) {
            return flatten(rows[0].contents, x, y, w, h);
          }

          return rows
            .map((c) => {
              const newH = (h / totalHeight) * c.height;
              const result = flatten(c.contents, x, y, w, newH);
              y += newH;
              return result;
            })
            .flat();
        }
      }
      return [];
    };

    return flatten(layout, 0, 0, width, height);
  }
}
