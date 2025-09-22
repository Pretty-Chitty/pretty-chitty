import { Scene, ShaderMaterial, Color, WebGLRenderer, WebGLRenderTarget, PerspectiveCamera } from "three";
import { Pass, Camera } from "./types";

export class RenderPass extends Pass {
  public scene: Scene;
  public camera: Camera;
  public overrideMaterial?: ShaderMaterial | null;
  public clearColor?: Color | number | string;
  public clearAlpha: number;

  clear = true;
  clearDepth = false;
  needsSwap = false;

  constructor(
    scene?: Scene,
    camera?: Camera,
    overrideMaterial?: ShaderMaterial | null,
    clearColor?: Color | number | string,
    clearAlpha?: number,
  ) {
    super();
    this.scene = scene ?? new Scene();
    this.camera = camera ?? new PerspectiveCamera();
    this.overrideMaterial = overrideMaterial ?? undefined;
    this.clearColor = clearColor;
    this.clearAlpha = clearAlpha !== undefined ? clearAlpha : 0;
  }

  render(renderer: WebGLRenderer, _writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget): void {
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    let oldClearColor: number | undefined;
    let oldClearAlpha: number | undefined;
    let oldOverrideMaterial: any;

    if (this.overrideMaterial !== undefined) {
      oldOverrideMaterial = this.scene.overrideMaterial;
      this.scene.overrideMaterial = this.overrideMaterial ?? null;
    }

    if (this.clearColor !== undefined) {
      oldClearColor = renderer.getClearColor(new Color()).getHex();
      oldClearAlpha = renderer.getClearAlpha();
      renderer.setClearColor(this.clearColor as any, this.clearAlpha);
    }

    if (this.clearDepth) {
      renderer.clearDepth();
    }

    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    if (this.clear) renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
    renderer.render(this.scene, this.camera);

    if (this.clearColor !== undefined) {
      renderer.setClearColor(oldClearColor!, oldClearAlpha!);
    }

    if (this.overrideMaterial !== undefined) {
      this.scene.overrideMaterial = oldOverrideMaterial;
    }

    renderer.autoClear = oldAutoClear;
  }
}
