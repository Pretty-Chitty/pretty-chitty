import { Check, Flip } from "@mui/icons-material";
import { BottomBarButtonIcon } from "../components/BottomBarButton";
import { ButtonPick, ChitPick, FindChit } from "./Pick";
import { NonEditable } from "../utilities/Annotations";
import { Chit } from "./Chit";
import { GalleryItemSource } from "../components/GalleryViewer";
import { GalleryItemChitChildrenSource } from "./GalleryItemChitChildrenSource";
import { GalleryItemRawSource } from "./GalleryItemRawSource";
import { chitsToGalleryItems } from "../utilities/GalleryItemConversion";
import { setTypeName } from "./typeName";

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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  /** @internal */
  deserialize(config: any, findChit: FindChit) {}
}

export class ToggleGalleryButton extends GameButton {
  autoShow = true;

  toggleSmallSize?: number = 125;

  /**
   * Opt-in, off by default. When this gallery's prompt goes away (say, while the answer's
   * animations play), the inline strip keeps its items and height for up to this many ms. If the
   * next prompt opens an inline gallery in that time, it swaps in place: items shared by both
   * stay where they are instead of animating out and back in. Meant for a gallery that reopens
   * after every pick, like a build menu.
   */
  holdOnCloseMs?: number;

  /** @internal */
  parentChit?: Chit;

  /** @internal */
  galleryItemSource?: GalleryItemSource;

  setParentChit(parentChit: Chit): this {
    this.parentChit = parentChit;
    return this;
  }

  /** @internal */
  serialize() {
    return {
      parentChitId: this.parentChit?.id,
      autoShow: this.autoShow,
      holdOnCloseMs: this.holdOnCloseMs,
    };
  }

  /** @internal */
  deserialize({ parentChitId, autoShow, holdOnCloseMs }: { parentChitId?: string; autoShow: boolean; holdOnCloseMs?: number }, findChit: FindChit) {
    if (parentChitId) {
      this.parentChit = findChit(parentChitId);
    }
    this.autoShow = autoShow;
    if (holdOnCloseMs !== undefined) this.holdOnCloseMs = holdOnCloseMs;
  }

  /** @internal */
  computeItemSource(chitPick: ChitPick<any>) {
    if (this.parentChit) {
      this.galleryItemSource = new GalleryItemChitChildrenSource(this.parentChit);
    } else {
      this.galleryItemSource = new GalleryItemRawSource(chitsToGalleryItems(chitPick.chits));
    }
    this.galleryItemSource.inlineGallerySize = this.toggleSmallSize;
    this.galleryItemSource.inlineHoldOnCloseMs = this.holdOnCloseMs;
  }
}

export abstract class DynamicGameButton<T> extends GameButton {
  private spec: T | undefined;

  config(spec: T): this {
    this.spec = spec;
    this.process(spec);
    return this;
  }

  abstract process(spec: T): void;

  /** @internal */
  serialize(): any {
    if (this.spec === undefined) {
      throw "Not configured";
    }

    return {
      spec: this.spec,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  /** @internal */
  deserialize({ spec }: { spec: T }) {
    this.spec = spec;
    this.process(this.spec);
  }
}

export class Confirm extends GameButton {
  label = "Confirm";
  icon = Check;
  /** @internal */
  canAutoResolve = false;
}
setTypeName(Confirm, "Confirm");
