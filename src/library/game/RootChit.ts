import { NonEditable, getSelectableProperties, SelectablePropertyInfo } from "../utilities/Annotations";
import { Chit } from "./Chit";
import { DropdownChit } from "./DropdownChit";
import { OrderedOutlet } from "./OrderedOutlet";
import { PlayerChit } from "./PlayerChit";
import { Turn } from "./Turn";
import { LayoutNode, createLayoutFromTree, PanelLayoutResult } from "../utilities/LayoutHelper";
export type { PanelLayoutResult } from "../utilities/LayoutHelper";

export class RootChit<P extends PlayerChit> extends Chit {
  minPlayers = 2;
  maxPlayers = 4;

  /** @internal */
  @NonEditable type = "root";

  /** @internal */
  @NonEditable public _setupTurn: Turn<any, P, any> | undefined;

  public override get currentTurn(): Turn<any, P, any> {
    if (this.lockedBy) {
      return this.lockedBy;
    }
    if (!this._setupTurn) {
      throw "No current turn";
    }
    return this._setupTurn;
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

  /** Sets up a demo game.  Returns the player count to use in the demo game.  */
  public setupDemoGame(): number {
    return this.minPlayers;
  }

  /**
   * Gets all properties on this RootChit instance that are marked with the @Selectable decorator.
   *
   * @returns An array of SelectablePropertyInfo containing the field name, label, choices, and current value
   */
  /** @internal */
  public getConfigurationOptions(): SelectablePropertyInfo[] {
    return getSelectableProperties(this);
  }

  /** @internal */
  public getCurrentlySelectedMatchOptions(): any {
    const result = {};
    const selectables = this.getConfigurationOptions();
    for (const selectable of selectables) {
      if ((this as any)[selectable.fieldName] !== undefined) {
        (result as any)[selectable.fieldName] = (this as any)[selectable.fieldName];
      }
    }
    return result;
  }

  /** @internal */
  public processMatchOptions(options: any): void {
    const selectables = this.getConfigurationOptions();
    for (const selectable of selectables) {
      if (options[selectable.fieldName] !== undefined) {
        (this as any)[selectable.fieldName] = options[selectable.fieldName];
      }
    }
  }
}
