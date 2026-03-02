import { Chit } from "./Chit";
import { GalleryItemChitChildrenSource } from "./GalleryItemChitChildrenSource";
import { IButtonLibrary } from "./Game";
import { Confirm, GameButton, ToggleGalleryButton } from "./GameButton";
import { OrderedOutlet } from "./OrderedOutlet";
import { PickPrompt } from "./Prompt";
import { MismatchError, Turn } from "./Turn";

export type FindChit = (id: string) => Chit;
export type PickType = "ChitPick" | "ButtonPick" | "DragPick";
export type PickSerialization = {
  type: PickType;
  message?: string;
  help?: string;
  details: any;
  context?: string;
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

  /** @internal */
  public contextChit?: Chit;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  /** @internal */
  confirmLock(_turn: Turn<any, any, any>) {
    // do nothing
  }

  /** @internal */
  abstract canResolveResponse(value: any): boolean;
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
      context: this.contextChit ? this.contextChit.id : undefined,
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
      case "DragPick": {
        p = new DragPick();
        break;
      }
    }

    if (p) {
      p.contextChit = pick.context ? findChit(pick.context) : undefined;
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

  context(chit: Chit | undefined): this {
    this.contextChit = chit;
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

  focus(chit?: Chit | Chit[]): this {
    if (!chit) {
      this.focusChits.push(...this.chits);
    } else if (Array.isArray(chit)) {
      this.focusChits.push(...chit);
    } else {
      this.focusChits.push(chit);
    }
    return this;
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
  canResolveResponse(chitId: string): boolean {
    return this.chits.some((chit) => chit.id === chitId);
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
      const inline = localStorage.galleryFullScreen !== `"modal"`; // hacky but maybe okay
      this.closeGallery = this.chits[0]?.renderInstance?.rootRenderInstance.showGallery(
        this.button.galleryItemSource,
        inline,
      );
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

export class DragTarget<C extends Chit, S extends Chit> {
  public chits: C[] = [];
  public cb: (sourceChit: S, targetChit: C) => void | Promise<void> = () => {};

  static from<C extends Chit, S extends Chit>(
    chit: C | C[] | OrderedOutlet<C>,
    cb: (sourceChit: S, targetChit: C) => void | Promise<void>,
  ) {
    const result = new DragTarget<C, S>();
    result.chits =
      chit instanceof OrderedOutlet ? chit.copy() : Array.isArray(chit) ? (chit.filter((c) => c) as C[]) : [chit];
    result.cb = cb;
    return result;
  }
}

export class DragPick<C extends Chit> extends Pick {
  /** @internal */
  type: PickType = "DragPick";

  public chits: C[] = [];

  public dropTargets: DragTarget<any, C>[] = [];

  /** @internal */
  serializeDetails() {
    const result: any = {
      c: this.chits.map((chit) => chit.id),
      d: this.dropTargets.map((dropTarget) => dropTarget.chits.map((chit) => chit.id)),
    };
    return result;
  }

  /** @internal */
  deserializeDetails({ c, d }: { c: string[]; d: string[][] }, findChit: FindChit): void {
    this.chits = c.map((chitId) => findChit(chitId) as C).filter((d) => d);
    this.dropTargets = d.map((dropIds: string[]) => {
      const result = new DragTarget<any, C>();
      result.chits = dropIds.map((chitId: string) => findChit(chitId)).filter((d) => d);
      return result;
    });
  }

  /** @internal */
  canResolveResponse(value: { chitId: string; targetChitId: string }): boolean {
    if (!value || !this.chits.some((chit) => chit.id === value.chitId)) return false;
    return this.dropTargets.some((dt) => dt.chits.some((chit) => chit.id === value.targetChitId));
  }

  /** @internal */
  resolveDetails({ chitId, targetChitId }: { chitId: string; targetChitId: string }): Promise<void> {
    const selectedChit = this.chits.find((chit) => chit.id === chitId);
    if (!selectedChit) {
      throw new MismatchError();
    }

    for (const dropTarget of this.dropTargets) {
      const targetChit = dropTarget.chits.find((chit) => chit.id === targetChitId);
      if (targetChit) {
        return Promise.resolve(dropTarget.cb(selectedChit, targetChit));
      }
    }
    throw new MismatchError();
  }

  /** @internal */
  stageIn(prompt: PickPrompt) {
    this.chits.forEach((c) => {
      c.dropTargets = this.dropTargets.flatMap((dt) => dt.chits);
      c.onDrag = (droppedChit: Chit) => {
        prompt.resolvePick(this, { chitId: c.id!, targetChitId: droppedChit.id! });
      };
    });
  }

  /** @internal */
  stageOut() {
    this.chits.forEach((c) => (c.onDrag = undefined));
  }

  /** @internal */
  autoResolve(): Promise<void | undefined> {
    const selectedChit = this.chits[0];
    const targetChit = this.dropTargets[0].chits[0];
    return Promise.resolve(this.dropTargets[0].cb(selectedChit, targetChit));
  }

  /** @internal */
  numberOfChoices(): number {
    return this.chits.length * this.dropTargets.reduce((sum, dt) => sum + dt.chits.length, 0);
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
  canResolveResponse(): boolean {
    return !!this.button;
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
