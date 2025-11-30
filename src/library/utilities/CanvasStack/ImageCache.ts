import QuickLRU from "quick-lru";
import { EventChannel } from "../EventChannel";

export class ImageResult {
  $internal_image: HTMLImageElement;

  $internal_isLoaded = new EventChannel<boolean>(false);

  constructor(url: string) {
    this.$internal_image = new Image();
    this.$internal_image.crossOrigin = "anonymous";
    this.$internal_image.src = "";
    this.$internal_image.onload = () => {
      this.$internal_isLoaded.value = true;
    };
    this.$internal_image.src = url;
  }
}

export class ImageCache {
  $internal_lru: QuickLRU<string, ImageResult>;

  $internal_constructor(maxSize: number) {
    this.$internal_lru = new QuickLRU<string, ImageResult>({ maxSize });
  }

  constructor(maxSize: number) {
    this.$internal_lru = new QuickLRU<string, ImageResult>({ maxSize });
  }

  getImage(url: string) {
    let result = this.$internal_lru.get(url);
    if (!result) {
      result = new ImageResult(url);
      this.$internal_lru.set(url, result);
    }
    return result;
  }
}
