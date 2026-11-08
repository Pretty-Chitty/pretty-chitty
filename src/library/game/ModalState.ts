import { GalleryItemSource } from "../components/GalleryViewer";
import { EventChannel } from "../utilities/EventChannel";
import type { ExternalDragHost } from "../components/Panel/ExternalDrag";

export class ModalState {
  public gallerySource = new EventChannel<undefined | GalleryItemSource>(undefined);
  public inlineGallerySource = new EventChannel<undefined | GalleryItemSource>(undefined);
  public actionLogVisible = new EventChannel<boolean>(false);
  public settingsVisible = new EventChannel<boolean>(false);
  /** Set by the panels: lets the inline gallery drag a chit onto the board (see ExternalDrag). */
  public externalDragHost?: ExternalDragHost;

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
