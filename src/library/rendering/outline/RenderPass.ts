import { Scene, ShaderMaterial, Color, WebGLRenderer, WebGLRenderTarget, PerspectiveCamera } from "three";
import { Pass } from "./types";

// Utility to ensure correct WebGL state for rendering
function ensureCorrectRenderState(renderer: WebGLRenderer, forceDepthTest: boolean = false) {
  const context = renderer.getContext();

  // Always ensure correct depth testing state
  context.enable(context.DEPTH_TEST);
  context.depthFunc(context.LESS);
  context.depthMask(true);

  if (forceDepthTest) {
    // For transparent mode, ensure depth buffer is fresh
    renderer.clearDepth();
  }
}

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

    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);

    if (this.clear) {
      renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
    }

    // Ensure correct render state before every render call
    ensureCorrectRenderState(renderer, this.clearDepth);

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
