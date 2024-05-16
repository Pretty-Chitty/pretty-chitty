import * as Colors from "color";
import { RenderBounds } from "./CanvasStack";
import { ImageResult } from "./ImageCache";
import { PlayerChit } from "../../game/PlayerChit";

export type GetImage = (url: string) => ImageResult | undefined;

export abstract class CanvasOperation {
  abstract render(context: CanvasRenderingContext2D, bounds: RenderBounds, getImage: GetImage): void;
}

export type RenderCallback = (context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void;

export class LayeredCanvasOperation extends CanvasOperation {
  constructor(private layers: CanvasOperation[]) {
    super();
  }

  override render(context: CanvasRenderingContext2D, bounds: RenderBounds, getImage: GetImage) {
    this.layers.forEach((layer) => layer.render(context, { ...bounds }, getImage));
  }
}

export class ColorCanvasOperation extends CanvasOperation {
  constructor(
    private color: string,
    private opacity: number = 1,
  ) {
    super();
  }

  override render(context: CanvasRenderingContext2D, bounds: RenderBounds) {
    context.fillStyle = this.color;
    context.globalAlpha = this.opacity;
    context.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
  }
}

export interface StackItem {
  size?: number;
  layer?: CanvasOperation;
}

export class VerticalStackCanvasOperation extends CanvasOperation {
  constructor(private items: Array<StackItem>) {
    super();
  }

  override render(context: CanvasRenderingContext2D, bounds: RenderBounds, getImage: GetImage) {
    const totalDefinedSize = this.items.reduce((total, item) => total + (item.size || 0), 0);
    const itemsWithoutDefinedSize = this.items.filter((item) => item.size === undefined);
    const itemSizeWithoutDefinition = Math.round((bounds.h - totalDefinedSize) / itemsWithoutDefinedSize.length);

    this.items.forEach((item) => {
      item.layer?.render(context, { ...bounds, h: item.size ?? itemSizeWithoutDefinition }, getImage);
      bounds.y += item.size ?? itemSizeWithoutDefinition;
    });
  }
}

export class HorizontalStackCanvasOperation extends CanvasOperation {
  constructor(private items: Array<StackItem>) {
    super();
  }

  override render(context: CanvasRenderingContext2D, bounds: RenderBounds, getImage: GetImage) {
    const totalDefinedSize = this.items.reduce((total, item) => total + (item.size || 0), 0);
    const itemsWithoutDefinedSize = this.items.filter((item) => item.size === undefined);
    const itemSizeWithoutDefinition = Math.round((bounds.w - totalDefinedSize) / itemsWithoutDefinedSize.length);

    this.items.forEach((item) => {
      item.layer?.render(context, { ...bounds, w: item.size ?? itemSizeWithoutDefinition }, getImage);
      bounds.x += item.size ?? itemSizeWithoutDefinition;
    });
  }
}

export interface PadAmounts {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}

export class PadCanvasOperation extends CanvasOperation {
  constructor(
    private pads: PadAmounts,
    private item: CanvasOperation,
  ) {
    super();
  }

  override render(context: CanvasRenderingContext2D, bounds: RenderBounds, getImage: GetImage) {
    this.item.render(
      context,
      {
        x: bounds.x + (this.pads.left ?? 0),
        y: bounds.y + (this.pads.top ?? 0),
        w: bounds.w - (this.pads.left ?? 0) - (this.pads.right ?? 0),
        h: bounds.h - (this.pads.top ?? 0) - (this.pads.bottom ?? 0),
      },
      getImage,
    );
  }
}

export type Alignment = "center" | "left" | "right";

export interface TextOptions {
  contextOptions?: any;
  align?: Alignment;
  offsetX?: number;
  offsetY?: number;
  before?: CanvasOperation;
  after?: CanvasOperation;
}

export class TextCanvasOperation extends CanvasOperation {
  constructor(
    private text: string,
    private options: TextOptions,
  ) {
    super();
  }

  override render(context: CanvasRenderingContext2D, bounds: RenderBounds, getImage: GetImage) {
    const startX = bounds.x,
      startY = bounds.y;

    if (this.options.contextOptions) {
      Object.keys(this.options.contextOptions).forEach(
        // @ts-expect-error -- It's okay
        (key) => (context[key] = this.options.contextOptions[key]),
      );
    }

    const measured = context.measureText(this.text);
    if (this.options.align === "center") {
      bounds.x += bounds.w / 2 - measured.width / 2;
    } else if (this.options.align === "right") {
      bounds.x += bounds.w - measured.width;
    }

    bounds.y += bounds.h / 2 + measured.actualBoundingBoxAscent / 2;
    if (this.options.offsetY) {
      bounds.y += this.options.offsetY;
    }
    if (this.options.offsetX) {
      bounds.x += this.options.offsetX;
    }

    if (this.options.contextOptions?.fillStyle) {
      context.fillText(this.text, bounds.x, bounds.y);
    }
    if (this.options.contextOptions?.strokeStyle) {
      context.strokeText(this.text, bounds.x, bounds.y);
    }

    // undo our settings
    if (this.options.contextOptions) {
      Object.keys(this.options.contextOptions).forEach(
        // @ts-expect-error -- It's okay
        (key) => (context[key] = null),
      );
    }

    if (this.options.before) {
      this.options.before.render(context, { x: startX, y: startY, w: bounds.x - startX, h: bounds.h }, getImage);
    }
    if (this.options.after) {
      this.options.after.render(
        context,
        {
          x: bounds.x + measured.width,
          y: startY,
          w: bounds.w - (bounds.x - startX + measured.width),
          h: bounds.h,
        },
        getImage,
      );
    }
  }
}

export type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ImageFileInfo = {
  file: string;
  bounds: Bounds;
};

export type ImageSpec = {
  primary: ImageFileInfo;
  micro: ImageFileInfo;
} & ImageColorSpec;

export type ImageColorSpec = {
  color: number;
  borderColor: number;
  borderColors: {
    top: number;
    left: number;
    right: number;
    bottom: number;
  };
};

export interface ImageOptions {
  fill?: boolean;
  // tile?: boolean;
  overdraw?: number;
}

export class ImageCanvasOperation extends CanvasOperation {
  constructor(
    private imageSpec: ImageSpec,
    private options: ImageOptions,
  ) {
    super();
  }

  draw(
    context: CanvasRenderingContext2D,
    bounds: RenderBounds,
    sourceImage: HTMLImageElement | string,
    sourceBounds: Bounds,
  ) {
    if (this.options.fill) {
      return this.drawFill(context, bounds, sourceImage, sourceBounds);
    }

    let x = bounds.x,
      y = bounds.y,
      w = bounds.w,
      h = bounds.h;

    const targetAspect = w / h,
      sx = sourceBounds.x,
      sy = sourceBounds.y,
      sw = sourceBounds.width,
      sh = sourceBounds.height,
      sourceAspect = sw / sh;

    if (targetAspect > sourceAspect) {
      const newW = h * sourceAspect;
      x += (w - newW) / 2;
      w = newW;
    } else {
      const newH = w / sourceAspect;
      y += (h - newH) / 2;
      h = newH;
    }

    if (typeof sourceImage === "string") {
      context.fillStyle = sourceImage;
      context.globalAlpha = 1;
      context.fillRect(x, y, w, h);
    } else {
      context.globalAlpha = 1;
      context.drawImage(sourceImage, sx, sy, sw, sh, x, y, w, h);
    }
  }

  drawFill(
    context: CanvasRenderingContext2D,
    bounds: RenderBounds,
    sourceImage: HTMLImageElement | string,
    sourceBounds: Bounds,
  ) {
    const x = bounds.x,
      y = bounds.y,
      w = bounds.w,
      h = bounds.h;

    const targetAspect = w / h,
      sourceAspect = sourceBounds.width / sourceBounds.height;

    let sx = sourceBounds.x,
      sy = sourceBounds.y,
      sw = sourceBounds.width,
      sh = sourceBounds.height;

    if (targetAspect > sourceAspect) {
      // Target is wider than source; adjust source height and y to maintain aspect ratio
      sh = sw / targetAspect;
      sy += (sourceBounds.height - sh) / 2; // Center vertically in source
    } else {
      // Target is taller than source; adjust source width and x to maintain aspect ratio
      sw = sh * targetAspect;
      sx += (sourceBounds.width - sw) / 2; // Center horizontally in source
    }

    if (typeof sourceImage === "string") {
      context.fillStyle = sourceImage;
      context.globalAlpha = 1;
      context.fillRect(x, y, w, h);
    } else {
      context.globalAlpha = 1;
      context.drawImage(sourceImage, sx, sy, sw, sh, x, y, w, h);
    }
  }

  override render(context: CanvasRenderingContext2D, bounds: RenderBounds, getImage: GetImage) {
    const image = getImage(this.imageSpec.primary.file);
    if (image) {
      // context.drawImage(image.image, bounds.x, bounds.y);
      this.draw(context, bounds, image.image, this.imageSpec.primary.bounds);
    } else {
      const micro = getImage(this.imageSpec.micro.file);
      if (micro) {
        this.draw(context, bounds, micro.image, this.imageSpec.micro.bounds);
      } else {
        this.draw(context, bounds, Colors.default(this.imageSpec.color).hex(), this.imageSpec.primary.bounds);
      }
    }
  }
}

export class PlayerCanvasOperation extends CanvasOperation {
  constructor(private player: PlayerChit) {
    super();
  }

  drawFill(context: CanvasRenderingContext2D, bounds: RenderBounds, sourceImage: HTMLImageElement) {
    const x = bounds.x,
      y = bounds.y,
      w = bounds.w,
      h = bounds.h;

    const targetAspect = w / h,
      sourceAspect = sourceImage.width / sourceImage.height;

    let sx = 0,
      sy = 0,
      sw = sourceImage.width,
      sh = sourceImage.height;

    if (targetAspect > sourceAspect) {
      // Target is wider than source; adjust source height and y to maintain aspect ratio
      sh = sw / targetAspect;
      sy += (sourceImage.height - sh) / 2; // Center vertically in source
    } else {
      // Target is taller than source; adjust source width and x to maintain aspect ratio
      sw = sh * targetAspect;
      sx += (sourceImage.width - sw) / 2; // Center horizontally in source
    }

    context.globalAlpha = 1;
    context.drawImage(sourceImage, sx, sy, sw, sh, x, y, w, h);
  }

  override render(context: CanvasRenderingContext2D, bounds: RenderBounds, getImage: GetImage) {
    context.fillStyle = this.player.color;
    context.globalAlpha = 1;
    context.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);

    if (this.player.imageUrl) {
      const image = getImage(this.player.imageUrl);
      if (image) {
        this.drawFill(context, bounds, image.image);
      }
    }
  }
}

export class CallbackCanvasOperation extends CanvasOperation {
  constructor(private cb: RenderCallback) {
    super();
  }

  override render(context: CanvasRenderingContext2D, bounds: RenderBounds) {
    this.cb(context, bounds.x, bounds.y, bounds.w, bounds.h);
  }
}
