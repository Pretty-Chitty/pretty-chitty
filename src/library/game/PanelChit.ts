import { NonEditable } from "../utilities/Annotations";
import { Chit } from "./Chit";
import { LayoutNode, createLayoutFromTree, PanelLayoutResult } from "../utilities/LayoutHelper";

export type { PanelLayoutResult } from "../utilities/LayoutHelper";

export class PanelChit extends Chit {
  /** @internal */
  @NonEditable type = "panel";

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getLayout(width: number, height: number, playerId: string): LayoutNode {
    return {
      panel: this,
      minWidth: 0,
      minHeight: 0,
    };
  }

  getFlatLayout(width: number, height: number, scale = 1, playerId: string): PanelLayoutResult[] {
    if (width < 1 || height < 1) {
      return [];
    }
    const layoutTree = this.getLayout(width * scale, height * scale, playerId);
    return createLayoutFromTree(layoutTree, width * scale, height * scale).map((item) => {
      item.h = item.h / scale;
      item.w = item.w / scale;
      item.x = item.x / scale;
      item.y = item.y / scale;
      return item;
    });
  }
}
