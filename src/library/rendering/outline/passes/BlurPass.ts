import {
  ShaderMaterial,
  WebGLRenderer,
  WebGLRenderTarget,
  Vector2,
} from "three";
import { Pass } from "../types";
import { FullScreenQuad } from "../FullScreenQuad";

export enum BlurDirection {
  HORIZONTAL = "horizontal",
  VERTICAL = "vertical"
}

export class BlurPass extends Pass {
  separableBlurMaterial: ShaderMaterial;
  private fsQuad: FullScreenQuad;

  edgeThickness = 1.0;
  direction = BlurDirection.HORIZONTAL;

  static readonly DirectionX = new Vector2(1.0, 0.0);
  static readonly DirectionY = new Vector2(0.0, 1.0);

  clear = true;
  needsSwap = false;

  constructor(maxRadius: number = 4) {
    super();
    this.separableBlurMaterial = this.createSeparableBlurMaterial(maxRadius);
    this.fsQuad = new FullScreenQuad(this.separableBlurMaterial);
  }

  setColorTexture(texture: any): void {
    this.separableBlurMaterial.uniforms["colorTexture"].value = texture;
  }

  setTextureSize(width: number, height: number): void {
    (this.separableBlurMaterial.uniforms["texSize"].value as Vector2).set(width, height);
  }

  setKernelRadius(radius: number): void {
    this.separableBlurMaterial.uniforms["kernelRadius"].value = radius;
  }

  setDirection(direction: BlurDirection): void {
    this.direction = direction;
    const directionVector = direction === BlurDirection.HORIZONTAL ? BlurPass.DirectionX : BlurPass.DirectionY;
    (this.separableBlurMaterial.uniforms["direction"].value as Vector2).copy(directionVector);
  }

  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget): void {
    // Update kernel radius based on edge thickness
    this.setKernelRadius(this.edgeThickness);

    renderer.setRenderTarget(writeBuffer);
    if (this.clear) renderer.clear();
    this.fsQuad.render(renderer);
  }

  private createSeparableBlurMaterial(maxRadius: number): ShaderMaterial {
    return new ShaderMaterial({
      defines: {
        MAX_RADIUS: maxRadius,
      },
      uniforms: {
        colorTexture: { value: null },
        texSize: { value: new Vector2(0.5, 0.5) },
        direction: { value: new Vector2(0.5, 0.5) },
        kernelRadius: { value: 1.0 },
      },
      vertexShader: `varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`,
      fragmentShader: `#include <common>
        varying vec2 vUv;
        uniform sampler2D colorTexture;
        uniform vec2 texSize;
        uniform vec2 direction;
        uniform float kernelRadius;

        float gaussianPdf(in float x, in float sigma) {
          return 0.39894 * exp( -0.5 * x * x/( sigma * sigma))/sigma;
        }
        void main() {
          vec2 invSize = 1.0 / texSize;
          float weightSum = gaussianPdf(0.0, kernelRadius);
          vec4 diffuseSum = texture2D( colorTexture, vUv) * weightSum;
          vec2 delta = direction * invSize * kernelRadius/float(MAX_RADIUS);
          vec2 uvOffset = delta;
          for( int i = 1; i <= MAX_RADIUS; i ++ ) {
            float w = gaussianPdf(uvOffset.x, kernelRadius);
            vec4 sample1 = texture2D( colorTexture, vUv + uvOffset);
            vec4 sample2 = texture2D( colorTexture, vUv - uvOffset);
            diffuseSum += ((sample1 + sample2) * w);
            weightSum += (2.0 * w);
            uvOffset += delta;
          }
          gl_FragColor = diffuseSum/weightSum;
        }`,
    });
  }

  dispose(): void {
    this.separableBlurMaterial.dispose();
    this.fsQuad.dispose();
  }
}