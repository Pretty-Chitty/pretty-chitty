import type {
  WebGLRenderer,
  WebGLRenderTarget,
  PerspectiveCamera,
  OrthographicCamera,
} from "three";

export type Camera = PerspectiveCamera | OrthographicCamera;

export abstract class Pass {
  enabled = true;
  needsSwap = true;
  clear = false;
  renderToScreen = false;

  setSize(_width: number, _height: number): void {
    // optional
  }

  abstract render(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ): void;
}