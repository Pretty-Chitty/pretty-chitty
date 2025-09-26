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

  constructor(renderer: WebGLRenderer, renderTarget?: WebGLRenderTarget) {
    this.renderer = renderer;

    this.textureId = `composer${++COUNTER}`;

    if (!renderTarget) {
      this._rtParams = {
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        format: RGBAFormat,
        stencilBuffer: false,
        depthBuffer: true,
        generateMipmaps: false,
      };

      const size = renderer.getSize(new Vector2());
      this._pixelRatio = renderer.getPixelRatio();
      this._width = size.width;
      this._height = size.height;

      renderTarget = new WebGLRenderTarget(
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
      renderTarget.depthTexture.type = UnsignedShortType;
    } else {
      this._rtParams = {
        minFilter: renderTarget.texture.minFilter,
        magFilter: renderTarget.texture.magFilter,
        format: renderTarget.texture.format,
        stencilBuffer: renderTarget.stencilBuffer,
        depthBuffer: renderTarget.depthBuffer,
      } as any;

      this._pixelRatio = 1;
      this._width = renderTarget.width;
      this._height = renderTarget.height;
    }

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
    this.renderTarget2.depthTexture.type = UnsignedShortType;

    this.copyPass = new ShaderPass(CopyShader, this.textureId);
  }

  setRenderer(
    renderer: WebGLRenderer,
    opts: {
      adoptSizeFromRenderer?: boolean;
      adoptPixelRatio?: boolean;
      preserveLogicalSize?: boolean;
    } = {},
  ): void {
    const { adoptSizeFromRenderer = true, adoptPixelRatio = true, preserveLogicalSize = false } = opts;

    this.renderer = renderer;

    if (adoptPixelRatio) this._pixelRatio = Math.max(0.1, renderer.getPixelRatio());
    if (adoptSizeFromRenderer && !preserveLogicalSize) {
      const size = renderer.getSize(new Vector2());
      this._width = size.width;
      this._height = size.height;
    }

    const effectiveWidth = Math.max(1, Math.floor(this._width * this._pixelRatio));
    const effectiveHeight = Math.max(1, Math.floor(this._height * this._pixelRatio));

    this.renderTarget.dispose();
    this.renderTarget2.dispose();

    this.renderTarget = new WebGLRenderTarget(effectiveWidth, effectiveHeight, this._rtParams);
    this.renderTarget.texture.name = `EffectComposer.rt.${this.textureId}`;

    // Create and attach depth texture for outline pass access
    this.renderTarget.depthTexture = new DepthTexture(effectiveWidth, effectiveHeight);
    this.renderTarget.depthTexture.type = UnsignedShortType;

    // Create second render target for ping-pong rendering
    this.renderTarget2 = new WebGLRenderTarget(effectiveWidth, effectiveHeight, this._rtParams);
    this.renderTarget2.texture.name = `EffectComposer.rt2.${this.textureId}`;
    this.renderTarget2.depthTexture = new DepthTexture(effectiveWidth, effectiveHeight);
    this.renderTarget2.depthTexture.type = UnsignedShortType;

    for (let i = 0; i < this.passes.length; i++) {
      this.passes[i].setSize(effectiveWidth, effectiveHeight);
    }
  }

  addPass(pass: Pass): void {
    this.passes.push(pass);
    pass.setSize(this._width * this._pixelRatio, this._height * this._pixelRatio);
  }

  insertPass(pass: Pass, index: number): void {
    this.passes.splice(index, 0, pass);
    pass.setSize(this._width * this._pixelRatio, this._height * this._pixelRatio);
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

    let maskActive = false;

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
      pass.render(this.renderer, writeBuffer, readBuffer, maskActive);

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
    if (Math.random() < 0.016) { // ~1/60 chance
      console.log(`EffectComposer Timing (${totalComposerTime.toFixed(2)}ms total):`);
      passTimes.forEach((time, index) => {
        const passName = this.passes.filter(p => p.enabled)[index]?.constructor?.name || `Pass${index}`;
        console.log(`  Pass ${index} (${passName}): ${time.toFixed(2)}ms`);
      });
    }
  }

  reset(renderTarget?: WebGLRenderTarget): void {
    if (!renderTarget) {
      const size = this.renderer.getSize(new Vector2());
      this._pixelRatio = this.renderer.getPixelRatio();
      this._width = size.width;
      this._height = size.height;

      renderTarget =
        this.renderTarget?.clone() ??
        new WebGLRenderTarget(
          Math.max(1, Math.floor(this._width * this._pixelRatio)),
          Math.max(1, Math.floor(this._height * this._pixelRatio)),
          this._rtParams,
        );
      renderTarget.setSize(
        Math.max(1, Math.floor(this._width * this._pixelRatio)),
        Math.max(1, Math.floor(this._height * this._pixelRatio)),
      );
    } else {
      this._rtParams = {
        minFilter: renderTarget.texture.minFilter,
        magFilter: renderTarget.texture.magFilter,
        format: renderTarget.texture.format,
        stencilBuffer: renderTarget.stencilBuffer,
        depthBuffer: renderTarget.depthBuffer,
      } as any;

      this._pixelRatio = 1;
      this._width = renderTarget.width;
      this._height = renderTarget.height;
    }

    if (this.renderTarget) {
      this.renderTarget.dispose();
    }
    this.renderTarget = renderTarget;
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
      this.renderTarget.depthTexture.type = UnsignedShortType;
    }

    if (this.renderTarget2.depthTexture) {
      this.renderTarget2.depthTexture.dispose();
      this.renderTarget2.depthTexture = new DepthTexture(effectiveWidth, effectiveHeight);
      this.renderTarget2.depthTexture.type = UnsignedShortType;
    }

    for (let i = 0; i < this.passes.length; i++) {
      this.passes[i].setSize(effectiveWidth, effectiveHeight);
    }
  }

  setPixelRatio(pixelRatio: number): void {
    this._pixelRatio = Math.max(0.1, pixelRatio);
    this.setSize(this._width, this._height);
  }

  dispose() {
    this.renderTarget.dispose();
    this.renderTarget2.dispose();
  }
}
