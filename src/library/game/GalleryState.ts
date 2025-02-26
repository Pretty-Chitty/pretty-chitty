import { GalleryItem } from "../components/GalleryViewer";
import { EventChannel } from "../utilities/EventChannel";

export class GalleryState {
  public items = new EventChannel<undefined | GalleryItem[]>(undefined);
}
