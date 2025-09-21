import {
  ShaderMaterial,
  WebGLRenderer,
  WebGLRenderTarget,
  Vector2,
  Vector3,
  Color,
} from "three";
import { Pass } from "../types";
import { FullScreenQuad } from "../FullScreenQuad";

export class EdgeDetectionPass extends Pass {
  edgeDetectionMaterial: ShaderMaterial;
  private fsQuad: FullScreenQuad;

  visibleEdgeColor = new Color(1, 1, 1);
  pulsePeriod = 0;
  private tempPulseColor = new Color();

  clear = true;
  needsSwap = false;

  constructor() {
    super();
    this.edgeDetectionMaterial = this.createEdgeDetectionMaterial();
    this.fsQuad = new FullScreenQuad(this.edgeDetectionMaterial);
  }

  setMaskTexture(texture: any): void {
    this.edgeDetectionMaterial.uniforms["maskTexture"].value = texture;
  }

  setTextureSize(width: number, height: number): void {
    (this.edgeDetectionMaterial.uniforms["texSize"].value as Vector2).set(width, height);
  }

  private updatePulseColor(): void {
    this.tempPulseColor.copy(this.visibleEdgeColor);

    if (this.pulsePeriod > 0) {
      const scalar = (1 + 0.25) / 2 + (Math.cos((performance.now() * 0.01) / this.pulsePeriod) * (1.0 - 0.25)) / 2;
      this.tempPulseColor.multiplyScalar(scalar);
    }
  }

  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget): void {
    this.updatePulseColor();

    (this.edgeDetectionMaterial.uniforms["visibleEdgeColor"].value as Vector3).set(
      this.tempPulseColor.r,
      this.tempPulseColor.g,
      this.tempPulseColor.b,
    );

    renderer.setRenderTarget(writeBuffer);
    if (this.clear) renderer.clear();
    this.fsQuad.render(renderer);
  }

  private createEdgeDetectionMaterial(): ShaderMaterial {
    return new ShaderMaterial({
      uniforms: {
        maskTexture: { value: null },
        texSize: { value: new Vector2(0.5, 0.5) },
        visibleEdgeColor: { value: new Vector3(1.0, 1.0, 1.0) },
      },
      vertexShader: `varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`,
      fragmentShader: `varying vec2 vUv;
        uniform sampler2D maskTexture;
        uniform vec2 texSize;
        uniform vec3 visibleEdgeColor;

        void main() {
          vec2 invSize = 1.0 / texSize;
          vec4 uvOffset = vec4(1.0, 0.0, 0.0, 1.0) * vec4(invSize, invSize);
          vec4 c1 = texture2D( maskTexture, vUv + uvOffset.xy);
          vec4 c2 = texture2D( maskTexture, vUv - uvOffset.xy);
          vec4 c3 = texture2D( maskTexture, vUv + uvOffset.yw);
          vec4 c4 = texture2D( maskTexture, vUv - uvOffset.yw);
          float diff1 = (c1.r - c2.r)*0.5;
          float diff2 = (c3.r - c4.r)*0.5;
          float d = length( vec2(diff1, diff2) );
          float a1 = min(c1.g, c2.g);
          float a2 = min(c3.g, c4.g);
          float visibilityFactor = min(a1, a2);
          if (1.0 - visibilityFactor > 0.001) {
            gl_FragColor = vec4(visibleEdgeColor, 1.0) * vec4(d);
          } else {
            gl_FragColor = vec4(visibleEdgeColor, 1.0) * vec4(0);
          }
        }`,
    });
  }

  dispose(): void {
    this.edgeDetectionMaterial.dispose();
    this.fsQuad.dispose();
  }
}