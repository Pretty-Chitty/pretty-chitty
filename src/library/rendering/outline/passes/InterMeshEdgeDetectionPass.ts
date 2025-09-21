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

export enum EdgeMode {
  SELECTED_ONLY = "selected_only",        // Only edges around selected objects (current behavior)
  ALL_MESHES = "all_meshes",             // Edges between any different mesh IDs
  MESH_BOUNDARIES = "mesh_boundaries",    // Edges between meshes and background
  SELECTED_AND_BOUNDARIES = "selected_and_boundaries" // Both selected outlines and mesh boundaries
}

export class InterMeshEdgeDetectionPass extends Pass {
  edgeDetectionMaterial: ShaderMaterial;
  private fsQuad: FullScreenQuad;

  // Edge appearance
  visibleEdgeColor = new Color(1, 1, 1);
  interMeshEdgeColor = new Color(0.5, 0.5, 0.5); // Different color for inter-mesh edges
  pulsePeriod = 0;
  edgeMode = EdgeMode.SELECTED_ONLY;

  // Edge filtering
  minEdgeStrength = 0.1; // Minimum edge strength to show
  backgroundThreshold = 0.01; // RGB threshold to consider a pixel as background

  private tempPulseColor = new Color();
  private selectedIDs = new Set<number>();

  clear = true;
  needsSwap = false;

  constructor() {
    super();
    this.edgeDetectionMaterial = this.createEdgeDetectionMaterial();
    this.fsQuad = new FullScreenQuad(this.edgeDetectionMaterial);
  }

  setIDTexture(texture: any): void {
    this.edgeDetectionMaterial.uniforms["idTexture"].value = texture;
  }

  setTextureSize(width: number, height: number): void {
    (this.edgeDetectionMaterial.uniforms["texSize"].value as Vector2).set(width, height);
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

    this.updateSelectedIDsUniform();
  }

  private updateSelectedIDsUniform(): void {
    const maxSelectedObjects = 64;
    const selectedIDColors = new Float32Array(maxSelectedObjects * 3);

    let index = 0;
    for (const id of this.selectedIDs) {
      if (index >= maxSelectedObjects) break;

      const r = ((id >> 16) & 0xff) / 255.0;
      const g = ((id >> 8) & 0xff) / 255.0;
      const b = (id & 0xff) / 255.0;

      selectedIDColors[index * 3] = r;
      selectedIDColors[index * 3 + 1] = g;
      selectedIDColors[index * 3 + 2] = b;
      index++;
    }

    this.edgeDetectionMaterial.uniforms["selectedIDColors"].value = selectedIDColors;
    this.edgeDetectionMaterial.uniforms["numSelectedIDs"].value = Math.min(this.selectedIDs.size, maxSelectedObjects);
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

    // Update uniforms
    (this.edgeDetectionMaterial.uniforms["visibleEdgeColor"].value as Vector3).set(
      this.tempPulseColor.r,
      this.tempPulseColor.g,
      this.tempPulseColor.b,
    );

    (this.edgeDetectionMaterial.uniforms["interMeshEdgeColor"].value as Vector3).set(
      this.interMeshEdgeColor.r,
      this.interMeshEdgeColor.g,
      this.interMeshEdgeColor.b,
    );

    this.edgeDetectionMaterial.uniforms["edgeMode"].value = this.getModeValue();
    this.edgeDetectionMaterial.uniforms["minEdgeStrength"].value = this.minEdgeStrength;
    this.edgeDetectionMaterial.uniforms["backgroundThreshold"].value = this.backgroundThreshold;

    renderer.setRenderTarget(writeBuffer);
    if (this.clear) renderer.clear();
    this.fsQuad.render(renderer);
  }

  private getModeValue(): number {
    switch (this.edgeMode) {
      case EdgeMode.SELECTED_ONLY: return 0;
      case EdgeMode.ALL_MESHES: return 1;
      case EdgeMode.MESH_BOUNDARIES: return 2;
      case EdgeMode.SELECTED_AND_BOUNDARIES: return 3;
      default: return 0;
    }
  }

