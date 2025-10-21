import { ChildOutlet, NonEditable } from "../utilities/Annotations";
import { PlayerCanvas } from "../utilities/CanvasStack/PlayerCanvas";
import { Chit } from "./Chit";
import { PlayerInfo } from "./PlayerInfo";
import { PlayerPromptStatus } from "./PlayerPromptStatus";

export class PlayerChit extends Chit {
  /** @internal */
  @NonEditable type = "player";

  public playerId: string = "no id";
  public name: string = "no name";
  public imageUrl?: string;
  public color: string = "#000000";

  /** @internal */
  @NonEditable public matchScoreNumber?: number;

  @ChildOutlet promptStatus = new PlayerPromptStatus();

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

  public constructor(playerInfo?: PlayerInfo) {
    super();

    if (playerInfo) {
      this.playerId = playerInfo.id;
      this.name = playerInfo.name;
      this.id = playerInfo.id;
      this.imageUrl = playerInfo.imageUrl;
    }
  }
}
