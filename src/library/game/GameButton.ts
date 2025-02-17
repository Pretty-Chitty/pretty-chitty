import { Check, Flip } from "@mui/icons-material";
import { BottomBarButtonIcon } from "../components/BottomBarButton";
import { ButtonPick } from "./Pick";
import { NonEditable } from "../utilities/Annotations";

export type ButtonCallback = () => void | Promise<void>;

export class GameButton {
  /** @internal */
  @NonEditable type = "button";

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

  public pick(): ButtonPick {
    return GameButton.pick(this);
  }

  public set(cb: (chit: this) => void): this {
    cb(this);
    return this;
  }

  /** @internal */
  serialize(): any {
    return {};
  }

  /** @internal */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  deserialize(config: any) {}
}

export abstract class DynamicGameButton<T> extends GameButton {
  private spec: T | undefined;

  config(spec: T) {
    this.spec = spec;
    this.process(spec);
    return this;
  }

  abstract process(spec: T): void;

  /** @internal */
  override serialize(): any {
    if (this.spec === undefined) {
      throw "Not configured";
    }

    return {
      spec: this.spec,
    };
  }

  /** @internal */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override deserialize({ spec }: { spec: T }) {
    this.spec = spec;
    this.process(this.spec);
  }
}

export class Confirm extends GameButton {
  label = "Confirm";
  icon = Check;
  canAutoResolve = false;
}
