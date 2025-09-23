import {
  ShaderMaterial,
  WebGLRenderer,
  WebGLRenderTarget,
  Vector2,
  Color,
} from "three";
import { Pass } from "../types";
import { FullScreenQuad } from "../FullScreenQuad";

export class DebugIDMappingPass extends Pass {
  debugMaterial: ShaderMaterial;
  private fsQuad: FullScreenQuad;

  private selectedIDs = new Set<number>();

  clear = true;
  needsSwap = false;

  constructor() {
    super();
    this.debugMaterial = this.createDebugMaterial();
    this.fsQuad = new FullScreenQuad(this.debugMaterial);
  }

  setIDTexture(texture: any): void {
    this.debugMaterial.uniforms["idTexture"].value = texture;
  }

  setTextureSize(width: number, height: number): void {
    (this.debugMaterial.uniforms["texSize"].value as Vector2).set(width, height);
  }

  setOutliningMeshes(outliningMeshes: Array<{id: number, color: Color}>): void {
    this.selectedIDs.clear();

    // Store ID to color mapping
    const maxMeshes = 64;
    const idColors = new Float32Array(maxMeshes * 3); // RGB for each mesh
    const idList = new Float32Array(maxMeshes * 3); // ID encoded as RGB for each mesh

    let index = 0;
    for (const mesh of outliningMeshes) {
      if (index >= maxMeshes) break;

      this.selectedIDs.add(mesh.id);

      // Store the outline color for this mesh
      idColors[index * 3] = mesh.color.r;
      idColors[index * 3 + 1] = mesh.color.g;
      idColors[index * 3 + 2] = mesh.color.b;

      // Store the ID encoded as RGB
      const r = ((mesh.id >> 16) & 0xff) / 255.0;
      const g = ((mesh.id >> 8) & 0xff) / 255.0;
      const b = (mesh.id & 0xff) / 255.0;

      idList[index * 3] = r;
      idList[index * 3 + 1] = g;
      idList[index * 3 + 2] = b;

      index++;
    }

    this.debugMaterial.uniforms["meshOutlineColors"].value = idColors;
    this.debugMaterial.uniforms["meshIDColors"].value = idList;
    this.debugMaterial.uniforms["numOutlineMeshes"].value = Math.min(outliningMeshes.length, maxMeshes);
  }

  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget): void {
    renderer.setRenderTarget(writeBuffer);
    if (this.clear) renderer.clear();
    this.fsQuad.render(renderer);
  }

  private createDebugMaterial(): ShaderMaterial {
    return new ShaderMaterial({
      uniforms: {
        idTexture: { value: null },
        texSize: { value: new Vector2(0.5, 0.5) },
        meshOutlineColors: { value: new Float32Array(64 * 3) }, // RGB color for each outlined mesh
        meshIDColors: { value: new Float32Array(64 * 3) }, // ID encoded as RGB for each outlined mesh
        numOutlineMeshes: { value: 0 },
      },
      vertexShader: `varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`,
      fragmentShader: `
        uniform sampler2D idTexture;
        uniform vec2 texSize;
        uniform float[192] meshOutlineColors; // 64 * 3 (RGB outline colors)
        uniform float[192] meshIDColors; // 64 * 3 (RGB encoded IDs)
        uniform int numOutlineMeshes;
        varying vec2 vUv;

        // Compare two RGB colors (object IDs) with strict tolerance
        bool colorsMatch(vec3 color1, vec3 color2) {
          vec3 diff = abs(color1 - color2);
          return diff.r < 0.001 && diff.g < 0.001 && diff.b < 0.001;
        }

        // Check if a color represents background (black/near-black)
        bool isBackground(vec3 color) {
          return color.r < 0.01 && color.g < 0.01 && color.b < 0.01;
        }

        // Find the outline color for a given mesh ID color, returns vec4(outlineColor, 1.0) or vec4(0,0,0,0) if not outlined
        vec4 getOutlineColor(vec3 idColor) {
          if (isBackground(idColor)) return vec4(0.0, 0.0, 0.0, 0.0);

          for (int i = 0; i < numOutlineMeshes && i < 64; i++) {
            vec3 meshIDColor = vec3(
              meshIDColors[i * 3],
              meshIDColors[i * 3 + 1],
              meshIDColors[i * 3 + 2]
            );

            if (colorsMatch(idColor, meshIDColor)) {
              vec3 outlineColor = vec3(
                meshOutlineColors[i * 3],
                meshOutlineColors[i * 3 + 1],
                meshOutlineColors[i * 3 + 2]
              );
              return vec4(outlineColor, 1.0);
            }
          }
          return vec4(0.0, 0.0, 0.0, 0.0);
        }

        void main() {
          // Sample the ID texture - this now contains outline colors directly
          vec4 outlineColor = texture2D(idTexture, vUv);

          if (isBackground(outlineColor.rgb)) {
            // Show black for background
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
          } else {
            // Show the outline color directly
            gl_FragColor = vec4(outlineColor.rgb, 1.0);
          }
        }`,
    });
  }

  dispose(): void {
    this.debugMaterial.dispose();
    this.fsQuad.dispose();
  }
}