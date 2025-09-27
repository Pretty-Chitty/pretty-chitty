import {
  ShaderMaterial,
  WebGLRenderer,
  WebGLRenderTarget,
  Vector2,
  Vector3,
  Color,
  DataTexture,
  RGBAFormat,
  FloatType,
  NearestFilter,
} from "three";
import { Pass } from "../types";
import { FullScreenQuad } from "../FullScreenQuad";

export enum EdgeMode {
  SELECTED_ONLY = "selected_only", // Only edges around selected objects (current behavior)
  ALL_MESHES = "all_meshes", // Edges between any different mesh IDs
  MESH_BOUNDARIES = "mesh_boundaries", // Edges between meshes and background
  SELECTED_AND_BOUNDARIES = "selected_and_boundaries", // Both selected outlines and mesh boundaries
}

export class InterMeshEdgeDetectionPass extends Pass {
  edgeDetectionMaterial: ShaderMaterial;
  private fsQuad: FullScreenQuad;

  // Edge filtering
  backgroundThreshold = 0.01; // RGB threshold to consider a pixel as background

  private selectedIDs = new Set<number>();
  private sceneDepthTexture: any = null;
  private lookupTexture: DataTexture;

  clear = true;
  needsSwap = false;

  constructor() {
    super();

    // Create lookup texture (256x256 to handle all possible IDs 0-65535)
    const textureSize = 256;
    const textureData = new Float32Array(textureSize * textureSize * 4); // RGBA
    this.lookupTexture = new DataTexture(textureData, textureSize, textureSize, RGBAFormat, FloatType);
    this.lookupTexture.minFilter = NearestFilter;
    this.lookupTexture.magFilter = NearestFilter;
    this.lookupTexture.needsUpdate = true;

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

  setThickness(thickness: number): void {
    this.edgeDetectionMaterial.uniforms["thickness"].value = thickness;
  }

  setStrength(strength: number): void {
    this.edgeDetectionMaterial.uniforms["strength"].value = strength;
  }

  setSceneDepthTexture(depthTexture: any): void {
    this.sceneDepthTexture = depthTexture;
    this.edgeDetectionMaterial.uniforms["sceneDepthTexture"].value = depthTexture;
    this.edgeDetectionMaterial.uniforms["useDepthTest"].value = depthTexture !== null;
  }


  setOutliningMeshes(outliningMeshes: Array<{ id: number; color: Color }>): void {
    this.selectedIDs.clear();

    // Clear lookup texture
    const textureData = this.lookupTexture.image.data as unknown as Float32Array;
    textureData.fill(0);

    // Populate lookup texture with ID->Color mappings
    for (const mesh of outliningMeshes) {
      this.selectedIDs.add(mesh.id);

      // Convert ID to texture coordinates
      const id = mesh.id;
      const x = id % 256;
      const y = Math.floor(id / 256);
      const index = (y * 256 + x) * 4;

      // Store outline color at this position
      textureData[index] = mesh.color.r; // R
      textureData[index + 1] = mesh.color.g; // G
      textureData[index + 2] = mesh.color.b; // B
      textureData[index + 3] = 1.0; // A (indicates valid entry)
    }

    this.lookupTexture.needsUpdate = true;
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
        backgroundThreshold: { value: 0.01 },
        lookupTexture: { value: this.lookupTexture },
        thickness: { value: 4.0 },
        strength: { value: 1.0 },
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
        uniform float backgroundThreshold;
        uniform sampler2D lookupTexture;
        uniform float thickness;
        uniform float strength;
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

        // Safely sample texture, treating out-of-bounds as background
        vec4 sampleTextureClampToBackground(sampler2D tex, vec2 uv) {
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            return vec4(0.0, 0.0, 0.0, 0.0); // Background
          }
          return texture2D(tex, uv);
        }

        // Check if a pixel is visible by comparing scene depth vs ID depth
        bool isPixelVisible(vec2 uv) {
          if (!useDepthTest) return true;
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return false;

          float sceneDepth = texture2D(sceneDepthTexture, uv).r;
          float idDepth = texture2D(idDepthTexture, uv).r;
          float depthTolerance = 0.001;

          return abs(sceneDepth - idDepth) <= depthTolerance;
        }

        // Decode ID from RGB and lookup outline color in texture
        vec4 getOutlineColor(vec3 encodedIdColor) {
          if (isBackground(encodedIdColor)) {
            return vec4(0.0, 0.0, 0.0, 0.0);
          }

          // Decode ID from RGB
          float id = encodedIdColor.r * 255.0 * 65536.0 + encodedIdColor.g * 255.0 * 256.0 + encodedIdColor.b * 255.0;

          // Convert ID to texture coordinates
          float x = mod(id, 256.0) / 256.0;
          float y = floor(id / 256.0) / 256.0;

          // Lookup outline color
          vec4 outlineColor = texture2D(lookupTexture, vec2(x, y));

          // Return color if valid (alpha > 0), otherwise transparent
          if (outlineColor.a > 0.5) {
            return vec4(outlineColor.rgb, 1.0);
          }
          return vec4(0.0, 0.0, 0.0, 0.0);
        }


        void main() {
          vec2 lowResInvSize = 1.0 / texSize;

          // Sample the center pixel - MUST belong to an outlined mesh
          vec4 center = texture2D(idTexture, vUv);
          vec4 centerOutlineColor = getOutlineColor(center.rgb);

          // Only draw outlines INSIDE meshes that have outline colors
          if (centerOutlineColor.a < 0.5) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
            return;
          }

          // Additional depth test - only draw outlines for visible pixels
          if (!isPixelVisible(vUv)) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
            return;
          }

          // Check neighbors to see if we're near an edge
          float edgeDistance = 1000.0; // Very far away initially

          float checkRadius = max(1.0, thickness);
          for (float x = -checkRadius; x <= checkRadius; x += 1.0) {
            for (float y = -checkRadius; y <= checkRadius; y += 1.0) {
              vec2 sampleUv = vUv + vec2(x, y) * lowResInvSize;
              vec4 neighbor = texture2D(idTexture, sampleUv);

              // If neighbor is different from center, we found an edge
              if (!colorsMatch(center.rgb, neighbor.rgb)) {
                float dist = length(vec2(x, y));
                edgeDistance = min(edgeDistance, dist);
              }
            }
          }

          // Only draw if we're near an edge (inside the mesh)
          if (edgeDistance < 1000.0) {
            // Create thick outline with smooth falloff
            float lineThickness = thickness + 0.5;
            float alpha = 1.0 - smoothstep(0.5, lineThickness, edgeDistance);

            if (alpha > 0.01) {
              gl_FragColor = vec4(centerOutlineColor.rgb, alpha * strength);
            } else {
              gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
            }
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
