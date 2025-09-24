import { PerspectiveCamera, type WebGLRenderer, type WebGLRenderTarget, type OrthographicCamera } from "three";
import { SceneWrapper } from "./SceneWrapper";

export type Camera = PerspectiveCamera | OrthographicCamera;

export abstract class Pass {
  enabled = true;
  needsSwap = true;
  clear = false;
  renderToScreen = false;

  sceneWrapper: SceneWrapper = new SceneWrapper();
  camera: Camera = new PerspectiveCamera();

  setSize(_width: number, _height: number): void {
    // optional
  }

  abstract render(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
    maskActive: boolean,
  ): void;
}
