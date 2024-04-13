import { Chit } from "./Chit";
import { IButtonLibrary } from "./Game";
import { Confirm, GameButton } from "./GameButton";
import { PickPrompt } from "./Prompt";
import { MismatchError, Turn } from "./Turn";

export type FindChit = (id: string) => Chit;
export type PickType = "ChitPick" | "ButtonPick";
export type PickSerialization = {
  type: PickType;
  message?: string;
  help?: string;
  details: any;
};

export abstract class Pick {
  /** @internal */
  public messageContents?: string;
  /** @internal */
  public helpContents?: string;
  /** @internal */
  abstract get type(): PickType;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  /** @internal */
  confirmLock(turn: Turn<any, any, any>) {
    // do nothing
  }

  /** @internal */
  abstract serializeDetails(): any;
  /** @internal */
  abstract deserializeDetails(state: any, findChit: FindChit, buttonLibrary: IButtonLibrary): void;
  /** @internal */
  abstract resolveDetails(details: any): Promise<void>;
  /** @internal */
  abstract stageIn(prompt: PickPrompt): void;
  /** @internal */
  abstract stageOut(): void;
  /** @internal */
  abstract autoResolve(): Promise<void | undefined>;
  /** @internal */
  abstract numberOfChoices(): number;

  /** @internal */
  canAutoResolve() {
    return this.numberOfChoices() === 1;
  }

  message(message?: string) {
    this.messageContents = message;
    return this;
  }

  help(help?: string) {
    this.helpContents = help;
    return this;
  }

  /** @internal */
  serialize(): PickSerialization {
    return {
      type: this.type,
      help: this.helpContents,
      message: this.messageContents,
      details: this.serializeDetails(),
    };
  }

  /** @internal */
  public static deserialize(pick: PickSerialization, findChit: FindChit, buttonLibrary: IButtonLibrary): Pick {
    let p: Pick | undefined = undefined;
    switch (pick.type) {
      case "ChitPick": {
        p = new ChitPick();
        break;
      }
      case "ButtonPick": {
        p = new ButtonPick();
        break;
      }
    }

    if (p) {
      p.messageContents = pick.message;
      p.helpContents = pick.help;
      p.deserializeDetails(pick.details, findChit, buttonLibrary);
      return p;
    }

    throw new Error(`Pick type ${pick.type} not known`);
  }
}

export class ChitPick<T extends Chit> extends Pick {
  /** @internal */
  type: PickType = "ChitPick";

  /** @internal */
  public chits: T[] = [];

  /** @internal */
  public cb: (chit: T) => void | Promise<void> = () => {};

  /** @internal */
  serializeDetails() {
    return this.chits.map((chit) => chit.id);
  }

  /** @internal */
  deserializeDetails(chitIds: string[], findChit: FindChit): void {
    this.chits = chitIds.map((chitId) => findChit(chitId) as T).filter((d) => d);
  }

  /** @internal */
  resolveDetails(chitId: string) {
    const selectedChit = this.chits.find((chit) => chit.id === chitId);
    if (!selectedChit) {
      throw new MismatchError();
    }
    return Promise.resolve(this.cb(selectedChit));
  }

  /** @internal */
  stageIn(prompt: PickPrompt) {
    this.chits.forEach((c) => (c.onClick = () => prompt.resolvePick(this, c.id)));
  }

  /** @internal */
  stageOut() {
    this.chits.forEach((c) => (c.onClick = undefined));
  }

  /** @internal */
  override confirmLock(turn: Turn<any, any, any>) {
    this.chits.forEach((chit) => chit.confirmLock(turn));
  }

  /** @internal */
  numberOfChoices() {
    return this.chits.length;
  }

  /** @internal */
  autoResolve() {
    return Promise.resolve(this.cb(this.chits[0]));
  }
}

export class ButtonPick extends Pick {
  /** @internal */
  type: PickType = "ButtonPick";

  public button?: GameButton;

  /** @internal */
  numberOfChoices() {
    return 1;
  }

  /** @internal */
  autoResolve() {
    return Promise.resolve(this.button && this.button.cb && this.button.cb());
  }

  /** @internal */
  canAutoResolve() {
    return this.button?.canAutoResolve ?? true;
  }

  /** @internal */
  serializeDetails() {
    if (!this.button) {
      throw new Error("Cannot resolve without a button defined");
    }

    const details = this.button.serialize();
    details.__buttonType = Object.getPrototypeOf(this.button).constructor.name;
    return details;
  }

  /** @internal */
  deserializeDetails(state: any, findChit: FindChit, buttonLibrary: IButtonLibrary) {
    const HARDCODED_BUTTON_LIBRARY: { [id: string]: new () => GameButton } = { Confirm };
    const buttonType = state.__buttonType;
    const ButtonType = buttonLibrary[buttonType] ?? HARDCODED_BUTTON_LIBRARY[buttonType];
    if (!ButtonType) {
      throw new Error(`Cannot find button type ${buttonType}`);
    }
    this.button = new ButtonType();
    this.button.deserialize(state);
  }

  /** @internal */
  resolveDetails() {
    if (!this.button) {
      throw new Error("Cannot resolve without a button defined");
    }
    return Promise.resolve(this.button && this.button.cb && this.button.cb());
  }

  /** @internal */
  stageIn(prompt: PickPrompt) {
    if (this.button) {
      this.button.cb = () => {
        if (this.button) {
          this.button.cb = () => {};
        }
        prompt.resolvePick(this, null);
      };
    }
  }

  /** @internal */
  stageOut() {}
}
