import { WebGLRenderer, WebGLRenderTarget, LinearFilter, RGBAFormat, Vector2, Clock, Color } from "three";
import { Pass } from "./types";
import { ShaderPass } from "./ShaderPass";
import { CopyShader } from "./shaders";
import { MaskPass, ClearMaskPass } from "./MaskPass";

type RTParams = ConstructorParameters<typeof WebGLRenderTarget>[2];

let COUNTER = 0;
export class EffectComposer {
  private renderer: WebGLRenderer;

  private _pixelRatio: number;
  private _width: number;
  private _height: number;

  private _rtParams: RTParams;

  renderTarget: WebGLRenderTarget;

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
    } else {
      this._rtParams = {
        minFilter: renderTarget.texture.minFilter,
        magFilter: renderTarget.texture.magFilter,
        format: renderTarget.texture.format,
        stencilBuffer: renderTarget.stencilBuffer,
      } as any;

      this._pixelRatio = 1;
      this._width = renderTarget.width;
      this._height = renderTarget.height;
    }

    this.renderTarget = renderTarget;

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

    this.renderTarget = new WebGLRenderTarget(effectiveWidth, effectiveHeight, this._rtParams);
    this.renderTarget.texture.name = `EffectComposer.rt.${this.textureId}`;

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

  render(deltaTime?: number): void {
    const dt = deltaTime ?? this.clock.getDelta();
    const currentRenderTarget = this.renderer.getRenderTarget();
    const currentClearColor = this.renderer.getClearColor(new Color());
    const currentClearAlpha = this.renderer.getClearAlpha();
    const currentAutoClear = this.renderer.autoClear;

    let maskActive = false;

    for (let i = 0, il = this.passes.length; i < il; i++) {
      const pass = this.passes[i];
      if (!pass.enabled) continue;

      pass.renderToScreen = this.renderToScreen && this.isLastEnabledPass(i);
      pass.render(this.renderer, this.renderTarget, this.renderTarget, dt, maskActive);

      if (pass instanceof MaskPass) {
        maskActive = true;
      } else if (pass instanceof ClearMaskPass) {
        maskActive = false;
      }
    }

    this.renderer.setRenderTarget(currentRenderTarget);
    this.renderer.setClearColor(currentClearColor, currentClearAlpha);
    this.renderer.autoClear = currentAutoClear;
  }

  reset(renderTarget?: WebGLRenderTarget): void {
    if (!renderTarget) {
      const size = this.renderer.getSize(new Vector2());
      this._pixelRatio = this.renderer.getPixelRatio();
      this._width = size.width;
      this._height = size.height;

      renderTarget = this.renderTarget1.clone();
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
      } as any;

      this._pixelRatio = 1;
      this._width = renderTarget.width;
      this._height = renderTarget.height;
    }

    this.renderTarget.dispose();
    this.renderTarget = renderTarget;
  }

  setSize(width: number, height: number): void {
    this._width = Math.max(1, Math.floor(width));
    this._height = Math.max(1, Math.floor(height));

    const effectiveWidth = this._width * this._pixelRatio;
    const effectiveHeight = this._height * this._pixelRatio;

    this.renderTarget.setSize(effectiveWidth, effectiveHeight);

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
  }
}
