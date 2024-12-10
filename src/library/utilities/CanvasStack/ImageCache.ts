import QuickLRU from 'quick-lru';

import { EventChannel } from '../EventChannel';

export class ImageResult {
  /** @internal */
  image: HTMLImageElement;

  /** @internal */
  isLoaded = new EventChannel<boolean>(false);

  constructor(url: string) {
    this.image = new Image();
    this.image.crossOrigin = 'anonymous';
    this.image.src = '';
    this.image.onload = () => {
      this.isLoaded.value = true;
    };
    this.image.src = url;
  }
}

export class ImageCache {
  /** @internal */
  lru: QuickLRU<string, ImageResult>;

  /** @internal */
  constructor(maxSize: number) {
    this.lru = new QuickLRU<string, ImageResult>({ maxSize });
  }

  getImage(url: string) {
    let result = this.lru.get(url);
    if (!result) {
      result = new ImageResult(url);
      this.lru.set(url, result);
    }
    return result;
  }
}
