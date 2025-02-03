import {
  Texture,
  UVMapping,
  ClampToEdgeWrapping,
  LinearFilter,
  MeshPhongMaterial,
  Material,
  SRGBColorSpace,
} from "three";
import { IUpdatingCanvas } from "../IUpdatingCanvas";
import { CanvasOperation } from "./CanvasOperations";
import { ImageResult, ImageCache } from "./ImageCache";

export type RenderBounds = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type TexturesUsedBy = {
  id: string;
  uuids: Set<string>;
  cb: () => void;
};
type TextureReferences = {
  uuid: string;
  ids: Set<string>;
  unusedSince: number;
  canvas: CanvasStack;
};

export class CanvasStack implements IUpdatingCanvas {
  public canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private _texture?: Texture;
  private cbs: Array<() => void> = [];

  private loadedUrls = new Set<string>();

  private static imageCache = new ImageCache(50); // 50? Is that good? No idea.

  /** @internal */
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
        result.isLoaded.on(() => {
          this.render();
          if (this._texture) {
            this._texture.needsUpdate = true;
            CanvasStack.notifyChange(this._texture.uuid);
          }
        });
      }
      return undefined;
    }
    return result;
  }

  /** @internal */
  render(): void {
    this.context.clearRect(0, 0, this.width, this.height);
    this.operation.render(this.context, { x: 0, y: 0, w: this.width, h: this.height }, this.loadUrl.bind(this));
    this.cbs.forEach((cb) => cb());
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

  get material(): Material {
    return new MeshPhongMaterial({
      map: this.texture,
    });
  }

  get texture(): Texture {
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

      CanvasStack.texturesReferences[this._texture.uuid] = {
        uuid: this._texture.uuid,
        ids: new Set<string>(),
        unusedSince: Date.now(),
        canvas: this,
      };
    }
    return this._texture;
  }

  // necessary for reference counting
  private static texturesUsedBy: { [id: string]: TexturesUsedBy } = {};
  private static texturesReferences: { [uuid: string]: TextureReferences } = {};

  private static notifyChange(uuid: string) {
    const ref = this.texturesReferences[uuid];
    if (ref) {
      ref.ids.forEach((id) => {
        const idRef = this.texturesUsedBy[id];
        idRef.cb();
      });
    }
  }

  public static markTexturesUsed(id: string, uuids: Set<string>, cb: () => void) {
    const existing = this.texturesUsedBy[id];
    const now = Date.now();
    if (existing) {
      existing.uuids.forEach((uuid) => {
        const ref = this.texturesReferences[uuid];
        if (ref) {
          ref.ids.delete(id);
          if (ref.ids.size === 0) {
            ref.unusedSince = now;
          }
        }
      });
    }

    this.texturesUsedBy[id] = {
      id,
      uuids,
      cb,
    };

    uuids.forEach((uuid) => {
      const ref = this.texturesReferences[uuid];
      if (ref) {
        ref.ids.add(id);
      }
    });

    // now check for any textures we should remove
    Object.values(this.texturesReferences).forEach((ref) => {
      if (ref.ids.size === 0 && ref.unusedSince < now - 5000) {
        if (ref.canvas._texture) {
          ref.canvas._texture.dispose();
        }
        delete this.texturesReferences[ref.uuid];
      }
    });
  }
}
