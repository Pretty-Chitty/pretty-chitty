import {
  Texture,
  UVMapping,
  ClampToEdgeWrapping,
  LinearFilter,
  MeshPhongMaterial,
  Material,
  SRGBColorSpace,
  BufferGeometry,
} from "three";
import { IUpdatingCanvas } from "../IUpdatingCanvas";
import { CanvasOperation } from "./CanvasOperations";
import { ImageResult, ImageCache } from "./ImageCache";
import { ThreeDisposer } from "../ThreeDisposer";

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
    this.cbs.forEach((cb) => cb());
  }

  dispose() {
    this.cbs = [];
    this.canvas!.title = `Disposed, mat ${this._material?.uuid} texture ${this._texture?.uuid}`;
    this.canvas = undefined;
    this.context = undefined;

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
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;

    const context = this.canvas.getContext("2d");
    if (context === null) {
      throw "Invalid Context";
    }
    this.context = context;

    this.render();
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
      this._texture = new Texture(
        this.canvas,
        UVMapping,
        ClampToEdgeWrapping,
        ClampToEdgeWrapping,
        LinearFilter,
        LinearFilter,
      );
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
  });

  public static materialDisposer = new ThreeDisposer<Material>((material) => {
    material.dispose();
  });

  public static geoDisposer = new ThreeDisposer<BufferGeometry>((geometry) => {
    geometry.dispose();
  });
}
