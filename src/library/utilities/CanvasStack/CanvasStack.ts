import {
  Texture,
  UVMapping,
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshPhongMaterial,
  Material,
  SRGBColorSpace,
  BufferGeometry,
} from "three";
import { IUpdatingCanvas } from "../IUpdatingCanvas";
import { CanvasOperation } from "./CanvasOperations";
import { ImageResult, ImageCache } from "./ImageCache";
import { ThreeDisposer } from "../ThreeDisposer";
import { getWebGlRendererInstance } from "../../hooks/useWebGlRenderer";

export type RenderBounds = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type Coord = {
  x: number;
  y: number;
};

let _NOTHING_CANVAS: HTMLCanvasElement | undefined;
export class CanvasStack implements IUpdatingCanvas {
  public canvas: HTMLCanvasElement | undefined;
  private context: CanvasRenderingContext2D | undefined;
  private _texture?: Texture;
  private cbs: Array<() => void> = [];

  private loadedUrls = new Set<string>();

  private static imageCache = new ImageCache(50); // 50? Is that good? No idea.
  private _outlets: { [id: string]: Coord } = {};

  private _mipCanvases: HTMLCanvasElement[] = [];
  private _mipContexts: CanvasRenderingContext2D[] = [];

  public createdAt = Date.now();

  public get hasBuiltTexture(): boolean {
    return !!this._texture;
  }

  onUpdate(cb: () => void): () => void {
    this.cbs.push(cb);
    return () => {
      this.cbs = this.cbs.filter((c) => c !== cb);
    };
  }

  /** @internal */
  loadUrl(url: string): ImageResult | undefined {
    const result = CanvasStack.imageCache.getImage(url);
    if (!result.isLoaded.value) {
      if (!this.loadedUrls.has(url)) {
        this.loadedUrls.add(url);
        const unsub = result.isLoaded.on(() => {
          if (result.isLoaded.value) {
            unsub();
            this.render();
            if (this._texture) {
              this._texture.needsUpdate = true;
              CanvasStack.disposer.notifyChange(this._texture.uuid);
            }
          }
        });
      }
      return undefined;
    }
    return result;
  }

  /** @internal */
  render(): void {
    if (!this.context) {
      return;
    }

    this._outlets = {};
    this.context.clearRect(0, 0, this.width, this.height);
    this.operation.render(
      this.context,
      { x: 0, y: 0, w: this.width, h: this.height },
      this.loadUrl.bind(this),
      (id: string, coords: Coord) => {
        this._outlets[id] = coords;
      },
    );
    this._renderMipCanvases();
    this.cbs.forEach((cb) => cb());
  }

  dispose() {
    this.cbs = [];
    this.canvas!.title = `Disposed, mat ${this._material?.uuid} texture ${this._texture?.uuid}`;
    this.canvas = undefined;
    this.context = undefined;
    this._mipCanvases = [];
    this._mipContexts = [];
    CanvasStack._liveStacks.delete(this);
    CanvasStack._pendingMips.delete(this);

    if (this._material) {
      this._material.dispose();
      this._material = undefined;
    }
    if (this._texture) {
      this._texture.dispose();
      this._texture = undefined;
    }
  }

  constructor(
    public width: number,
    public height: number,
    public operation: CanvasOperation,
    private _mipLevelsOverride?: number,
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;

    const context = this.canvas.getContext("2d");
    if (context === null) {
      throw "Invalid Context";
    }
    this.context = context;

    CanvasStack._liveStacks.add(this);
    CanvasStack.ensureContextRestoreSubscription();

    this.render();
    if (this.mipMaps > 0) CanvasStack.scheduleMips(this);
  }

  get mipMaps(): number {
    if (this._mipLevelsOverride !== undefined) return this._mipLevelsOverride;
    return this.operation.benefitsFromMipMap() ? 2 : 0;
  }

  // Faces with text get hand-drawn mip levels: text rasterised at the small size is sharper than GPU box-filtering.
  // Building that chain (a canvas per level, down to 1×1) for every face while the table loads is what stalled
  // phones — Safari queues 2D drawing in its GPU process and the first texture upload waits for all of it (8 s on an
  // iPhone for ~950 canvases). So every texture starts with GPU-generated mipmaps, and once canvas creation has gone
  // quiet the faces that benefit get their custom chain a few per frame, swapped in by a re-upload. Plain images
  // (mipMaps 0) never used the chain: the GPU builds theirs.
  private static _pendingMips = new Set<CanvasStack>();
  private static _mipTimer: ReturnType<typeof setTimeout> | undefined;
  private static _firstPendingAt = 0;
  private static readonly MIP_QUIET_MS = 1000; // build once no new canvas has appeared for this long…
  private static readonly MIP_MAX_WAIT_MS = 5000; // …or this long after the first one started waiting
  private static readonly MIP_FRAME_BUDGET_MS = 6;

  private static scheduleMips(stack: CanvasStack) {
    if (CanvasStack._pendingMips.size === 0) CanvasStack._firstPendingAt = Date.now();
    CanvasStack._pendingMips.add(stack);
    if (CanvasStack._mipTimer) clearTimeout(CanvasStack._mipTimer);
    const waited = Date.now() - CanvasStack._firstPendingAt;
    const delay = Math.max(0, Math.min(CanvasStack.MIP_QUIET_MS, CanvasStack.MIP_MAX_WAIT_MS - waited));
    CanvasStack._mipTimer = setTimeout(() => {
      CanvasStack._mipTimer = undefined;
      requestAnimationFrame(CanvasStack.buildPendingMips);
    }, delay);
  }

