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

  // Edge filtering
  backgroundThreshold = 0.01; // RGB threshold to consider a pixel as background

  private selectedIDs = new Set<number>();
  private sceneDepthTexture: any = null;

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

  setIDDepthTexture(depthTexture: any): void {
    this.edgeDetectionMaterial.uniforms["idDepthTexture"].value = depthTexture;
  }

  setTextureSize(width: number, height: number): void {
    (this.edgeDetectionMaterial.uniforms["texSize"].value as Vector2).set(width, height);
  }

  setSceneDepthTexture(depthTexture: any): void {
    this.sceneDepthTexture = depthTexture;
    this.edgeDetectionMaterial.uniforms["sceneDepthTexture"].value = depthTexture;
    this.edgeDetectionMaterial.uniforms["useDepthTest"].value = depthTexture !== null;
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

    this.edgeDetectionMaterial.uniforms["meshOutlineColors"].value = idColors;
    this.edgeDetectionMaterial.uniforms["meshIDColors"].value = idList;
    this.edgeDetectionMaterial.uniforms["numOutlineMeshes"].value = Math.min(outliningMeshes.length, maxMeshes);
  }


  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget): void {
    // Update uniforms that still exist
    this.edgeDetectionMaterial.uniforms["backgroundThreshold"].value = this.backgroundThreshold;

    renderer.setRenderTarget(writeBuffer);
    if (this.clear) renderer.clear();
    this.fsQuad.render(renderer);
  }


  private createEdgeDetectionMaterial(): ShaderMaterial {
    return new ShaderMaterial({
      uniforms: {
        idTexture: { value: null },
        idDepthTexture: { value: null },
        sceneDepthTexture: { value: null },
        useDepthTest: { value: false },
        texSize: { value: new Vector2(0.5, 0.5) },
        meshOutlineColors: { value: new Float32Array(64 * 3) }, // RGB color for each outlined mesh
        meshIDColors: { value: new Float32Array(64 * 3) }, // ID encoded as RGB for each outlined mesh
        numOutlineMeshes: { value: 0 },
        backgroundThreshold: { value: 0.01 },
      },
      vertexShader: `varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`,
      fragmentShader: `
        uniform sampler2D idTexture;
        uniform sampler2D idDepthTexture;
        uniform sampler2D sceneDepthTexture;
        uniform bool useDepthTest;
        uniform vec2 texSize;
        uniform float[192] meshOutlineColors; // 64 * 3 (RGB outline colors)
        uniform float[192] meshIDColors; // 64 * 3 (RGB encoded IDs)
        uniform int numOutlineMeshes;
        uniform float backgroundThreshold;
        varying vec2 vUv;

        // Compare two RGB colors (object IDs) with tolerance
        bool colorsMatch(vec3 color1, vec3 color2) {
          vec3 diff = abs(color1 - color2);
          return diff.r < 0.001 && diff.g < 0.001 && diff.b < 0.001;
        }

        // Check if a color represents background (black/near-black)
        bool isBackground(vec3 color) {
          return color.r < backgroundThreshold && color.g < backgroundThreshold && color.b < backgroundThreshold;
        }

        // Check if a pixel is visible by comparing scene depth vs ID depth
        bool isPixelVisible(vec2 uv) {
          if (!useDepthTest) return true;

          float sceneDepth = texture2D(sceneDepthTexture, uv).r;
          float idDepth = texture2D(idDepthTexture, uv).r;
          float depthTolerance = 0.001;

          return abs(sceneDepth - idDepth) <= depthTolerance;
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
          vec2 invSize = 1.0 / texSize;
          float thickness = 4.0; // Thicker outlines

          // For edge detection, we need to check if we're on the boundary between visible and non-visible parts
          // Don't filter out pixels here - let the edge detection logic handle visibility

          // Sample the center pixel
          vec4 center = texture2D(idTexture, vUv);
          vec4 centerOutlineColor = getOutlineColor(center.rgb);

          // Only process pixels that belong to outlined meshes OR are near them
          if (centerOutlineColor.a > 0.5) {
            bool centerVisible = isPixelVisible(vUv);

            // Check immediate neighbors first (most common case)
            vec2 rightUv = vUv + vec2(invSize.x, 0.0);
            vec2 leftUv = vUv - vec2(invSize.x, 0.0);
            vec2 upUv = vUv + vec2(0.0, invSize.y);
            vec2 downUv = vUv - vec2(0.0, invSize.y);

            vec4 right = texture2D(idTexture, rightUv);
            vec4 left = texture2D(idTexture, leftUv);
            vec4 up = texture2D(idTexture, upUv);
            vec4 down = texture2D(idTexture, downUv);

            bool rightVisible = isPixelVisible(rightUv);
            bool leftVisible = isPixelVisible(leftUv);
            bool upVisible = isPixelVisible(upUv);
            bool downVisible = isPixelVisible(downUv);

            // Draw outline if center pixel is visible AND we're at a mesh boundary
            // Only draw at actual mesh edges, not at occlusion edges
            if (centerVisible && (
                (!colorsMatch(center.rgb, right.rgb)) ||
                (!colorsMatch(center.rgb, left.rgb)) ||
                (!colorsMatch(center.rgb, up.rgb)) ||
                (!colorsMatch(center.rgb, down.rgb))
            )) {
              // Additional check: only draw if this is a valid edge (neighbor is also reasonably close)
              gl_FragColor = centerOutlineColor;
              return;
            }

            // Check slightly further out for thickness (8 directions)
            vec2 neighborUvs[8];
            neighborUvs[0] = vUv + vec2(thickness * invSize.x, 0.0);
            neighborUvs[1] = vUv + vec2(-thickness * invSize.x, 0.0);
            neighborUvs[2] = vUv + vec2(0.0, thickness * invSize.y);
            neighborUvs[3] = vUv + vec2(0.0, -thickness * invSize.y);
            neighborUvs[4] = vUv + vec2(thickness * invSize.x, thickness * invSize.y);
            neighborUvs[5] = vUv + vec2(-thickness * invSize.x, thickness * invSize.y);
            neighborUvs[6] = vUv + vec2(thickness * invSize.x, -thickness * invSize.y);
            neighborUvs[7] = vUv + vec2(-thickness * invSize.x, -thickness * invSize.y);

            for (int i = 0; i < 8; i++) {
              vec4 neighbor = texture2D(idTexture, neighborUvs[i]);

              if (!colorsMatch(center.rgb, neighbor.rgb)) {
                gl_FragColor = centerOutlineColor;
                return;
              }
            }
          }

          gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        }`,
    });
  }

  dispose(): void {
    this.edgeDetectionMaterial.dispose();
    this.fsQuad.dispose();
  }
}