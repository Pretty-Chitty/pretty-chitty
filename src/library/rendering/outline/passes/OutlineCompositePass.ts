import {
  ShaderMaterial,
  WebGLRenderer,
  WebGLRenderTarget,
  NormalBlending,
} from "three";
import { Pass } from "../types";
import { FullScreenQuad } from "../FullScreenQuad";

export class OutlineCompositePass extends Pass {
  overlayMaterial: ShaderMaterial;
  private fsQuad: FullScreenQuad;

  edgeStrength = 3.0;
  edgeGlow = 0.0;
  usePatternTexture = false;
  patternTexture: any = null;

  clear = false;
  needsSwap = false;

  constructor() {
    super();
    this.overlayMaterial = this.createOverlayMaterial();
    this.fsQuad = new FullScreenQuad(this.overlayMaterial);
  }

  setMaskTexture(texture: any): void {
    this.overlayMaterial.uniforms["maskTexture"].value = texture;
  }

  setEdgeTexture1(texture: any): void {
    this.overlayMaterial.uniforms["edgeTexture1"].value = texture;
  }

  setEdgeTexture2(texture: any): void {
    this.overlayMaterial.uniforms["edgeTexture2"].value = texture;
  }

  setPatternTexture(texture: any): void {
    this.patternTexture = texture;
    this.overlayMaterial.uniforms["patternTexture"].value = texture;
  }

  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget): void {
    // Update uniforms
    this.overlayMaterial.uniforms["edgeStrength"].value = this.edgeStrength;
    this.overlayMaterial.uniforms["edgeGlow"].value = this.edgeGlow;
    this.overlayMaterial.uniforms["usePatternTexture"].value = this.usePatternTexture;
    this.overlayMaterial.uniforms["patternTexture"].value = this.patternTexture;

    renderer.setRenderTarget(writeBuffer);
    if (this.clear) renderer.clear();
    this.fsQuad.render(renderer);
  }

  private createOverlayMaterial(): ShaderMaterial {
    return new ShaderMaterial({
      uniforms: {
        maskTexture: { value: null },
        edgeTexture1: { value: null },
        edgeTexture2: { value: null },
        patternTexture: { value: null },
        edgeStrength: { value: 1.0 },
        edgeGlow: { value: 1.0 },
        usePatternTexture: { value: false },
      },
      vertexShader: `varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`,
      fragmentShader: `varying vec2 vUv;
        uniform sampler2D maskTexture;
        uniform sampler2D edgeTexture1;
        uniform sampler2D edgeTexture2;
        uniform sampler2D patternTexture;
        uniform float edgeStrength;
        uniform float edgeGlow;
        uniform bool usePatternTexture;

        void main() {
          vec4 edgeValue1 = texture2D(edgeTexture1, vUv);
          vec4 edgeValue2 = texture2D(edgeTexture2, vUv);
          vec4 maskColor = texture2D(maskTexture, vUv);
          vec4 patternColor = texture2D(patternTexture, 6.0 * vUv);
          float visibilityFactor = 1.0 - maskColor.g > 0.0 ? 1.0 : 0.5;
          vec4 edgeValue = edgeValue1 + edgeValue2 * edgeGlow;
          vec4 finalColor = edgeStrength * maskColor.r * edgeValue;
          if(usePatternTexture)
            finalColor += + visibilityFactor * (1.0 - maskColor.r) * (1.0 - patternColor.r);
          gl_FragColor = finalColor;
        }`,
      blending: NormalBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
  }

  dispose(): void {
    this.overlayMaterial.dispose();
    this.fsQuad.dispose();
  }
}