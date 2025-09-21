import {
  ShaderMaterial,
  WebGLRenderer,
  WebGLRenderTarget,
  Vector3,
} from "three";
import { Pass } from "../types";
import { FullScreenQuad } from "../FullScreenQuad";
import { ObjectIDRenderPass } from "./ObjectIDRenderPass";

export class IDBasedMaskPass extends Pass {
  maskMaterial: ShaderMaterial;
  private fsQuad: FullScreenQuad;
  private selectedIDs = new Set<number>();

  clear = true;
  needsSwap = false;

  constructor() {
    super();
    this.maskMaterial = this.createMaskMaterial();
    this.fsQuad = new FullScreenQuad(this.maskMaterial);
  }

  setIDTexture(texture: any): void {
    this.maskMaterial.uniforms["idTexture"].value = texture;
  }

  setSelectedObjects(selectedObjects: Array<any>): void {
    this.selectedIDs.clear();

    for (const selectedObject of selectedObjects) {
      selectedObject.traverse((object: any) => {
        if (object.isMesh) {
          this.selectedIDs.add(object.id);
        }
      });
    }

    // Convert selected IDs to RGB colors and pass to shader
    this.updateSelectedIDsUniform();
  }

  private updateSelectedIDsUniform(): void {
    const maxSelectedObjects = 64; // Shader array limit
    const selectedIDColors = new Float32Array(maxSelectedObjects * 3);

    let index = 0;
    for (const id of this.selectedIDs) {
      if (index >= maxSelectedObjects) break;

      const [r, g, b] = ObjectIDRenderPass.meshIDToRgb(id);
      selectedIDColors[index * 3] = r;
      selectedIDColors[index * 3 + 1] = g;
      selectedIDColors[index * 3 + 2] = b;
      index++;
    }

    this.maskMaterial.uniforms["selectedIDColors"].value = selectedIDColors;
    this.maskMaterial.uniforms["numSelectedIDs"].value = Math.min(this.selectedIDs.size, maxSelectedObjects);
  }

  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget): void {
    renderer.setRenderTarget(writeBuffer);
    if (this.clear) renderer.clear();
    this.fsQuad.render(renderer);
  }

  private createMaskMaterial(): ShaderMaterial {
    return new ShaderMaterial({
      uniforms: {
        idTexture: { value: null },
        selectedIDColors: { value: new Float32Array(64 * 3) }, // Support up to 64 selected objects
        numSelectedIDs: { value: 0 },
      },
      vertexShader: `varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`,
      fragmentShader: `
        uniform sampler2D idTexture;
        uniform float[192] selectedIDColors; // 64 * 3 (RGB components)
        uniform int numSelectedIDs;
        varying vec2 vUv;

        // Compare two RGB colors with tolerance
        bool colorsMatch(vec3 color1, vec3 color2) {
          vec3 diff = abs(color1 - color2);
          return diff.r < 0.01 && diff.g < 0.01 && diff.b < 0.01;
        }

        void main() {
          vec4 idColor = texture2D(idTexture, vUv);

          // Check if this pixel's ID matches any selected object ID
          bool isSelected = false;
          for (int i = 0; i < numSelectedIDs && i < 64; i++) {
            vec3 selectedColor = vec3(
              selectedIDColors[i * 3],
              selectedIDColors[i * 3 + 1],
              selectedIDColors[i * 3 + 2]
            );

            if (colorsMatch(idColor.rgb, selectedColor)) {
              isSelected = true;
              break;
            }
          }

          if (isSelected) {
            // Output the original mesh ID for selected objects
            gl_FragColor = idColor;
          } else {
            // Output ID 0 (black) for non-selected objects
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
          }
        }`,
    });
  }

  dispose(): void {
    this.maskMaterial.dispose();
    this.fsQuad.dispose();
  }
}