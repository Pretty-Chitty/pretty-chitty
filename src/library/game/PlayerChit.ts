import { ChildOutlet, NonEditable } from "../utilities/Annotations";
import { PlayerCanvas } from "../utilities/CanvasStack/PlayerCanvas";
import { Chit } from "./Chit";
import { PlayerInfo } from "./PlayerInfo";
import { PlayerPromptStatusChit } from "./PlayerPromptStatusChit";

export class PlayerChit extends Chit {
  /** @internal */
  @NonEditable type = "player";

  public playerId: string = "no id";
  public name: string = "no name";
  public color: string = "#000000";

  /** @internal */
  private _imageUrl?: string = undefined;
  get imageUrl() {
    if (!this._imageUrl) {
      const tempPlayerInfo = new PlayerInfo(this.playerId, this.name);
      return tempPlayerInfo.generateAvatar();
    }
    return this._imageUrl;
  }
  set imageUrl(value: string | undefined) {
    this._imageUrl = value;
  }

  /** @internal */
  @NonEditable public matchScoreNumber?: number;

  @ChildOutlet promptStatus = new PlayerPromptStatusChit();

  public get panelTab() {
    return {
      color: this.color,
      icon: new PlayerCanvas(this).get(),
    };
  }

  public get icon() {
    return new PlayerCanvas(this).get();
  }

  public get logKey() {
    return `:${this.playerId}:`;
  }

  /** @internal */
  setPlayerInfo(playerInfo: PlayerInfo) {
    this.playerId = playerInfo.id;
    this.name = playerInfo.name;
    this.id = playerInfo.id;
    this.imageUrl = playerInfo.imageUrl;
  }
}
