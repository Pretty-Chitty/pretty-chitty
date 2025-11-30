import { NonEditable } from "../utilities/Annotations";
import { Chit } from "./Chit";
import { DropdownChit } from "./DropdownChit";
import { OrderedOutlet } from "./OrderedOutlet";
import { PlayerChit } from "./PlayerChit";
import { Turn } from "./Turn";
import { LayoutNode, createLayoutFromTree, PanelLayoutResult } from "../utilities/LayoutHelper";
export type { PanelLayoutResult } from "../utilities/LayoutHelper";

export class RootChit<P extends PlayerChit> extends Chit {
  @NonEditable $internal_type = "root";

  @NonEditable public $internal__setupTurn: Turn<any, P, any> | undefined;

  public override get currentTurn(): Turn<any, P, any> {
    if (this.$internal_lockedBy) {
      return this.$internal_lockedBy;
    }
    if (!this.$internal__setupTurn) {
      throw "No current turn";
    }
    return this.$internal__setupTurn;
  }

  getLayout(_width: number, _height: number, _playerId: string): LayoutNode {
    return {
      chit: this,
      minWidth: 0,
      minHeight: 0,
    };
  }

  getFlatLayout(width: number, height: number, scaleX = 1, scaleY = 1, playerId: string): PanelLayoutResult[] {
    if (width < 1 || height < 1) {
      return [];
    }
    const layoutTree = this.getLayout(width * scaleX, height * scaleY, playerId);
    return createLayoutFromTree(layoutTree, width * scaleX, height * scaleY).map((item) => {
      item.h = item.h / scaleY;
      item.w = item.w / scaleX;
      item.x = item.x / scaleX;
      item.y = item.y / scaleY;
      return item;
    });
  }

  public players = new OrderedOutlet<P>("players", this);

  public getDropdowns(): DropdownChit[] {
    return [];
  }
}
