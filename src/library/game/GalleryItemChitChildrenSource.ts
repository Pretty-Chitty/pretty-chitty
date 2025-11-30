import { GalleryItem, GalleryItemSource } from "../components/GalleryViewer";
import { chitsToGalleryItems } from "../utilities/GalleryItemConversion";
import { Chit } from "./Chit";

export class GalleryItemChitChildrenSource implements GalleryItemSource {
  private unSub: () => void;

  constructor(public backingObject: Chit) {
    this.unSub = backingObject.$internal_onChange("deserialized", () => {
      this.cbs.forEach((cb) => cb());
    });
  }

  close() {
    this.unSub();
  }

  get items(): GalleryItem[] {
    const children = this.backingObject.$internal_children.concat();
    children.sort((a, b) => a.$internal_createdOrder - b.$internal_createdOrder);
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
