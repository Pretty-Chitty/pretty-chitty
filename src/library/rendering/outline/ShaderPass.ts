import {
  ShaderMaterial,
  UniformsUtils,
  WebGLRenderer,
  WebGLRenderTarget,
  IUniform,
} from "three";
import { Pass } from "./types";
import { FullScreenQuad } from "./FullScreenQuad";
import { CopyShader } from "./shaders";

export class ShaderPass extends Pass {
  private textureID: string;
  uniforms: Record<string, IUniform>;
  material: ShaderMaterial;
  private fsQuad: FullScreenQuad;

  constructor(shader: ShaderMaterial | typeof CopyShader, textureID?: string) {
    super();
    this.textureID = textureID ?? "tDiffuse";

    if (shader instanceof ShaderMaterial) {
      this.uniforms = shader.uniforms as Record<string, IUniform>;
      this.material = shader;
    } else if (shader) {
      this.uniforms = UniformsUtils.clone(shader.uniforms);
      this.material = new ShaderMaterial({
        defines: Object.assign({}, (shader as any).defines),
        uniforms: this.uniforms,
        vertexShader: (shader as any).vertexShader,
        fragmentShader: (shader as any).fragmentShader,
      });
    } else {
      throw new Error("ShaderPass requires a shader");
    }

    this.fsQuad = new FullScreenQuad(this.material);
  }

  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget): void {
    if (this.uniforms[this.textureID]) {
      this.uniforms[this.textureID].value = readBuffer.texture;
    }

    this.fsQuad.material = this.material;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
      this.fsQuad.render(renderer);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
      this.fsQuad.render(renderer);
    }
  }
}