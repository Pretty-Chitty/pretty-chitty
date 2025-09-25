import { Scene, ShaderMaterial, Color, WebGLRenderer, WebGLRenderTarget, PerspectiveCamera } from "three";
import { Pass } from "./types";

export class RenderPass extends Pass {
  public overrideMaterial?: ShaderMaterial | null;
  public clearColor?: Color | number | string;
  public clearAlpha: number = 1;

  clear = true;
  clearDepth = false;
  needsSwap = false;

  constructor() {
    super();
  }

  render(renderer: WebGLRenderer, _writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget): void {
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    let oldClearColor: number | undefined;
    let oldClearAlpha: number | undefined;
    let oldOverrideMaterial: any;

    if (this.overrideMaterial !== undefined) {
      oldOverrideMaterial = this.sceneWrapper.scene.overrideMaterial;
      this.sceneWrapper.scene.overrideMaterial = this.overrideMaterial ?? null;
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
    renderer.render(this.sceneWrapper.scene, this.camera);

    if (this.clearColor !== undefined) {
      renderer.setClearColor(oldClearColor!, oldClearAlpha!);
    }

    if (this.overrideMaterial !== undefined) {
      this.sceneWrapper.scene.overrideMaterial = oldOverrideMaterial;
    }

    renderer.autoClear = oldAutoClear;
  }
}
