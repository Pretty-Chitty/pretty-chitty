import { GalleryItemSource } from "../components/GalleryViewer";
import { EventChannel } from "../utilities/EventChannel";

export class GalleryState {
  public source = new EventChannel<undefined | GalleryItemSource>(undefined);
}
