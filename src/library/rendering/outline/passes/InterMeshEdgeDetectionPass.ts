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

  setSceneDepthTexture(depthTexture: any): void {
    this.sceneDepthTexture = depthTexture;
    this.edgeDetectionMaterial.uniforms["sceneDepthTexture"].value = depthTexture;
    this.edgeDetectionMaterial.uniforms["useDepthTest"].value = depthTexture !== null;
  }

  setOutliningMeshes(outliningMeshes: Array<{id: number, color: Color}>): void {
    this.selectedIDs.clear();

    // Clear lookup texture
    const textureData = this.lookupTexture.image.data as Float32Array;
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
      textureData[index] = mesh.color.r;     // R
      textureData[index + 1] = mesh.color.g; // G
      textureData[index + 2] = mesh.color.b; // B
      textureData[index + 3] = 1.0;          // A (indicates valid entry)
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
          vec2 invSize = 1.0 / texSize;

          // For edge detection, we need to check if we're on the boundary between visible and non-visible parts
          // Don't filter out pixels here - let the edge detection logic handle visibility

          // Sample the center pixel
          vec4 center = sampleTextureClampToBackground(idTexture, vUv);
          vec4 centerOutlineColor = getOutlineColor(center.rgb);

          // Process pixels that belong to outlined meshes OR background pixels near outlined meshes
          if (centerOutlineColor.a > 0.5) {
            // Center pixel belongs to an outlined mesh - check for interior edges
            bool centerVisible = isPixelVisible(vUv);

            // Check immediate neighbors first (most common case)
            vec2 rightUv = vUv + vec2(invSize.x, 0.0);
            vec2 leftUv = vUv - vec2(invSize.x, 0.0);
            vec2 upUv = vUv + vec2(0.0, invSize.y);
            vec2 downUv = vUv - vec2(0.0, invSize.y);

            vec4 right = sampleTextureClampToBackground(idTexture, rightUv);
            vec4 left = sampleTextureClampToBackground(idTexture, leftUv);
            vec4 up = sampleTextureClampToBackground(idTexture, upUv);
            vec4 down = sampleTextureClampToBackground(idTexture, downUv);

            bool rightVisible = isPixelVisible(rightUv);
            bool leftVisible = isPixelVisible(leftUv);
            bool upVisible = isPixelVisible(upUv);
            bool downVisible = isPixelVisible(downUv);

            // Draw outline if center pixel is visible AND we're at a true mesh boundary
            // Avoid A-B-A false edges where single pixels are isolated
            if (centerVisible) {
              bool hasValidEdge = false;

              // Check right edge - prevent A-B-A false edges
              if (!colorsMatch(center.rgb, right.rgb)) {
                vec2 rightRight = vUv + vec2(2.0 * invSize.x, 0.0);
                vec4 rightRightColor = sampleTextureClampToBackground(idTexture, rightRight);
                // In A-B-A pattern: A won't draw edge to B, and B won't draw edge to A
                // Only draw edge for A-B-C patterns (true boundaries)
                if (!colorsMatch(center.rgb, rightRightColor.rgb)) {
                  hasValidEdge = true;
                }
              }

              // Check left edge - avoid A-B-A pattern
              if (!colorsMatch(center.rgb, left.rgb)) {
                vec2 leftLeft = vUv + vec2(-2.0 * invSize.x, 0.0);
                vec4 leftLeftColor = sampleTextureClampToBackground(idTexture, leftLeft);
                // Only edge if next pixel doesn't match center (avoid A-B-A)
                if (!colorsMatch(center.rgb, leftLeftColor.rgb)) {
                  hasValidEdge = true;
                }
              }

              // Check up edge - avoid A-B-A pattern
              if (!colorsMatch(center.rgb, up.rgb)) {
                vec2 upUp = vUv + vec2(0.0, 2.0 * invSize.y);
                vec4 upUpColor = sampleTextureClampToBackground(idTexture, upUp);
                // Only edge if next pixel doesn't match center (avoid A-B-A)
                if (!colorsMatch(center.rgb, upUpColor.rgb)) {
                  hasValidEdge = true;
                }
              }

              // Check down edge - avoid A-B-A pattern
              if (!colorsMatch(center.rgb, down.rgb)) {
                vec2 downDown = vUv + vec2(0.0, -2.0 * invSize.y);
                vec4 downDownColor = sampleTextureClampToBackground(idTexture, downDown);
                // Only edge if next pixel doesn't match center (avoid A-B-A)
                if (!colorsMatch(center.rgb, downDownColor.rgb)) {
                  hasValidEdge = true;
                }
              }

              if (hasValidEdge) {
                gl_FragColor = centerOutlineColor;
                return;
              }
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
              vec4 neighbor = sampleTextureClampToBackground(idTexture, neighborUvs[i]);

              if (!colorsMatch(center.rgb, neighbor.rgb)) {
                gl_FragColor = centerOutlineColor;
                return;
              }
            }
          } else {
            // Center pixel is background - check if it's adjacent to any outlined mesh
            vec2 neighborUvs[8];
            neighborUvs[0] = vUv + vec2(invSize.x, 0.0);
            neighborUvs[1] = vUv + vec2(-invSize.x, 0.0);
            neighborUvs[2] = vUv + vec2(0.0, invSize.y);
            neighborUvs[3] = vUv + vec2(0.0, -invSize.y);
            neighborUvs[4] = vUv + vec2(invSize.x, invSize.y);
            neighborUvs[5] = vUv + vec2(-invSize.x, invSize.y);
            neighborUvs[6] = vUv + vec2(invSize.x, -invSize.y);
            neighborUvs[7] = vUv + vec2(-invSize.x, -invSize.y);

            // Check if any neighbor belongs to an outlined mesh
            for (int i = 0; i < 8; i++) {
              vec4 neighbor = sampleTextureClampToBackground(idTexture, neighborUvs[i]);
              vec4 neighborOutlineColor = getOutlineColor(neighbor.rgb);

              if (neighborOutlineColor.a > 0.5 && isPixelVisible(neighborUvs[i])) {
                // Found an adjacent outlined mesh - use its outline color for exterior edge
                gl_FragColor = neighborOutlineColor;
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