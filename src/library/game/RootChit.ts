import { NonEditable } from "../utilities/Annotations";
import { DropdownChit } from "./DropdownChit";
import { OrderedOutlet } from "./OrderedOutlet";
import { PanelChit } from "./PanelChit";
import { PlayerChit } from "./PlayerChit";

export class RootChit<P extends PlayerChit> extends PanelChit {
  /** @internal */
  @NonEditable type = "root";

  public players = new OrderedOutlet<P>("players", this);

  public getDropdowns(): DropdownChit[] {
    return [];
  }
}
