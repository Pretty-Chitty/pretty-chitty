import { Chit } from "./Chit";
import { GalleryItemChitChildrenSource } from "./GalleryItemChitChildrenSource";
import { IButtonLibrary } from "./Game";
import { Confirm, GameButton, ToggleGalleryButton } from "./GameButton";
import { PickPrompt } from "./Prompt";
import { MismatchError, Turn } from "./Turn";

export type FindChit = (id: string) => Chit;
export type PickType = "ChitPick" | "ButtonPick";
export type PickSerialization = {
  type: PickType;
  message?: string;
  help?: string;
  details: any;
  context?: string;
};

export abstract class Pick {
  public $internal_messageContents?: string;
  public $internal_helpContents?: string;
  abstract get $internal_type(): PickType;

  public $internal_focusChits: Chit[] = [];

  public $internal_contextChit?: Chit;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  $internal_confirmLock(_turn: Turn<any, any, any>) {
    // do nothing
  }

  abstract $internal_serializeDetails(): any;
  abstract $internal_deserializeDetails(state: any, findChit: FindChit, buttonLibrary: IButtonLibrary): void;
  abstract $internal_resolveDetails(details: any): Promise<void>;
  abstract $internal_stageIn(prompt: PickPrompt): void;
  abstract $internal_stageOut(): void;
  abstract $internal_autoResolve(): Promise<void | undefined>;
  abstract $internal_numberOfChoices(): number;

  $internal_canAutoResolve() {
    return this.$internal_numberOfChoices() === 1;
  }

  message(message?: string): this {
    this.$internal_messageContents = message;
    return this;
  }

  help(help?: string): this {
    this.$internal_helpContents = help;
    return this;
  }

  $internal_serialize(): PickSerialization {
    return {
      type: this.$internal_type,
      help: this.$internal_helpContents,
      message: this.$internal_messageContents,
      details: this.$internal_serializeDetails(),
      context: this.$internal_contextChit ? this.$internal_contextChit.id : undefined,
    };
  }

  public static $internal_deserialize(pick: PickSerialization, findChit: FindChit, buttonLibrary: IButtonLibrary): Pick {
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
      p.$internal_contextChit = pick.context ? findChit(pick.context) : undefined;
      p.$internal_messageContents = pick.message;
      p.$internal_helpContents = pick.help;
      p.$internal_deserializeDetails(pick.details, findChit, buttonLibrary);
      return p;
    }

    throw new Error(`Pick type ${pick.type} not known`);
  }

  focus(chit: Chit | Chit[]): this {
    if (Array.isArray(chit)) {
      this.$internal_focusChits.push(...chit);
    } else {
      this.$internal_focusChits.push(chit);
    }
    return this;
  }

  context(chit: Chit | undefined): this {
    this.$internal_contextChit = chit;
    return this;
  }

  $internal_closeGallery?: () => void;

  $internal_processFocus() {
    // show it?
    this.$internal_focusChits.forEach((c) => {
      if (c.$internal_renderInstance) {
        c.$internal_renderInstance.rootRenderInstance.markHasChitsEntering();
        if (c.$internal_renderInstance.absorbsClickEventsForChildren) {
          this.$internal_closeGallery = c.$internal_renderInstance.rootRenderInstance.showGallery(new GalleryItemChitChildrenSource(c));
        }
      }
    });
  }
}

export class ChitPick<T extends Chit> extends Pick {
  $internal_type: PickType = "ChitPick";

  public $internal_chits: T[] = [];

  public $internal_cb: (chit: T) => void | Promise<void> = () => {};

  public button?: ToggleGalleryButton;

  $internal_serializeDetails() {
    const result: any = {
      c: this.$internal_chits.map((chit) => chit.id),
      f: this.$internal_focusChits.map((chit) => chit.id),
    };

    if (this.button) {
      result.b = this.button.$internal_serialize();
      result.b.__buttonType = Object.getPrototypeOf(this.button).constructor.name;
    }

    return result;
  }

  focus(chit?: Chit | Chit[]): this {
    if (!chit) {
      this.$internal_focusChits.push(...this.$internal_chits);
    } else if (Array.isArray(chit)) {
      this.$internal_focusChits.push(...chit);
    } else {
      this.$internal_focusChits.push(chit);
    }
    return this;
  }

