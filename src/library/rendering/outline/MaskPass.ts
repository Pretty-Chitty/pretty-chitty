import {
  Scene,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { Pass, Camera } from "./types";

export class MaskPass extends Pass {
  private scene: Scene;
  private camera: Camera;

  clear = true;
  needsSwap = false;
  inverse = false;

  constructor(scene: Scene, camera: Camera) {
    super();
    this.scene = scene;
    this.camera = camera;
  }

  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget): void {
    const context = renderer.getContext();
    const state = renderer.state as any;

    state.buffers.color.setMask(false);
    state.buffers.depth.setMask(false);

    state.buffers.color.setLocked(true);
    state.buffers.depth.setLocked(true);

    const writeValue = this.inverse ? 0 : 1;
    const clearValue = this.inverse ? 1 : 0;

    state.buffers.stencil.setTest(true);
    state.buffers.stencil.setOp(context.REPLACE, context.REPLACE, context.REPLACE);
    state.buffers.stencil.setFunc(context.ALWAYS, writeValue, 0xffffffff);
    state.buffers.stencil.setClear(clearValue);
    state.buffers.stencil.setLocked(true);

    renderer.setRenderTarget(readBuffer);
    if (this.clear) renderer.clear();
    renderer.render(this.scene, this.camera);

    renderer.setRenderTarget(writeBuffer);
    if (this.clear) renderer.clear();
    renderer.render(this.scene, this.camera);

    state.buffers.color.setLocked(false);
    state.buffers.depth.setLocked(false);

    state.buffers.stencil.setLocked(false);
    state.buffers.stencil.setFunc(context.EQUAL, 1, 0xffffffff);
    state.buffers.stencil.setOp(context.KEEP, context.KEEP, context.KEEP);
    state.buffers.stencil.setLocked(true);
  }
}

export class ClearMaskPass extends Pass {
  needsSwap = false;

  render(renderer: WebGLRenderer): void {
    const state = renderer.state as any;
    state.buffers.stencil.setLocked(false);
    state.buffers.stencil.setTest(false);
  }
}