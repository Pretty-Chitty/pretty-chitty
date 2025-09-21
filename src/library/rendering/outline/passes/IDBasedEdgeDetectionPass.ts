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

export class IDBasedEdgeDetectionPass extends Pass {
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
      fragmentShader: `
        uniform sampler2D maskTexture;
        uniform vec2 texSize;
        uniform vec3 visibleEdgeColor;
        varying vec2 vUv;

        // Compare two RGB colors (object IDs) with tolerance
        bool colorsMatch(vec3 color1, vec3 color2) {
          vec3 diff = abs(color1 - color2);
          return diff.r < 0.01 && diff.g < 0.01 && diff.b < 0.01;
        }

        // Check if a color represents a selected object (non-black)
        bool isSelected(vec3 color) {
          return color.r > 0.01 || color.g > 0.01 || color.b > 0.01;
        }

        void main() {
          vec2 invSize = 1.0 / texSize;

          // Sample the center pixel
          vec4 center = texture2D(maskTexture, vUv);

          // Sample neighboring pixels
          vec4 right = texture2D(maskTexture, vUv + vec2(invSize.x, 0.0));
          vec4 left = texture2D(maskTexture, vUv - vec2(invSize.x, 0.0));
          vec4 up = texture2D(maskTexture, vUv + vec2(0.0, invSize.y));
          vec4 down = texture2D(maskTexture, vUv - vec2(0.0, invSize.y));

          // Check if we're on a selected object
          bool centerIsSelected = isSelected(center.rgb);

          // Detect edges by checking if neighboring pixels have different IDs
          bool isEdge = false;

          if (centerIsSelected) {
            // We're on a selected object - check if any neighbor is different
            if (!colorsMatch(center.rgb, right.rgb) ||
                !colorsMatch(center.rgb, left.rgb) ||
                !colorsMatch(center.rgb, up.rgb) ||
                !colorsMatch(center.rgb, down.rgb)) {
              isEdge = true;
            }
          }

          if (isEdge) {
            gl_FragColor = vec4(visibleEdgeColor, 1.0);
          } else {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
          }
        }`,
    });
  }

  dispose(): void {
    this.edgeDetectionMaterial.dispose();
    this.fsQuad.dispose();
  }
}