  $internal_deserializeDetails(
    { c, f, b }: { c: string[]; f: string[]; b?: any },
    findChit: FindChit,
    buttonLibrary: IButtonLibrary,
  ): void {
    this.$internal_chits = c.map((chitId) => findChit(chitId) as T).filter((d) => d);
    this.$internal_focusChits = f.map((chitId) => findChit(chitId)).filter((d) => d);

    if (b) {
      const HARDCODED_BUTTON_LIBRARY: { [id: string]: new () => GameButton } = { Confirm };
      const buttonType = b.__buttonType;
      const ButtonType = buttonLibrary[buttonType] ?? HARDCODED_BUTTON_LIBRARY[buttonType];
      if (!ButtonType) {
        throw new Error(`Cannot find button type ${buttonType}`);
      }
      this.button = new ButtonType() as ToggleGalleryButton;
      this.button.$internal_deserialize(b, findChit);
    }
  }

  $internal_resolveDetails(chitId: string) {
    const selectedChit = this.$internal_chits.find((chit) => chit.id === chitId);
    if (!selectedChit) {
      throw new MismatchError();
    }
    return Promise.resolve(this.$internal_cb(selectedChit));
  }

  $internal_stageIn(prompt: PickPrompt) {
    this.$internal_chits.forEach((c) => (c.$internal_onClick = () => prompt.resolvePick(this, c.id)));
    this.$internal_processFocus();
    this.button?.$internal_computeItemSource(this);
    if (this.button?.autoShow && this.button?.$internal_galleryItemSource) {
      this.$internal_closeGallery = this.$internal_chits[0]?.$internal_renderInstance?.rootRenderInstance.showGallery(this.button.$internal_galleryItemSource);
    }
  }

  $internal_stageOut() {
    this.$internal_chits.forEach((c) => (c.$internal_onClick = undefined));
    if (this.$internal_closeGallery) {
      this.$internal_closeGallery();
    }
    if (this.button instanceof ToggleGalleryButton && this.button?.$internal_galleryItemSource) {
      this.$internal_chits[0]?.$internal_renderInstance?.rootRenderInstance.hideGallery(this.button.$internal_galleryItemSource);
    }
  }

  override $internal_confirmLock(turn: Turn<any, any, any>) {
    this.$internal_chits.forEach((chit) => chit.$internal_confirmLock(turn));
  }

  $internal_numberOfChoices() {
    return this.$internal_chits.length;
  }

  $internal_autoResolve() {
    return Promise.resolve(this.$internal_cb(this.$internal_chits[0]));
  }

  toggleButton(button: ToggleGalleryButton): this {
    this.button = button;
    return this;
  }
}

export class ButtonPick extends Pick {
  $internal_type: PickType = "ButtonPick";

  public button?: GameButton;

  $internal_numberOfChoices() {
    return 1;
  }

  $internal_autoResolve() {
    return Promise.resolve(this.button && this.button.cb && this.button.cb());
  }

  $internal_canAutoResolve() {
    return this.button?.$internal_canAutoResolve ?? true;
  }

  $internal_serializeDetails() {
    if (!this.button) {
      throw new Error("Cannot resolve without a button defined");
    }

    const details = this.button.$internal_serialize();
    details.__buttonType = Object.getPrototypeOf(this.button).constructor.name;
    details.__f = this.$internal_focusChits.map((chit) => chit.id);
    return details;
  }

  $internal_deserializeDetails(state: any, findChit: FindChit, buttonLibrary: IButtonLibrary) {
    const HARDCODED_BUTTON_LIBRARY: { [id: string]: new () => GameButton } = { Confirm };
    const buttonType = state.__buttonType;
    this.$internal_focusChits = state.__f.map((chitId: string) => findChit(chitId)).filter((d: Chit) => d);
    const ButtonType = buttonLibrary[buttonType] ?? HARDCODED_BUTTON_LIBRARY[buttonType];
    if (!ButtonType) {
      throw new Error(`Cannot find button type ${buttonType}`);
    }
    this.button = new ButtonType();
    this.button.$internal_deserialize(state, findChit);
  }

  $internal_resolveDetails() {
    if (!this.button) {
      throw new Error("Cannot resolve without a button defined");
    }
    return Promise.resolve(this.button && this.button.cb && this.button.cb());
  }

  $internal_stageIn(prompt: PickPrompt) {
    if (this.button) {
      this.button.cb = () => {
        if (this.button) {
          this.button.cb = () => {};
        }
        prompt.resolvePick(this, null);
      };
    }
    this.$internal_processFocus();
  }

  $internal_stageOut() {}
}
