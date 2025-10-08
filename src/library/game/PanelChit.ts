import { NonEditable } from "../utilities/Annotations";
import { Chit } from "./Chit";

export type PanelLayoutCol = {
  width: number;
  contents: PanelLayout[];
};

export type PanelLayoutRow = {
  height: number;
  contents: PanelLayout[];
};

export type PanelLayout = Chit | Chit[] | PanelLayoutCol | PanelLayoutRow;

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
  @NonEditable type = "panel";

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getLayout(width: number, height: number, playerId: string): PanelLayout {
    return this;
  }

  getFlatLayout(width: number, height: number, scale = 1, playerId: string): PanelLayoutResult[] {
    const layout = this.getLayout(width * scale, height * scale, playerId);

    const flatten = (layout: PanelLayout, x: number, y: number, w: number, h: number): PanelLayoutResult[] => {
      // Handle Chit or Chit[] (leaf nodes)
      if (layout instanceof Chit || (Array.isArray(layout) && layout[0] instanceof Chit)) {
        const layoutArray = layout as Chit[];
        return [
          {
            x,
            y,
            w,
            h,
            id: Array.isArray(layout) && layoutArray.length > 0 ? layoutArray[0].id : (layout as Chit).id,
            chit: Array.isArray(layout) ? layoutArray : layout,
          },
        ];
      }

      // Handle PanelLayoutCol (horizontal split)
      if ("width" in layout) {
        const col = layout as PanelLayoutCol;
        const totalWidth = col.width;
        let currentX = x;

        return col.contents
          .map((content) => {
            // Get width from the content if it's a col, otherwise distribute evenly
            const contentWidth =
              "width" in content ? (content as PanelLayoutCol).width : totalWidth / col.contents.length;
            const newW = (w / totalWidth) * contentWidth;
            const result = flatten(content, currentX, y, newW, h);
            currentX += newW;
            return result;
          })
          .flat();
      }

      // Handle PanelLayoutRow (vertical split)
      if ("height" in layout) {
        const row = layout as PanelLayoutRow;
        const totalHeight = row.height;
        let currentY = y;

        return row.contents
          .map((content) => {
            // Get height from the content if it's a row, otherwise distribute evenly
            const contentHeight =
              "height" in content ? (content as PanelLayoutRow).height : totalHeight / row.contents.length;
            const newH = (h / totalHeight) * contentHeight;
            const result = flatten(content, x, currentY, w, newH);
            currentY += newH;
            return result;
          })
          .flat();
      }

      return [];
    };

    return flatten(layout, 0, 0, width, height);
  }
}
