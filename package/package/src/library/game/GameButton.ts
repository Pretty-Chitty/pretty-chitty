import { Check, Flip } from "@mui/icons-material";

import { BottomBarButtonIcon } from "../components/BottomBarButton";
import { ButtonPick } from "./Pick";
import { NonEditable } from "../utilities/Annotations";

export type ButtonCallback = () => void | Promise<void>;

export class GameButton {
  /** @internal */
  type = "button";

  public icon: BottomBarButtonIcon = Flip;
  public label: string = "Flip Me";
  public message: string | undefined;

  /** @internal */
  public canAutoResolve = true;

  constructor(public cb?: ButtonCallback) {}

  static pick(button: GameButton): ButtonPick {
    const result = new ButtonPick();
    result.messageContents = button.message;
    result.button = button;
    return result;
  }

  /** @internal */
  serialize(): any {
    return {};
  }

  /** @internal */

  deserialize(_config: any) {}
}

export class Confirm extends GameButton {
  label = "Confirm";
  icon = Check;
  canAutoResolve = false;
}
