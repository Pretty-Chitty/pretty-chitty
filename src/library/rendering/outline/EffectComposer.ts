import {
  WebGLRenderer,
  WebGLRenderTarget,
  LinearFilter,
  RGBAFormat,
  Vector2,
  Clock,
  Color,
  DepthTexture,
  UnsignedShortType,
  FloatType,
} from "three";
import { Camera, Pass } from "./types";
import { ShaderPass } from "./ShaderPass";
import { CopyShader } from "./shaders";
import { SceneWrapper } from "./SceneWrapper";

type RTParams = ConstructorParameters<typeof WebGLRenderTarget>[2];

let COUNTER = 0;
export class EffectComposer {
  private renderer: WebGLRenderer;

  private _pixelRatio: number;
  private _width: number;
  private _height: number;

  private _rtParams: RTParams;

  renderTarget: WebGLRenderTarget;
  renderTarget2: WebGLRenderTarget;

  renderToScreen = true;
  passes: Pass[] = [];

  private copyPass: ShaderPass;
  private clock = new Clock();

  private textureId: string;

  constructor(renderer: WebGLRenderer, width: number, height: number) {
    this.renderer = renderer;

    this.textureId = `composer${++COUNTER}`;

    this._rtParams = {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      format: RGBAFormat,
      stencilBuffer: false,
      depthBuffer: true,
      generateMipmaps: false,
    };

    this._pixelRatio = renderer.getPixelRatio();
    this._width = width;
    this._height = height;

    const renderTarget = new WebGLRenderTarget(
      Math.max(1, Math.floor(this._width * this._pixelRatio)),
      Math.max(1, Math.floor(this._height * this._pixelRatio)),
      this._rtParams,
    );
    renderTarget.texture.name = `EffectComposer.rt1.${this.textureId}`;
    renderTarget.texture.generateMipmaps = false;

    // Create and attach depth texture for outline pass access
    renderTarget.depthTexture = new DepthTexture(
      Math.max(1, Math.floor(this._width * this._pixelRatio)),
      Math.max(1, Math.floor(this._height * this._pixelRatio)),
    );
    if (renderer.capabilities.isWebGL2) renderTarget.depthTexture.type = FloatType;

    this.renderTarget = renderTarget;

    // Create second render target for ping-pong rendering
    this.renderTarget2 = renderTarget.clone();
    this.renderTarget2.texture.name = `EffectComposer.rt2.${this.textureId}`;
    this.renderTarget2.texture.generateMipmaps = false;

    // Create depth texture for second render target too
    this.renderTarget2.depthTexture = new DepthTexture(
      Math.max(1, Math.floor(this._width * this._pixelRatio)),
      Math.max(1, Math.floor(this._height * this._pixelRatio)),
    );
    if (renderer.capabilities.isWebGL2) this.renderTarget2.depthTexture.type = FloatType;

    this.copyPass = new ShaderPass(CopyShader, this.textureId);
  }

  addPass(pass: Pass): void {
    this.passes.push(pass);
    pass.setSize(this._width, this._height);
  }

  private isLastEnabledPass(passIndex: number): boolean {
    for (let i = passIndex + 1; i < this.passes.length; i++) {
      if (this.passes[i].enabled) return false;
    }
    return true;
  }

  render(sceneWrapper: SceneWrapper, camera: Camera): void {
    const composerStart = performance.now();

    const currentRenderTarget = this.renderer.getRenderTarget();
    const currentClearColor = this.renderer.getClearColor(new Color());
    const currentClearAlpha = this.renderer.getClearAlpha();
    const currentAutoClear = this.renderer.autoClear;

    let readBuffer = this.renderTarget;
    let writeBuffer = this.renderTarget2;

    const passTimes: number[] = [];

    for (let i = 0, il = this.passes.length; i < il; i++) {
      const pass = this.passes[i];
      if (!pass.enabled) continue;

      const passStart = performance.now();

      pass.sceneWrapper = sceneWrapper;
      pass.camera = camera;
      pass.renderToScreen = this.renderToScreen && this.isLastEnabledPass(i);
      pass.render(this.renderer, writeBuffer, readBuffer, false);

      const passTime = performance.now() - passStart;
      passTimes.push(passTime);

      // Swap buffers for next pass (ping-pong)
      if (pass.needsSwap) {
        const tmp = readBuffer;
        readBuffer = writeBuffer;
        writeBuffer = tmp;
      }
    }

    this.renderer.setRenderTarget(currentRenderTarget);
    this.renderer.setClearColor(currentClearColor, currentClearAlpha);
    this.renderer.autoClear = currentAutoClear;

    const totalComposerTime = performance.now() - composerStart;

    // Log timing occasionally
    if (Math.random() < 0.016) {
      // ~1/60 chance
      console.log(`EffectComposer Timing (${totalComposerTime.toFixed(2)}ms total):`);
      passTimes.forEach((time, index) => {
        const passName = this.passes.filter((p) => p.enabled)[index]?.constructor?.name || `Pass${index}`;
        console.log(`  Pass ${index} (${passName}): ${time.toFixed(2)}ms`);
      });
    }
  }

  setSize(width: number, height: number): void {
    this._width = Math.max(1, Math.floor(width));
    this._height = Math.max(1, Math.floor(height));

    const effectiveWidth = this._width * this._pixelRatio;
    const effectiveHeight = this._height * this._pixelRatio;

    this.renderTarget.setSize(effectiveWidth, effectiveHeight);
    this.renderTarget2.setSize(effectiveWidth, effectiveHeight);

    // Update depth texture size for both render targets
    if (this.renderTarget.depthTexture) {
      this.renderTarget.depthTexture.dispose();
      this.renderTarget.depthTexture = new DepthTexture(effectiveWidth, effectiveHeight);
      if (this.renderer.capabilities.isWebGL2) this.renderTarget.depthTexture.type = FloatType;
    }

    if (this.renderTarget2.depthTexture) {
      this.renderTarget2.depthTexture.dispose();
      this.renderTarget2.depthTexture = new DepthTexture(effectiveWidth, effectiveHeight);
      if (this.renderer.capabilities.isWebGL2) this.renderTarget2.depthTexture.type = FloatType;
    }

    for (let i = 0; i < this.passes.length; i++) {
      this.passes[i].setSize(effectiveWidth, effectiveHeight);
    }
  }

  dispose() {
    this.renderTarget.dispose();
    this.renderTarget2.dispose();
  }
}
