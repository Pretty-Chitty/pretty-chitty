import { ShaderMaterial, WebGLRenderer, WebGLRenderTarget } from "three";
import { Pass } from "../types";
import { FullScreenQuad } from "../FullScreenQuad";

/**
 * DepthOcclusionPass - Filters input buffer based on depth comparison
 *
 * Takes an input buffer (e.g., from IDBasedOutlinePass edge detection) and
 * compares its depth values against the original scene's depth buffer.
 * Clears pixels where the original scene is in front (occluding the input).
 */
export class DepthOcclusionPass extends Pass {
  private material: ShaderMaterial;
  private fsQuad: FullScreenQuad;

  clear = true;
  needsSwap = false;

  constructor() {
    super();

    this.material = this.createMaterial();
    this.fsQuad = new FullScreenQuad(this.material);
  }

  setInputTexture(texture: any): void {
    this.material.uniforms["inputTexture"].value = texture;
  }

  setIDDepthTexture(depthTexture: any): void {
    this.material.uniforms["idDepthTexture"].value = depthTexture;
  }

  setSceneDepthTexture(depthTexture: any): void {
    this.material.uniforms["sceneDepthTexture"].value = depthTexture;
  }

  setDepthTolerance(tolerance: number): void {
    this.material.uniforms["depthTolerance"].value = tolerance;
  }

  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget): void {
    renderer.setRenderTarget(writeBuffer);
    if (this.clear) renderer.clear();
    this.fsQuad.render(renderer);
  }

  private createMaterial(): ShaderMaterial {
    return new ShaderMaterial({
      uniforms: {
        inputTexture: { value: null },
        idDepthTexture: { value: null },
        sceneDepthTexture: { value: null },
        depthTolerance: { value: 0.0001 },
      },
      vertexShader: `
        varying vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D inputTexture;
        uniform sampler2D idDepthTexture;
        uniform sampler2D sceneDepthTexture;
        uniform float depthTolerance;
        varying vec2 vUv;

        void main() {
          // Sample the input texture (edge detection results)
          vec4 inputColor = texture2D(inputTexture, vUv);

          // If input is transparent, output transparent
          if (inputColor.a < 0.01) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
            return;
          }

          // Sample depth values
          float idDepth = texture2D(idDepthTexture, vUv).r;
          float sceneDepth = texture2D(sceneDepthTexture, vUv).r;

          // If scene depth is in front (less than) ID depth, the outline is occluded
          // Clear the pixel by outputting transparent
          if (sceneDepth < idDepth - depthTolerance) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
            return;
          }

          // Otherwise, pass through the input color
          gl_FragColor = inputColor;
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
  }

  dispose(): void {
    this.material.dispose();
    this.fsQuad.dispose();
  }
}