  private createEdgeDetectionMaterial(): ShaderMaterial {
    return new ShaderMaterial({
      uniforms: {
        idTexture: { value: null },
        texSize: { value: new Vector2(0.5, 0.5) },
        visibleEdgeColor: { value: new Vector3(1.0, 1.0, 1.0) },
        interMeshEdgeColor: { value: new Vector3(0.5, 0.5, 0.5) },
        selectedIDColors: { value: new Float32Array(64 * 3) },
        numSelectedIDs: { value: 0 },
        edgeMode: { value: 0 },
        minEdgeStrength: { value: 0.1 },
        backgroundThreshold: { value: 0.01 },
      },
      vertexShader: `varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`,
      fragmentShader: `
        uniform sampler2D idTexture;
        uniform vec2 texSize;
        uniform vec3 visibleEdgeColor;
        uniform vec3 interMeshEdgeColor;
        uniform float[192] selectedIDColors; // 64 * 3 (RGB components)
        uniform int numSelectedIDs;
        uniform int edgeMode; // 0=selected_only, 1=all_meshes, 2=mesh_boundaries, 3=selected_and_boundaries
        uniform float minEdgeStrength;
        uniform float backgroundThreshold;
        varying vec2 vUv;

        // Compare two RGB colors (object IDs) with tolerance
        bool colorsMatch(vec3 color1, vec3 color2) {
          vec3 diff = abs(color1 - color2);
          return diff.r < 0.001 && diff.g < 0.001 && diff.b < 0.001; // Much tighter tolerance
        }

        // Check if a color represents background (black/near-black)
        bool isBackground(vec3 color) {
          return color.r < backgroundThreshold && color.g < backgroundThreshold && color.b < backgroundThreshold;
        }

        // Check if a color represents a selected object
        bool isSelected(vec3 color) {
          if (isBackground(color)) return false;

          for (int i = 0; i < numSelectedIDs && i < 64; i++) {
            vec3 selectedColor = vec3(
              selectedIDColors[i * 3],
              selectedIDColors[i * 3 + 1],
              selectedIDColors[i * 3 + 2]
            );

            if (colorsMatch(color, selectedColor)) {
              return true;
            }
          }
          return false;
        }

        void main() {
          vec2 invSize = 1.0 / texSize;

          // Sample the center pixel and neighbors
          vec4 center = texture2D(idTexture, vUv);
          vec4 right = texture2D(idTexture, vUv + vec2(invSize.x, 0.0));
          vec4 left = texture2D(idTexture, vUv - vec2(invSize.x, 0.0));
          vec4 up = texture2D(idTexture, vUv + vec2(0.0, invSize.y));
          vec4 down = texture2D(idTexture, vUv - vec2(0.0, invSize.y));

          bool centerIsBackground = isBackground(center.rgb);
          bool centerIsSelected = isSelected(center.rgb);

          bool isEdge = false;
          vec3 edgeColor = visibleEdgeColor;

          if (edgeMode == 0) {
            // SELECTED_ONLY: Only edges around selected objects
            if (centerIsSelected) {
              if (!colorsMatch(center.rgb, right.rgb) ||
                  !colorsMatch(center.rgb, left.rgb) ||
                  !colorsMatch(center.rgb, up.rgb) ||
                  !colorsMatch(center.rgb, down.rgb)) {
                isEdge = true;
                edgeColor = visibleEdgeColor;
              }
            }
          }
          else if (edgeMode == 1) {
            // ALL_MESHES: Edges between any different mesh IDs
            if (!centerIsBackground) {
              if (!colorsMatch(center.rgb, right.rgb) ||
                  !colorsMatch(center.rgb, left.rgb) ||
                  !colorsMatch(center.rgb, up.rgb) ||
                  !colorsMatch(center.rgb, down.rgb)) {
                isEdge = true;
                edgeColor = centerIsSelected ? visibleEdgeColor : interMeshEdgeColor;
              }
            }
          }
          else if (edgeMode == 2) {
            // MESH_BOUNDARIES: Edges between meshes and background
            if (!centerIsBackground) {
              if (isBackground(right.rgb) || isBackground(left.rgb) ||
                  isBackground(up.rgb) || isBackground(down.rgb)) {
                isEdge = true;
                edgeColor = interMeshEdgeColor;
              }
            }
          }
          else if (edgeMode == 3) {
            // SELECTED_AND_BOUNDARIES: Both selected outlines and mesh boundaries
            if (centerIsSelected) {
              // Selected objects: show edges when they border anything different (including other selected objects)
              if (!colorsMatch(center.rgb, right.rgb) ||
                  !colorsMatch(center.rgb, left.rgb) ||
                  !colorsMatch(center.rgb, up.rgb) ||
                  !colorsMatch(center.rgb, down.rgb)) {
                isEdge = true;
                edgeColor = visibleEdgeColor;
              }
            } else if (!centerIsBackground) {
              // Non-selected objects: show edges when they border background or different objects
              bool hasDifferentNeighbor = !colorsMatch(center.rgb, right.rgb) ||
                                        !colorsMatch(center.rgb, left.rgb) ||
                                        !colorsMatch(center.rgb, up.rgb) ||
                                        !colorsMatch(center.rgb, down.rgb);

              bool hasBackgroundNeighbor = isBackground(right.rgb) || isBackground(left.rgb) ||
                                         isBackground(up.rgb) || isBackground(down.rgb);

              if (hasDifferentNeighbor || hasBackgroundNeighbor) {
                isEdge = true;
                edgeColor = interMeshEdgeColor;
              }
            }
          }

          if (isEdge) {
            gl_FragColor = vec4(edgeColor, 1.0);
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