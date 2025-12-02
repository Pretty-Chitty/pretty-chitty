import { GalleryItemSource } from "../components/GalleryViewer";
import { EventChannel } from "../utilities/EventChannel";

export class ModalState {
  public gallerySource = new EventChannel<undefined | GalleryItemSource>(undefined);
  public actionLogVisible = new EventChannel<boolean>(false);
  public settingsVisible = new EventChannel<boolean>(false);

  constructor() {
    this.gallerySource.on((source) => {
      if (source) {
        this.actionLogVisible.value = false;
        this.settingsVisible.value = false;
      }
    });
    this.actionLogVisible.on((visible) => {
      if (visible) {
        this.gallerySource.value = undefined;
        this.settingsVisible.value = false;
      }
    });
    this.settingsVisible.on((visible) => {
      if (visible) {
        this.gallerySource.value = undefined;
        this.actionLogVisible.value = false;
      }
    });
  }
}
