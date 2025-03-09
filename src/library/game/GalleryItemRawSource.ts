import { GalleryItem, GalleryItemSource } from "../components/GalleryViewer";

export class GalleryItemRawSource implements GalleryItemSource {
  constructor(private galleryItems: GalleryItem[]) {}

  get items() {
    return this.galleryItems;
  }

  close() {}

  registerUpdateHandler() {
    return () => {};
  }
}
