import { NonEditable } from "../utilities/Annotations";
import { Chit } from "./Chit";
import { PlayerInfo } from "./PlayerInfo";
import { PlayerPromptStatus } from "./PlayerPromptStatus";

export class PlayerChit extends Chit {
  /** @internal */
  _type = "player";

  public color: string = "#ffffff";
  public playerId: string = "no id";
  public name: string = "no name";
  public imageUrl?: string;

  public promptStatus = new PlayerPromptStatus();

  public constructor(playerInfo?: PlayerInfo) {
    super();

    if (playerInfo) {
      this.playerId = playerInfo.id;
      this.name = playerInfo.name;
      this._id = playerInfo.id;
      this.imageUrl = playerInfo.imageUrl;
    }
  }
}
