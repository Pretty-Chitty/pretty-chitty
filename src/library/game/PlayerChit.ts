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
  private myImageUrl?: string = undefined;
  get imageUrl() {
    if (!this.myImageUrl) {
      const tempPlayerInfo = new PlayerInfo(this.playerId, this.name);
      return tempPlayerInfo.generateAvatar();
    }
    return this.myImageUrl;
  }
  set imageUrl(value: string | undefined) {
    this.myImageUrl = value;
  }

  /** @internal */
  @NonEditable public matchScoreNumber?: number;

  @ChildOutlet promptStatus = new PlayerPromptStatusChit();

  public get panelTab() {
    return {
      color: this.color,
      icon: new PlayerCanvas(this, this.colorBlend).get(),
    };
  }

  public get icon() {
    return new PlayerCanvas(this, this.colorBlend).get();
  }

  public get colorBlend() {
    return 0;
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
