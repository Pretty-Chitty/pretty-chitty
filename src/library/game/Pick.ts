import { Chit } from "./Chit";
import { GalleryItemChitChildrenSource } from "./GalleryItemChitChildrenSource";
import { IButtonLibrary } from "./Game";
import { Confirm, DynamicGameButton, GameButton, ToggleGalleryButton } from "./GameButton";
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

  /** @internal */
  public focusChits: Chit[] = [];

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

  message(message?: string): this {
    this.messageContents = message;
    return this;
  }

  help(help?: string): this {
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

  focus(chit: Chit | Chit[]): this {
    if (Array.isArray(chit)) {
      this.focusChits.push(...chit);
    } else {
      this.focusChits.push(chit);
    }
    return this;
  }

  /** @internal */
  closeGallery?: () => void;

  /** @internal */
  processFocus() {
    // show it?
    this.focusChits.forEach((c) => {
      if (c.renderInstance) {
        c.renderInstance.rootRenderInstance.markHasChitsEntering();
        if (c.renderInstance.absorbsClickEventsForChildren) {
          this.closeGallery = c.renderInstance.rootRenderInstance.showGallery(new GalleryItemChitChildrenSource(c));
        }
      }
    });
  }
}

export class ChitPick<T extends Chit> extends Pick {
  /** @internal */
  type: PickType = "ChitPick";

  /** @internal */
  public chits: T[] = [];

  /** @internal */
  public cb: (chit: T) => void | Promise<void> = () => {};

  public button?: ToggleGalleryButton;

  /** @internal */
  serializeDetails() {
    const result: any = {
      c: this.chits.map((chit) => chit.id),
      f: this.focusChits.map((chit) => chit.id),
    };

    if (this.button) {
      result.b = this.button.serialize();
      result.b.__buttonType = Object.getPrototypeOf(this.button).constructor.name;
    }

    return result;
  }

  /** @internal */
  deserializeDetails(
    { c, f, b }: { c: string[]; f: string[]; b?: any },
    findChit: FindChit,
    buttonLibrary: IButtonLibrary,
  ): void {
    this.chits = c.map((chitId) => findChit(chitId) as T).filter((d) => d);
    this.focusChits = f.map((chitId) => findChit(chitId)).filter((d) => d);

    if (b) {
      const HARDCODED_BUTTON_LIBRARY: { [id: string]: new () => GameButton } = { Confirm };
      const buttonType = b.__buttonType;
      const ButtonType = buttonLibrary[buttonType] ?? HARDCODED_BUTTON_LIBRARY[buttonType];
      if (!ButtonType) {
        throw new Error(`Cannot find button type ${buttonType}`);
      }
      this.button = new ButtonType() as ToggleGalleryButton;
      this.button.deserialize(b, findChit);
    }
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
    this.processFocus();
    this.button?.computeItemSource(this);
    if (this.button?.autoShow && this.button?.galleryItemSource) {
      this.closeGallery = this.chits[0]?.renderInstance?.rootRenderInstance.showGallery(this.button.galleryItemSource);
    }
  }

  /** @internal */
  stageOut() {
    this.chits.forEach((c) => (c.onClick = undefined));
    if (this.closeGallery) {
      this.closeGallery();
    }
    if (this.button instanceof ToggleGalleryButton && this.button?.galleryItemSource) {
      this.chits[0]?.renderInstance?.rootRenderInstance.hideGallery(this.button.galleryItemSource);
    }
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

  toggleButton(button: ToggleGalleryButton): this {
    this.button = button;
    return this;
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
    details.__f = this.focusChits.map((chit) => chit.id);
    return details;
  }

  /** @internal */
  deserializeDetails(state: any, findChit: FindChit, buttonLibrary: IButtonLibrary) {
    const HARDCODED_BUTTON_LIBRARY: { [id: string]: new () => GameButton } = { Confirm };
    const buttonType = state.__buttonType;
    this.focusChits = state.__f.map((chitId: string) => findChit(chitId)).filter((d: Chit) => d);
    const ButtonType = buttonLibrary[buttonType] ?? HARDCODED_BUTTON_LIBRARY[buttonType];
    if (!ButtonType) {
      throw new Error(`Cannot find button type ${buttonType}`);
    }
    this.button = new ButtonType();
    this.button.deserialize(state, findChit);
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
    this.processFocus();
  }

  /** @internal */
  stageOut() {}
}
