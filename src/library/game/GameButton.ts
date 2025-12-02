import { Check, Flip } from "@mui/icons-material";
import { BottomBarButtonIcon } from "../components/BottomBarButton";
import { ButtonPick, ChitPick, FindChit } from "./Pick";
import { NonEditable } from "../utilities/Annotations";
import { Chit } from "./Chit";
import { GalleryItemSource } from "../components/GalleryViewer";
import { GalleryItemChitChildrenSource } from "./GalleryItemChitChildrenSource";
import { GalleryItemRawSource } from "./GalleryItemRawSource";
import { chitsToGalleryItems } from "../utilities/GalleryItemConversion";

export type ButtonCallback = () => void | Promise<void>;

export class GameButton {
  @NonEditable $internal_type = "button";

  public icon: BottomBarButtonIcon = Flip;
  public label: string = "Flip Me";
  public message: string | undefined;

  public $internal_canAutoResolve = true;

  constructor(public cb?: ButtonCallback) {}

  static pick(button: GameButton): ButtonPick {
    const result = new ButtonPick();
    result.$internal_messageContents = button.message;
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

  $internal_serialize(): any {
    return {};
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  $internal_deserialize(config: any, findChit: FindChit) {}
}

export class ToggleGalleryButton extends GameButton {
  autoShow = true;

  $internal_parentChit?: Chit;

  $internal_galleryItemSource?: GalleryItemSource;

  setParentChit(parentChit: Chit): this {
    this.$internal_parentChit = parentChit;
    return this;
  }

  $internal_serialize() {
    return {
      parentChitId: this.$internal_parentChit?.id,
      autoShow: this.autoShow,
    };
  }

  $internal_deserialize({ parentChitId, autoShow }: { parentChitId?: string; autoShow: boolean }, findChit: FindChit) {
    if (parentChitId) {
      this.$internal_parentChit = findChit(parentChitId);
    }
    this.autoShow = autoShow;
  }

  $internal_computeItemSource(chitPick: ChitPick<any>) {
    if (this.$internal_parentChit) {
      this.$internal_galleryItemSource = new GalleryItemChitChildrenSource(this.$internal_parentChit);
    } else {
      this.$internal_galleryItemSource = new GalleryItemRawSource(chitsToGalleryItems(chitPick.$internal_chits));
    }
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

  $internal_serialize(): any {
    if (this.spec === undefined) {
      throw "Not configured";
    }

    return {
      spec: this.spec,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  $internal_deserialize({ spec }: { spec: T }) {
    this.spec = spec;
    this.process(this.spec);
  }
}

export class Confirm extends GameButton {
  label = "Confirm";
  icon = Check;
  $internal_canAutoResolve = false;
}
