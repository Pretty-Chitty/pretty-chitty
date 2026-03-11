import { GalleryItem, GalleryItemSource } from "../components/GalleryViewer";
import { chitsToGalleryItems } from "../utilities/GalleryItemConversion";
import { Chit } from "./Chit";

export class GalleryItemChitChildrenSource implements GalleryItemSource {
  private unSub: () => void;

  public inlineGallerySize?: number | undefined = undefined;

  constructor(public backingObject: Chit) {
    this.unSub = backingObject.onChange("deserialized", () => {
      this.cbs.forEach((cb) => cb());
    });
  }

  close() {
    this.unSub();
  }

  get items(): GalleryItem[] {
    const children = this.backingObject.children.concat();
    children.sort((a, b) => {
      if (a.parentOutlet !== b.parentOutlet) {
        return (a.parentOutlet ?? "").localeCompare(b.parentOutlet ?? "");
      }
      if (a.parentOutletIndex !== b.parentOutletIndex) {
        return (a.parentOutletIndex ?? 0) - (b.parentOutletIndex ?? 0);
      }
      return a.createdOrder - b.createdOrder;
    });
    return chitsToGalleryItems(children);
  }

  private cbs: (() => void)[] = [];
  registerUpdateHandler(cb: () => void): () => void {
    this.cbs.push(cb);
    return () => {
      this.cbs = this.cbs.filter((c) => c !== cb);
    };
  }
}
