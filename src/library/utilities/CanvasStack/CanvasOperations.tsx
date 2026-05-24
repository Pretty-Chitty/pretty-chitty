import * as Colors from "color";
import { RenderBounds } from "./CanvasStack";
import { ImageResult } from "./ImageCache";
import { PlayerChit } from "../../game/PlayerChit";
import { GameTheme } from "../../game/GameTheme";
import imageColorOverlayer from "./ImageColorOverlayer";
import { RichTextRenderOptionsParameters, RichTextRenderer } from "./RichTextRenderer";

export type GetImage = (url: string) => ImageResult | undefined;
export type ReportOutlet = (id: string, coord: { x: number; y: number }) => void;

export abstract class CanvasOperation {
  abstract render(
    context: CanvasRenderingContext2D,
    bounds: RenderBounds,
    getImage: GetImage,
    reportOutlet: ReportOutlet,
  ): void;

  abstract benefitsFromMipMap(): boolean;
}

export type RenderCallback = (context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void;

export class LayeredCanvasOperation extends CanvasOperation {
  constructor(private layers: CanvasOperation[]) {
    super();
  }

  override benefitsFromMipMap() {
    return this.layers.some((l) => l.benefitsFromMipMap());
  }

  override render(
    context: CanvasRenderingContext2D,
    bounds: RenderBounds,
    getImage: GetImage,
    reportOutlet: ReportOutlet,
  ) {
    this.layers.forEach((layer) => layer.render(context, { ...bounds }, getImage, reportOutlet));
  }
}

export class ColorCanvasOperation extends CanvasOperation {
  constructor(
    private color: string,
    private opacity: number = 1,
  ) {
    super();
  }

  override benefitsFromMipMap() {
    return false;
  }

  override render(
    context: CanvasRenderingContext2D,
    bounds: RenderBounds,
    _getImage?: GetImage,
    _reportOutlet?: ReportOutlet,
  ) {
    context.fillStyle = this.color;
    context.globalAlpha = this.opacity;
    context.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
    context.fillStyle = "";
    context.globalAlpha = 1;
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

  override benefitsFromMipMap() {
    return this.items.some((i) => i.layer?.benefitsFromMipMap() ?? false);
  }

  override render(
    context: CanvasRenderingContext2D,
    bounds: RenderBounds,
    getImage: GetImage,
    reportOutlet: ReportOutlet,
  ) {
    const items = this.items.filter((item) => item);
    const totalDefinedSize = items.reduce((total, item) => total + (item.size || 0), 0);
    const itemsWithoutDefinedSize = items.filter((item) => item.size === undefined);
    const itemSizeWithoutDefinition = Math.round((bounds.h - totalDefinedSize) / itemsWithoutDefinedSize.length);

    items.forEach((item) => {
      item.layer?.render(context, { ...bounds, h: item.size ?? itemSizeWithoutDefinition }, getImage, reportOutlet);
      bounds.y += item.size ?? itemSizeWithoutDefinition;
    });
  }
}

export class HorizontalStackCanvasOperation extends CanvasOperation {
  constructor(private items: Array<StackItem>) {
    super();
  }

  override benefitsFromMipMap() {
    return this.items.some((i) => i.layer?.benefitsFromMipMap() ?? false);
  }

  override render(
    context: CanvasRenderingContext2D,
    bounds: RenderBounds,
    getImage: GetImage,
    reportOutlet: ReportOutlet,
  ) {
    const items = this.items.filter((item) => item);
    const totalDefinedSize = items.reduce((total, item) => total + (item.size || 0), 0);
    const itemsWithoutDefinedSize = items.filter((item) => item.size === undefined);
    const itemSizeWithoutDefinition = Math.round((bounds.w - totalDefinedSize) / itemsWithoutDefinedSize.length);

    items.forEach((item) => {
      item.layer?.render(context, { ...bounds, w: item.size ?? itemSizeWithoutDefinition }, getImage, reportOutlet);
      bounds.x += item.size ?? itemSizeWithoutDefinition;
    });
  }
}

export class OutletCanvasOperation extends CanvasOperation {
  constructor(
    private id: string,
    private child: CanvasOperation,
  ) {
    super();
  }

  override benefitsFromMipMap() {
    return this.child.benefitsFromMipMap();
  }

  override render(
    context: CanvasRenderingContext2D,
    bounds: RenderBounds,
    getImage: GetImage,
    reportOutlet: ReportOutlet,
  ) {
    reportOutlet(this.id, { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 });
    this.child.render(context, bounds, getImage, reportOutlet);
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

  override benefitsFromMipMap() {
    return this.item.benefitsFromMipMap();
  }

  override render(
    context: CanvasRenderingContext2D,
    bounds: RenderBounds,
    getImage: GetImage,
    reportOutlet: ReportOutlet,
  ) {
    this.item.render(
      context,
      {
        x: bounds.x + (this.pads.left ?? 0),
        y: bounds.y + (this.pads.top ?? 0),
        w: bounds.w - (this.pads.left ?? 0) - (this.pads.right ?? 0),
        h: bounds.h - (this.pads.top ?? 0) - (this.pads.bottom ?? 0),
      },
      getImage,
      reportOutlet,
    );
  }
}

export type Alignment = "center" | "left" | "right";

export interface TextOptions {
  contextOptions?: {
    fillStyle?: string;
    strokeStyle?: string;
    shadowBlur?: number;
    shadowColor?: string;
  };
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number | "normal" | "bold";
  align?: Alignment;
  offsetX?: number;
  offsetY?: number;
  before?: CanvasOperation;
  after?: CanvasOperation;
}

export class MarkdownCanvasOperation extends CanvasOperation {
  constructor(
    private text: string,
    private iconMap: IconMap,
    private params: RichTextRenderOptionsParameters,
  ) {
    super();
  }

  override benefitsFromMipMap() {
    return true;
  }

  public height = 0;
  override render(context: CanvasRenderingContext2D, bounds: RenderBounds, getImage: GetImage) {
    const iconMap: {
      [iconName: string]: { image: HTMLImageElement; x: number; y: number; width: number; height: number };
    } = {};

    Object.keys(this.iconMap).forEach((icon) => {
      const spec = this.iconMap[icon];
      if ((spec as any as PlayerChit)?.type === "player") {
        const p = spec as any as PlayerChit;
        if (p.imageUrl) {
          const image = getImage(p.imageUrl);
          if (image) {
            iconMap[icon] = { image: image.image, x: 0, y: 0, width: image.image.width, height: image.image.height };
          }
        }
      } else {
        const s = spec as any as ImageSpec;
        const image = getImage(s.primary.file);
        if (image) {
          iconMap[icon] = {
            image: image.image,
            x: s.primary.bounds.x,
            y: s.primary.bounds.y,
            width: s.primary.bounds.width,
            height: s.primary.bounds.height,
          };
        } else {
          const micro = getImage(s.micro.file);
          if (micro) {
            iconMap[icon] = {
              image: micro.image,
              x: s.micro.bounds.x,
              y: s.micro.bounds.y,
              width: s.micro.bounds.width,
              height: s.micro.bounds.height,
            };
          }
        }
      }
    });

    const result = new RichTextRenderer().render(context, this.text, {
      maxWidth: bounds.w,
      x: bounds.x,
      y: bounds.y,
      height: bounds.h,
      ...this.params,
      iconMap,
    });
    this.height = result.height;
  }
}

export class TextCanvasOperation extends CanvasOperation {
  constructor(
    private text: string,
    private options: TextOptions,
  ) {
    super();
  }

  override benefitsFromMipMap() {
    return true;
  }

  private makeFont(): string {
    const fontSize = this.options.fontSize ?? 16;
    const fontFamily = this.options.fontFamily ?? GameTheme.defaultFontFamily;
    const fontWeight = this.options.fontWeight ?? 400;
    return `${fontWeight} ${fontSize}px ${fontFamily}`;
  }

  override render(
    context: CanvasRenderingContext2D,
    bounds: RenderBounds,
    getImage: GetImage,
    reportOutlet: ReportOutlet,
  ) {
    const startX = bounds.x,
      startY = bounds.y;

    context.font = this.makeFont();

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
      this.options.before.render(
        context,
        { x: startX, y: startY, w: bounds.x - startX, h: bounds.h },
        getImage,
        reportOutlet,
      );
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
        reportOutlet,
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

export type IconMap = {
  [iconName: string]: ImageSpec | PlayerChit;
};

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

export type ImageHorizontalAlign = "left" | "center" | "right";
export type ImageVerticalAlign = "top" | "middle" | "bottom";

export interface ImageOptions {
  fill?: boolean;
  overlayColor?: string;
  horizontalAlign?: ImageHorizontalAlign;
  verticalAlign?: ImageVerticalAlign;
}

export class ImageCanvasOperation extends CanvasOperation {
  constructor(
    private imageSpec: ImageSpec,
    private options: ImageOptions,
  ) {
    super();
  }

  override benefitsFromMipMap() {
    return false;
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
      const hAlign = this.options.horizontalAlign ?? "center";
      if (hAlign === "center") {
        x += Math.floor((w - newW) / 2);
      } else if (hAlign === "right") {
        x += w - newW;
      }
      w = newW;
    } else {
      const newH = w / sourceAspect;
      const vAlign = this.options.verticalAlign ?? "middle";
      if (vAlign === "middle") {
        y += Math.floor((h - newH) / 2);
      } else if (vAlign === "bottom") {
        y += h - newH;
      }
      h = newH;
    }

    if (typeof sourceImage === "string") {
      context.fillStyle = sourceImage;
      context.globalAlpha = 1;
      context.fillRect(x, y, w, h);
    } else {
      // Draw the image
      context.globalAlpha = 1;
      const source = this.options.overlayColor
        ? imageColorOverlayer(sourceImage, this.options.overlayColor)
        : sourceImage;
      // Round and clamp source rectangle to integer texel coordinates to avoid sampling
      // pixels from neighboring sprites when the browser does linear filtering.
      let sxi = Math.floor(sx);
      let syi = Math.floor(sy);
      let swi = Math.ceil(sw);
      let shi = Math.ceil(sh);
      const maxW = (source as any).width ?? (source as any).naturalWidth ?? 0;
      const maxH = (source as any).height ?? (source as any).naturalHeight ?? 0;
      if (sxi < 0) {
        swi += sxi;
        sxi = 0;
      }
      if (syi < 0) {
        shi += syi;
        syi = 0;
      }
      if (maxW && sxi + swi > maxW) {
        swi = Math.max(0, maxW - sxi);
      }
      if (maxH && syi + shi > maxH) {
        shi = Math.max(0, maxH - syi);
      }
      // Inset by half a texel and disable smoothing so bilinear filtering
      // never samples neighboring sprites in the spritesheet.
      const inset = 0.5;
      if (swi > inset * 2 && shi > inset * 2) {
        const prevSmoothing = context.imageSmoothingEnabled;
        context.imageSmoothingEnabled = false;
        context.drawImage(source as any, sxi + inset, syi + inset, swi - inset * 2, shi - inset * 2, x, y, w, h);
        context.imageSmoothingEnabled = prevSmoothing;
      }
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
      // Target is wider than source; crop source height
      sh = sw / targetAspect;
      const vAlign = this.options.verticalAlign ?? "middle";
      if (vAlign === "middle") {
        sy += (sourceBounds.height - sh) / 2;
      } else if (vAlign === "bottom") {
        sy += sourceBounds.height - sh;
      }
    } else {
      // Target is taller than source; crop source width
      sw = sh * targetAspect;
      const hAlign = this.options.horizontalAlign ?? "center";
      if (hAlign === "center") {
        sx += (sourceBounds.width - sw) / 2;
      } else if (hAlign === "right") {
        sx += sourceBounds.width - sw;
      }
    }

    if (typeof sourceImage === "string") {
      context.fillStyle = sourceImage;
      context.globalAlpha = 1;
      context.fillRect(x, y, w, h);
    } else {
      context.globalAlpha = 1;

      const source = this.options.overlayColor
        ? imageColorOverlayer(sourceImage, this.options.overlayColor)
        : sourceImage;
      // Round and clamp source rectangle to integer texel coordinates to avoid sampling
      // pixels from neighboring sprites when the browser does linear filtering.
      let sxiF = Math.floor(sx);
      let syiF = Math.floor(sy);
      let swiF = Math.ceil(sw);
      let shiF = Math.ceil(sh);
      // Clamp to sprite bounds so rounding never bleeds into neighboring sprites.
      const sbRight = sourceBounds.x + sourceBounds.width;
      const sbBottom = sourceBounds.y + sourceBounds.height;
      if (sxiF < sourceBounds.x) {
        swiF -= sourceBounds.x - sxiF;
        sxiF = sourceBounds.x;
      }
      if (syiF < sourceBounds.y) {
        shiF -= sourceBounds.y - syiF;
        syiF = sourceBounds.y;
      }
      if (sxiF + swiF > sbRight) {
        swiF = sbRight - sxiF;
      }
      if (syiF + shiF > sbBottom) {
        shiF = sbBottom - syiF;
      }
      // Also clamp to overall image dimensions.
      const maxWF = (source as any).width ?? (source as any).naturalWidth ?? 0;
      const maxHF = (source as any).height ?? (source as any).naturalHeight ?? 0;
      if (maxWF && sxiF + swiF > maxWF) {
        swiF = Math.max(0, maxWF - sxiF);
      }
      if (maxHF && syiF + shiF > maxHF) {
        shiF = Math.max(0, maxHF - syiF);
      }
      // Inset by half a texel and disable smoothing so bilinear filtering
      // never samples neighboring sprites in the spritesheet.
      const inset = 0.5;
      if (swiF > inset * 2 && shiF > inset * 2) {
        const prevSmoothing = context.imageSmoothingEnabled;
        context.imageSmoothingEnabled = false;
        context.drawImage(source as any, sxiF + inset, syiF + inset, swiF - inset * 2, shiF - inset * 2, x, y, w, h);
        context.imageSmoothingEnabled = prevSmoothing;
      }
    }
  }

  override render(
    context: CanvasRenderingContext2D,
    bounds: RenderBounds,
    getImage: GetImage,
    _reportOutlet: ReportOutlet,
  ) {
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
  constructor(
    private player: PlayerChit,
    private colorBlend: number = 0,
  ) {
    super();
  }

  override benefitsFromMipMap() {
    return false;
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
      sh = sw / targetAspect;
      sy += (sourceImage.height - sh) / 2;
    } else {
      sw = sh * targetAspect;
      sx += (sourceImage.width - sw) / 2;
    }

    if (this.colorBlend < 1) {
      context.globalAlpha = 1 - this.colorBlend;
      context.drawImage(sourceImage, sx, sy, sw, sh, x, y, w, h);
    }

    if (this.colorBlend <= 0) return;

    // Build tinted version on an offscreen canvas using composite blend modes
    const pw = Math.ceil(w),
      ph = Math.ceil(h);
    const offscreen = document.createElement("canvas");
    offscreen.width = pw;
    offscreen.height = ph;
    const offCtx = offscreen.getContext("2d")!;

    // Grayscale + slight contrast boost via CSS filter
    offCtx.filter = "grayscale(1) contrast(2)";
    offCtx.drawImage(sourceImage, sx, sy, sw, sh, 0, 0, pw, ph);
    offCtx.filter = "none";

    // For dark player colors, screen blend makes dark areas take the color while whites stay white.
    // For light player colors, multiply blend makes white areas take the color while blacks stay black.
    offCtx.globalCompositeOperation = Colors.default(this.player.color).lightness() < 40 ? "screen" : "multiply";
    offCtx.fillStyle = this.player.color;
    offCtx.fillRect(0, 0, pw, ph);
    offCtx.globalCompositeOperation = "source-over";

    // Overlay the tinted version at colorBlend strength
    context.globalAlpha = this.colorBlend;
    context.drawImage(offscreen, x, y, w, h);
    context.globalAlpha = 1;
  }

  override render(
    context: CanvasRenderingContext2D,
    bounds: RenderBounds,
    getImage: GetImage,
    _reportOutlet: ReportOutlet,
  ) {
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

  override benefitsFromMipMap() {
    return false;
  }

  override render(
    context: CanvasRenderingContext2D,
    bounds: RenderBounds,
    _getImage?: GetImage,
    _reportOutlet?: ReportOutlet,
  ) {
    this.cb(context, bounds.x, bounds.y, bounds.w, bounds.h);
  }
}

/**
 * Renders children into a rounded rectangle mask.
 * Any drawing outside the rounded rect is clipped.
 */
export class RoundedRectCanvasOperation extends CanvasOperation {
  constructor(
    private children: CanvasOperation[],
    private radius: number,
  ) {
    super();
  }

  override benefitsFromMipMap() {
    return this.children.some((c) => c.benefitsFromMipMap());
  }

  override render(
    context: CanvasRenderingContext2D,
    bounds: RenderBounds,
    getImage: GetImage,
    reportOutlet: ReportOutlet,
  ) {
    context.save();

    // Create rounded rect path
    const { x, y, w, h } = bounds;
    const r = Math.max(0, Math.min(this.radius, Math.min(w, h) / 2));
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + w - r, y);
    context.quadraticCurveTo(x + w, y, x + w, y + r);
    context.lineTo(x + w, y + h - r);
    context.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    context.lineTo(x + r, y + h);
    context.quadraticCurveTo(x, y + h, x, y + h - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
    context.clip();

    // Render children
    for (const child of this.children) {
      child.render(context, bounds, getImage, reportOutlet);
    }

    context.restore();
  }
}
