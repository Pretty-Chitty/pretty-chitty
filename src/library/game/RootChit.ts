import { NonEditable } from "../utilities/Annotations";
import { DropdownChit } from "./DropdownChit";
import { OrderedOutlet } from "./OrderedOutlet";
import { PanelChit } from "./PanelChit";
import { PlayerChit } from "./PlayerChit";
import { Turn } from "./Turn";

export class RootChit<P extends PlayerChit> extends PanelChit {
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

  public players = new OrderedOutlet<P>("players", this);

  async shufflePlayers() {
    const playerRngs = await this.currentTurn.takeRng(this.players.length);
    for (let i = 0; i < this.players.length; i++) {
      const player = this.players.get(Math.floor(playerRngs() * this.players.length));
      this.players.remove(player);
      this.players.add(player);
    }
  }

  public getDropdowns(): DropdownChit[] {
    return [];
  }
}