  private static buildPendingMips = () => {
    const start = performance.now();
    for (const stack of CanvasStack._pendingMips) {
      CanvasStack._pendingMips.delete(stack);
      if (stack.canvas) stack._buildMips();
      if (performance.now() - start > CanvasStack.MIP_FRAME_BUDGET_MS) break;
    }
    if (CanvasStack._pendingMips.size > 0) requestAnimationFrame(CanvasStack.buildPendingMips);
  };

  private _buildMips() {
    this._initMipCanvases();
    if (this._texture) {
      this._applyMipmaps(this._texture);
      this._texture.needsUpdate = true;
      CanvasStack.disposer.notifyChange(this._texture.uuid);
    }
  }

  /** Custom levels once the chain is built (same level count as GPU generation, so the re-upload reuses the storage). */
  private _applyMipmaps(texture: Texture) {
    if (this._mipCanvases.length > 0) {
      texture.generateMipmaps = false;
      // mipmaps[i] is uploaded as WebGL level i. Level 0 must be the base
      // canvas; levels 1..N are the custom-rendered smaller canvases.
      texture.mipmaps = [this.canvas!, ...this._mipCanvases];
    } else {
      texture.generateMipmaps = true;
      texture.mipmaps = [];
    }
  }

  private _initMipCanvases() {
    this._mipCanvases = [];
    this._mipContexts = [];
    // Build the full mipmap chain down to 1×1. WebGL requires a complete chain
    // when using a mipmap filter — a partial chain makes the texture incomplete
    // and WebGL renders it as transparent.
    let w = this.width;
    let h = this.height;
    while (w > 1 || h > 1) {
      w = Math.max(1, Math.floor(w / 2));
      h = Math.max(1, Math.floor(h / 2));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      this._mipCanvases.push(c);
      this._mipContexts.push(c.getContext("2d")!);
    }
    this._renderMipCanvases();
  }

  private _renderMipCanvases() {
    const noop = () => {};
    const numCustomLevels = this.mipMaps;
    for (let i = 0; i < this._mipCanvases.length; i++) {
      const ctx = this._mipContexts[i];
      const c = this._mipCanvases[i];
      if (i < numCustomLevels) {
        // Custom render: canvas scale so text is rasterized natively at the
        // smaller effective size rather than downsampled from the base canvas.
        const scale = c.width / this.width;
        ctx.save();
        ctx.scale(scale, scale);
        ctx.clearRect(0, 0, this.width, this.height);
        this.operation.render(ctx, { x: 0, y: 0, w: this.width, h: this.height }, this.loadUrl.bind(this), noop);
        ctx.restore();
      } else {
        // Complete the chain by box-filtering down from the previous level.
        const prev = i === 0 ? this.canvas! : this._mipCanvases[i - 1];
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(prev, 0, 0, c.width, c.height);
      }
    }
  }

  private static _liveStacks: Set<CanvasStack> = new Set();
  private static _restoreSubscribed = false;

  /**
   * After a WebGL context restore, GPU-side textures are gone. The 2D canvas
   * backing data is still valid, but three.js needs to be told to re-upload it.
   * Subscribe once to the renderer's restore notification and re-flag every
   * live instance's texture.
   */
  private static ensureContextRestoreSubscription() {
    if (CanvasStack._restoreSubscribed) return;
    const wrapper = getWebGlRendererInstance();
    if (!wrapper) return;
    CanvasStack._restoreSubscribed = true;
    wrapper.onDirty(() => {
      for (const stack of CanvasStack._liveStacks) {
        if (stack._texture) {
          stack._texture.needsUpdate = true;
        }
      }
    });
  }

  get outlets() {
    return this._outlets;
  }

  private _material: Material | undefined;
  get material(): Material {
    if (!this._material) {
      this._material = new MeshPhongMaterial({
        map: this.texture,
        alphaTest: 0.5,
      });
    }
    return this._material;
  }

  get texture(): Texture {
    if (!this.canvas) {
      throw new Error("CanvasStack has been disposed");
    }

    if (!this._texture) {
      const wrapper = getWebGlRendererInstance();
      this._texture = new Texture(
        this.canvas,
        UVMapping,
        ClampToEdgeWrapping,
        ClampToEdgeWrapping,
        LinearFilter,
        LinearMipmapLinearFilter,
      );
      this._applyMipmaps(this._texture);
      this._texture.anisotropy = wrapper?.maxAnisotropy ?? 1;
      this._texture.needsUpdate = true;
      this._texture.colorSpace = SRGBColorSpace;

      CanvasStack.disposer.register(this._texture.uuid, this);
    }
    return this._texture;
  }

  public static disposer = new ThreeDisposer<CanvasStack>((canvasStack) => {
    if (canvasStack._material) {
      canvasStack._material.dispose();
      canvasStack._material = undefined;
    }
    if (canvasStack._texture) {
      canvasStack._texture.dispose();

      if (!_NOTHING_CANVAS) {
        _NOTHING_CANVAS = document.createElement("canvas");
        _NOTHING_CANVAS.width = 1;
        _NOTHING_CANVAS.height = 1;
      }

      canvasStack._texture.source.data = _NOTHING_CANVAS; // prevent memory leaks! somehow it holding this reference stops the GC from cleaning anything up
      canvasStack._texture = undefined;
    }
    // Drop the strong reference so the instance can be GC'd. Both this
    // path and the explicit dispose() can run for the same stack — Set.delete
    // is idempotent, so the duplicate is harmless.
    CanvasStack._liveStacks.delete(canvasStack);
  });

  public static materialDisposer = new ThreeDisposer<Material>((material) => {
    material.dispose();
  });

  public static geoDisposer = new ThreeDisposer<BufferGeometry>((geometry) => {
    geometry.dispose();
  });
}
