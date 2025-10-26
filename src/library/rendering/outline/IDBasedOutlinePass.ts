import {
  Color,
  Vector2,
  WebGLRenderTarget,
  WebGLRenderer,
  LinearFilter,
  NearestFilter,
  RGBAFormat,
  FrontSide,
  DepthTexture,
  UnsignedShortType,
  ShaderMaterial,
  NormalBlending,
  UniformsUtils,
  IUniform,
  Material,
} from "three";
import { Pass } from "./types";

// Utility to ensure correct WebGL state for rendering
function ensureCorrectRenderState(renderer: WebGLRenderer) {
  const context = renderer.getContext();

  // Always ensure correct depth testing state
  context.enable(context.DEPTH_TEST);
  context.depthFunc(context.LESS);
  context.depthMask(true);
}
import { InterMeshEdgeDetectionPass } from "./passes/InterMeshEdgeDetectionPass";
import { DebugIDMappingPass } from "./passes/DebugIDMappingPass";
import { FullScreenQuad } from "./FullScreenQuad";
import { CopyShader } from "./shaders";
import { SceneWrapper } from "./SceneWrapper";

export class IDBasedOutlinePass extends Pass {
  // Configuration properties
  edgeThickness = 2;
  edgeStrength = 3.0;
  forceVisibleOutlines = false; // Debug: force outlines to be visible
  debugMode = false;

  // Constants
  private static readonly INSTANCE_COUNTER = 0;
  private static instanceCounter = IDBasedOutlinePass.INSTANCE_COUNTER;
  private readonly instanceId: number;
  readonly downSampleRatio: number;
  readonly resolution: Vector2;

  // Core materials and components
  private readonly fsQuad = new FullScreenQuad(null);
  private readonly clonedMaterials = new Set<Material>(); // Track cloned materials for disposal
  materialCopy!: ShaderMaterial;
  copyUniforms!: Record<string, IUniform>;

  // Render targets
  private renderTargetIDBuffer!: WebGLRenderTarget;
  private renderTargetTempBuffer!: WebGLRenderTarget; // Dedicated temp buffer to avoid sharing conflicts
  private renderTargetEdgeBuffer1!: WebGLRenderTarget;

  // ID rendering components
  private sharedIDMaterial!: ShaderMaterial; // Single shared material
  private idBasedEdgeDetectionPass!: InterMeshEdgeDetectionPass;
  private debugIDMappingPass!: DebugIDMappingPass;

  // Scene depth texture (set externally)
  sceneDepthTexture: any = null;

  constructor(
    resolution: Vector2,
    private pixelRatio: number,
    downSampleRatio: number,
  ) {
    super();
    this.resolution = resolution ? new Vector2(resolution.x, resolution.y) : new Vector2(256, 256);
    this.instanceId = ++IDBasedOutlinePass.instanceCounter;
    this.downSampleRatio = downSampleRatio;
    // Initialize ID-based components
    this.initializeMaterials();
    this.initializeRenderTargets();
    this.initializeIDComponents();
  }

  private initializeMaterials(): void {
    this.copyUniforms = UniformsUtils.clone(CopyShader.uniforms);
    (this.copyUniforms["opacity"].value as number) = 1.0;
    this.materialCopy = new ShaderMaterial({
      uniforms: this.copyUniforms,
      vertexShader: CopyShader.vertexShader,
      fragmentShader: CopyShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
  }

  private initializeIDComponents(): void {
    // Create ID buffer render target with depth buffer at downsampled resolution for performance
    // Use NearestFilter for exact ID values without interpolation
    // Note: Using standard 8-bit RGBA. Shader code uses rounding to handle precision loss on 6-bit displays.
    const resx = Math.round(this.resolution.x / this.downSampleRatio);
    const resy = Math.round(this.resolution.y / this.downSampleRatio);
    const pars = {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      format: RGBAFormat,
      depthBuffer: true,
    };
    this.renderTargetIDBuffer = new WebGLRenderTarget(resx, resy, pars);
    this.renderTargetIDBuffer.texture.name = "IDBasedOutline.idBuffer";
    this.renderTargetIDBuffer.texture.generateMipmaps = false;

    // Add depth texture to ID buffer
    this.renderTargetIDBuffer.depthTexture = new DepthTexture(resx, resy);
    this.renderTargetIDBuffer.depthTexture.type = UnsignedShortType;

    // Create dedicated temp buffer to avoid cross-contamination
    this.renderTargetTempBuffer = new WebGLRenderTarget(
      this.resolution.x * this.pixelRatio,
      this.resolution.y * this.pixelRatio,
      pars,
    );
    this.renderTargetTempBuffer.texture.name = "IDBasedOutline.tempBuffer";
    this.renderTargetTempBuffer.texture.generateMipmaps = false;

    // Create ID-based edge detection pass
    this.idBasedEdgeDetectionPass = new InterMeshEdgeDetectionPass();

    // Create debug ID mapping pass
    this.debugIDMappingPass = new DebugIDMappingPass();

    // Create single shared ID material
    this.createSharedIDMaterial();
  }

  private createSharedIDMaterial(): void {
    // Use downsampled resolution for ID material since ID buffer is downsampled
    const resx = Math.round(this.resolution.x / this.downSampleRatio);
    const resy = Math.round(this.resolution.y / this.downSampleRatio);

    this.sharedIDMaterial = new ShaderMaterial({
      uniforms: {
        outlineIdColor: { value: new Color(1, 1, 1) }, // Will be updated per mesh (encoded outlineId)
        sceneDepthTexture: { value: null }, // Will be set before rendering
        useDepthTest: { value: false }, // Will be updated before rendering
        resolution: { value: new Vector2(resx, resy) },
        pixelOffset: { value: new Vector2(0.0, 0.0) }, // For multiple pass rendering
        originalMap: { value: null }, // Original diffuse texture for alpha testing
        originalOpacity: { value: 1.0 }, // Original material opacity
        alphaTest: { value: 0.0 }, // Alpha test threshold
        hasOriginalMap: { value: false }, // Whether original material has a map
      },
      vertexShader: `
        uniform vec2 pixelOffset;
        uniform vec2 resolution;
        varying vec2 vUv;
        varying vec4 vProjectedCoord;
        varying vec3 vViewNormal;
        varying vec3 vViewPosition;

        void main() {
          vUv = uv;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vProjectedCoord = projectionMatrix * mvPosition;

          // Pass view-space normal and position to fragment shader
          vViewNormal = normalize(normalMatrix * normal);
          vViewPosition = mvPosition.xyz;

          // Apply pixel offset in screen space
          vec2 pixelSize = 2.0 / resolution; // Size of one pixel in NDC
          vec2 offset = pixelOffset * pixelSize;

          gl_Position = vProjectedCoord + vec4(offset, 0.0, 0.0);

          // Expand geometry outward in screen space to make pixels appear 2x bigger
          vec2 ndc = gl_Position.xy / gl_Position.w;
          ndc += normalize(ndc) * pixelSize;
          gl_Position.xy = ndc * gl_Position.w;
        }
      `,
      fragmentShader: `
        uniform vec3 outlineIdColor;
        uniform sampler2D sceneDepthTexture;
        uniform bool useDepthTest;
        uniform vec2 resolution;
        uniform sampler2D originalMap;
        uniform float originalOpacity;
        uniform float alphaTest;
        uniform bool hasOriginalMap;
        varying vec2 vUv;
        varying vec4 vProjectedCoord;
        varying vec3 vViewNormal;
        varying vec3 vViewPosition;

        void main() {
          // Handle backface culling
          if (!gl_FrontFacing) {
            discard; // Only render front faces
          }

          // Calculate actual view direction from fragment to camera (in view space, camera is at origin)
          // This properly accounts for perspective - fragments far from center have different view vectors
          vec3 viewDir = normalize(-vViewPosition);

          // Calculate how much the face points toward the camera from this fragment's perspective
          float facingRatio = abs(dot(vViewNormal, viewDir));

          // For faces nearly perpendicular to view, move them closer to camera by adjusting depth
          // This prevents z-fighting and ensures edge-on faces render properly
          if (facingRatio < 0.1) {
            // Move fragment 1% closer to camera in depth
            gl_FragDepth = gl_FragCoord.z * (1.0 - (mix(0.0, 0.1, facingRatio) * 0.01));
          } else {
            // Keep original depth
            gl_FragDepth = gl_FragCoord.z;
          }

          // Handle alpha testing for transparent materials
          float alpha = 1.0;
          if (hasOriginalMap) {
            vec4 texColor = texture2D(originalMap, vUv);
            alpha *= texColor.a;
          }

          if (alpha < 0.1) {
            discard; // Respect original material's transparency (lower threshold for mipmaps)
          }

          if (useDepthTest) {
            // Convert screen space position to UV coordinates
            vec2 screenUV = (vProjectedCoord.xy / vProjectedCoord.w) * 0.5 + 0.5;

            // Sample the main scene depth at this pixel
            float sceneDepth = texture2D(sceneDepthTexture, screenUV).r;

            // Current fragment depth in screen space
            float currentDepth = (gl_FragCoord.z);

            // Only draw if depths approximately match (mesh is visible in main scene)
            // Use adaptive tolerance: more tolerance for near objects, less for far objects
            float nearTolerance = 0.007;   // Loose tolerance for close objects (depth ≈ 0)
            float farTolerance = 0.003;  // Tight tolerance for far objects (depth ≈ 1)

            // Interpolate tolerance based on current depth
            // Near camera (depth ≈ 0): use nearTolerance
            // Far from camera (depth ≈ 1): use farTolerance
            float tolerance = mix(nearTolerance, farTolerance, currentDepth);

            float low = currentDepth - tolerance;
            float high = currentDepth + tolerance;
            if (sceneDepth < low || sceneDepth > high) {
              discard;
            }
          }

          // Write the encoded outlineId to the buffer
          gl_FragColor = vec4(outlineIdColor, 1.0);

          
        }
      `,
      side: FrontSide, // Default to front side, will be overridden per material
    });
  }

  // Simplified API - no more edge modes, just outline meshes with userData.outlineColor

  private _lastSceneWrapper: SceneWrapper | undefined;
  override render(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
    maskActive: boolean,
  ): void {
    const renderStart = performance.now();

    // Set the depth texture from the read buffer (output of previous render pass)
    this.setSceneDepthTexture(readBuffer.depthTexture);

    if (this._lastSceneWrapper !== this.sceneWrapper) {
      // Mark materials dirty when scene wrapper changes
      if (this.sceneWrapper) {
        this.sceneWrapper.markMaterialsDirty();
      }
      this._lastSceneWrapper = this.sceneWrapper;
    }

    // Ensure SceneWrapper has reference to this pass
    this.sceneWrapper.setOutlinePass(this);

    // Save state before any processing
    this.saveRenderState(renderer);

    const updateStart = performance.now();
    // Check if any meshes have userData.outlineColor
    this.sceneWrapper.update();
    const hasOutlinedMeshes = this.sceneWrapper.hasOutlinedObjects;
    const updateTime = performance.now() - updateStart;

    if (!hasOutlinedMeshes) {
      if (this.renderToScreen) {
        this.renderIDCopyToScreen(renderer, readBuffer);
      } else {
        // Copy input to output buffer for effects pipeline
        this.fsQuad.material = this.materialCopy;
        (this.copyUniforms["tDiffuse"].value as any) = readBuffer.texture;
        renderer.setRenderTarget(writeBuffer);
        renderer.clear(); // Clear output buffer
        this.fsQuad.render(renderer);
      }
      this.restoreRenderState(renderer);
      return;
    }

    // Setup temporary state for ID rendering
    renderer.autoClear = false;
    if (maskActive) (renderer.state as any).buffers.stencil.setTest(false);

    const idBufferStart = performance.now();
    // Step 1: Render ID buffer
    this.renderIDBuffer(renderer);
    const idBufferTime = performance.now() - idBufferStart;

    const edgeDetectStart = performance.now();
    // Step 2: Use ID-based edge detection instead of the original method
    this.performIDBasedEdgeDetection(renderer);
    const edgeDetectTime = performance.now() - edgeDetectStart;

    const compositingStart = performance.now();
    // Step 3: Safe composition using dedicated temporary buffer to avoid feedback loops
    // First copy original scene to our dedicated temp buffer
    this.fsQuad.material = this.materialCopy;
    (this.copyUniforms["tDiffuse"].value as any) = readBuffer.texture;
    renderer.setRenderTarget(this.renderTargetTempBuffer); // Use dedicated temp buffer
    renderer.clear(); // Clear temp buffer first
    this.fsQuad.render(renderer);

    // Use edge buffer directly - blur is causing issues
    const edgeTexture = this.renderTargetEdgeBuffer1.texture;

    // Then composite temp + edges to final buffer (writeBuffer, not readBuffer!)
    renderer.setRenderTarget(writeBuffer);
    renderer.clear(); // Clear the buffer to ensure proper compositing

    // First: Copy temp buffer (scene) to output
    this.fsQuad.material = this.materialCopy;
    (this.copyUniforms["tDiffuse"].value as any) = this.renderTargetTempBuffer.texture;
    this.fsQuad.render(renderer);

    // Second: Add edges using additive blending
    renderer.autoClear = false;

    const originalBlending = this.materialCopy.blending;
    const originalTransparent = this.materialCopy.transparent;

    this.materialCopy.blending = NormalBlending;
    this.materialCopy.transparent = true;
    this.materialCopy.needsUpdate = true;

    (this.copyUniforms["tDiffuse"].value as any) = edgeTexture;
    this.fsQuad.render(renderer);

    // // Restore material blending settings
    this.materialCopy.blending = originalBlending;
    this.materialCopy.transparent = originalTransparent;
    this.materialCopy.needsUpdate = true;

    this.restoreRenderState(renderer);

    if (this.renderToScreen) {
      this.renderIDCopyToScreen(renderer, readBuffer);
    }

    const compositingTime = performance.now() - compositingStart;
    const totalTime = performance.now() - renderStart;

    // Log timing every 60 frames to avoid spam
    if (Math.random() < 0.00016) {
      // ~1/60 chance
      console.log(`Outline Pass Timing:
  Total: ${totalTime.toFixed(2)}ms
  SceneWrapper Update: ${updateTime.toFixed(2)}ms
  ID Buffer Render: ${idBufferTime.toFixed(2)}ms
  Edge Detection: ${edgeDetectTime.toFixed(2)}ms
  Compositing: ${compositingTime.toFixed(2)}ms`);
    }
  }

  private initializeRenderTargets(): void {
    const pars = { minFilter: LinearFilter, magFilter: LinearFilter, format: RGBAFormat } as any;

    this.renderTargetEdgeBuffer1 = new WebGLRenderTarget(
      this.resolution.x * this.pixelRatio,
      this.resolution.y * this.pixelRatio,
      pars,
    );
    this.renderTargetEdgeBuffer1.texture.name = "OutlinePass.edge1";
    this.renderTargetEdgeBuffer1.texture.generateMipmaps = false;
    // Use linear filtering for smooth edge output
    this.renderTargetEdgeBuffer1.texture.minFilter = LinearFilter;
    this.renderTargetEdgeBuffer1.texture.magFilter = LinearFilter;
  }

  setSceneDepthTexture(depthTexture: any): void {
    // Only update if the depth texture actually changed
    if (this.sceneDepthTexture === depthTexture) {
      return;
    }

    this.sceneDepthTexture = depthTexture;

    // Mark materials as dirty in the scene wrapper - it will handle the update
    if (this.sceneWrapper) {
      this.sceneWrapper.markMaterialsDirty();
    }
  }

  // DEPRECATED: This method is no longer needed. Material updates are now handled
  // by SceneWrapper.updateMaterials() in a consolidated way.
  fixDepthTextureReferences(): void {
    // Legacy method - now handled by SceneWrapper.updateMaterials()
    if (this.sceneWrapper) {
      this.sceneWrapper.markMaterialsDirty();
    }
  }

  private renderIDBuffer(renderer: WebGLRenderer): void {
    const oldAutoClear = renderer.autoClear;

    renderer.autoClear = false;

    // Disable antialiasing for ID buffer render to get exact colors
    // const gl = renderer.getContext();
    // const wasAntialiasingEnabled = gl.getParameter(gl.SAMPLE_COVERAGE);
    // if (wasAntialiasingEnabled) {
    //   gl.disable(gl.SAMPLE_COVERAGE);
    //   gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    // }

    // Materials already prepared by SceneWrapper calling prepareShadowMesh

    renderer.setRenderTarget(this.renderTargetIDBuffer);
    renderer.setClearColor(0x000000, 1); // Black only for ID buffer
    renderer.clear(true, true, true); // Clear color, depth, and stencil explicitly
    // Restore original clear color immediately after clearing ID buffer
    renderer.setClearColor(this.savedState.clearColor, this.savedState.clearAlpha);

    // First pass: Normal rendering (no offset)
    // this.updateSharedMaterialUniforms(-2.5, -2.5);
    ensureCorrectRenderState(renderer);
    renderer.render(this.sceneWrapper.outlineShadowScene, this.camera);

    // Second pass: 1-pixel right shift (additive to same buffer)
    // renderer.autoClear = false; // Don't clear between passes
    // this.updateSharedMaterialUniforms(2.5, 2.5);
    // ensureCorrectRenderState(renderer);
    // renderer.render(this.sceneWrapper.outlineShadowScene, this.camera);

    // Re-enable antialiasing if it was enabled
    // if (wasAntialiasingEnabled) {
    //   gl.enable(gl.SAMPLE_COVERAGE);
    //   gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    // }

    renderer.autoClear = oldAutoClear;
  }

  private updateSharedMaterialUniforms(offsetX: number, offsetY: number): void {
    const fixMat = (mat: Material) =>
      (mat as any).uniforms && (mat as any).uniforms["pixelOffset"].value.set(offsetX, offsetY);
    // Update all cloned materials with the new pixel offset
    this.sceneWrapper.outlineShadowScene.traverse((object: any) => {
      if (object.isMesh) {
        if (Array.isArray(object.material)) {
          object.material.map(fixMat);
        } else {
          fixMat(object.material);
        }
      }
    });
  }

  // Method called by SceneWrapper to prepare shadow meshes with ID materials
  prepareShadowMesh(shadowMesh: any, originalMesh: any): void {
    // Dispose existing materials if they exist to prevent memory leaks
    if (shadowMesh.material) {
      if (Array.isArray(shadowMesh.material)) {
        shadowMesh.material.forEach((mat: Material) => {
          this.clonedMaterials.delete(mat);
          mat.dispose();
        });
      } else {
        this.clonedMaterials.delete(shadowMesh.material);
        shadowMesh.material.dispose();
      }
    }

    // Only assign IDs to meshes that have userData.outlineColor
    let meshID = 0;
    if (originalMesh.userData?.outlineColor && originalMesh.userData?.outlineId !== undefined) {
      meshID = originalMesh.userData.outlineId;
    }

    // Encode mesh ID for lookup
    const r = ((meshID >> 16) & 0xff) / 255.0;
    const g = ((meshID >> 8) & 0xff) / 255.0;
    const b = (meshID & 0xff) / 255.0;

    // Handle both single materials and material arrays
    if (Array.isArray(originalMesh.material)) {
      // Create ID material for each material in the array
      const idMaterials = originalMesh.material.map((originalMaterial: Material) => {
        const meshMaterial = this.sharedIDMaterial.clone();
        this.clonedMaterials.add(meshMaterial); // Track for disposal

        meshMaterial.uniforms["outlineIdColor"].value = new Color(r, g, b);

        // Set static uniforms that don't change per frame (use downsampled resolution)
        const resx = Math.round(this.resolution.x / this.downSampleRatio);
        const resy = Math.round(this.resolution.y / this.downSampleRatio);
        meshMaterial.uniforms["resolution"].value.set(resx, resy);

        // Note: sceneDepthTexture and useDepthTest are now set by SceneWrapper.updateMaterials()
        // This avoids redundant updates and ensures consistency
        meshMaterial.needsUpdate = true;

        this.copyMaterialProperties(meshMaterial, originalMaterial);
        return meshMaterial;
      });

      shadowMesh.material = idMaterials;
    } else {
      // Single material case
      const meshMaterial = this.sharedIDMaterial.clone();
      this.clonedMaterials.add(meshMaterial); // Track for disposal

      meshMaterial.uniforms["outlineIdColor"].value = new Color(r, g, b);

      // Set static uniforms that don't change per frame (use downsampled resolution)
      const resx = Math.round(this.resolution.x / this.downSampleRatio);
      const resy = Math.round(this.resolution.y / this.downSampleRatio);
      meshMaterial.uniforms["resolution"].value.set(resx, resy);

      // Note: sceneDepthTexture and useDepthTest are now set by SceneWrapper.updateMaterials()
      // This avoids redundant updates and ensures consistency
      meshMaterial.needsUpdate = true;

      this.copyMaterialProperties(meshMaterial, originalMesh.material);
      shadowMesh.material = meshMaterial;
    }
  }

  // Helper method to copy material properties to ID material
  private copyMaterialProperties(idMaterial: any, originalMaterial: any): void {
    if (!originalMaterial) {
      // Default values for materials without transparency
      idMaterial.uniforms["originalOpacity"].value = 1.0;
      idMaterial.uniforms["originalMap"].value = null;
      idMaterial.uniforms["hasOriginalMap"].value = false;
      idMaterial.uniforms["alphaTest"].value = 0.0;
      idMaterial.transparent = false;
      idMaterial.opacity = 1.0;
      return;
    }

    // Check if material has any transparency
    const isTransparent =
      originalMaterial.transparent ||
      originalMaterial.alphaTest > 0 ||
      (originalMaterial.opacity !== undefined && originalMaterial.opacity < 1.0) ||
      (originalMaterial.map && originalMaterial.map.format === 1023); // RGBAFormat

    if (isTransparent) {
      // Full material property copying for transparent materials
      if (originalMaterial.transparent) {
        idMaterial.transparent = true;
      }
      if (originalMaterial.alphaTest > 0) {
        idMaterial.alphaTest = originalMaterial.alphaTest;
      }
      if (originalMaterial.opacity !== undefined && originalMaterial.opacity < 1.0) {
        idMaterial.opacity = originalMaterial.opacity;
        idMaterial.transparent = true;
      }

      // Copy texture and alpha properties to uniforms for alpha testing
      idMaterial.uniforms["originalOpacity"].value =
        originalMaterial.opacity !== undefined ? originalMaterial.opacity : 1.0;
      idMaterial.uniforms["originalMap"].value = originalMaterial.map || null;
      idMaterial.uniforms["hasOriginalMap"].value = !!originalMaterial.map;
      idMaterial.uniforms["alphaTest"].value = originalMaterial.alphaTest || 0.0;
    } else {
      // Simplified material for opaque materials - no texture sampling needed
      idMaterial.transparent = false;
      idMaterial.opacity = 1.0;
      idMaterial.alphaTest = 0.0;

      // Skip texture uniforms for opaque materials to save GPU memory
      idMaterial.uniforms["originalOpacity"].value = 1.0;
      idMaterial.uniforms["originalMap"].value = null;
      idMaterial.uniforms["hasOriginalMap"].value = false;
      idMaterial.uniforms["alphaTest"].value = 0.0;
    }

    // Always copy backface culling settings regardless of transparency
    if (originalMaterial.side !== undefined) {
      idMaterial.side = originalMaterial.side;
    }
  }

  private performIDBasedEdgeDetection(renderer: WebGLRenderer): void {
    // Collect all meshes with userData.outlineColor
    const outliningMeshes: Array<{ id: number; color: Color }> = [];

    // Use a Map to avoid O(N^2) lookups for large numbers of meshes
    const idToMesh: Map<number, Color> = new Map();

    this.sceneWrapper.outlineShadowScene.traverse((object: any) => {
      if (object.userData?.outlineColor && object.userData?.outlineId !== undefined) {
        const meshID = object.userData.outlineId;
        if (!idToMesh.has(meshID)) {
          idToMesh.set(meshID, object.userData.outlineColor);
        }
      }
    });

    idToMesh.forEach((color, id) => {
      outliningMeshes.push({ id, color });
    });

    if (this.debugMode) {
      this.debugIDMappingPass.setIDTexture(this.renderTargetIDBuffer.texture);
      this.debugIDMappingPass.setOutliningMeshes(outliningMeshes);
      this.debugIDMappingPass.setTextureSize(this.resolution.x * this.pixelRatio, this.resolution.y * this.pixelRatio);
      this.debugIDMappingPass.render(renderer, this.renderTargetEdgeBuffer1);
    } else {
      // Use normal edge detection pass
      this.idBasedEdgeDetectionPass.setIDTexture(this.renderTargetIDBuffer.texture);
      this.idBasedEdgeDetectionPass.setIDDepthTexture(this.renderTargetIDBuffer.depthTexture);
      this.idBasedEdgeDetectionPass.setSceneDepthTexture(this.sceneDepthTexture);
      this.idBasedEdgeDetectionPass.setOutliningMeshes(outliningMeshes);
      // Edge detection renders at full resolution but samples from downsampled ID buffer
      const resx = Math.round(this.resolution.x / this.downSampleRatio);
      const resy = Math.round(this.resolution.y / this.downSampleRatio);
      this.idBasedEdgeDetectionPass.setTextureSize(resx, resy); // ID buffer size for sampling
      this.idBasedEdgeDetectionPass.setThickness(this.edgeThickness);
      this.idBasedEdgeDetectionPass.setStrength(this.edgeStrength);
      this.idBasedEdgeDetectionPass.render(renderer, this.renderTargetEdgeBuffer1);
    }
  }

  private renderIDCopyToScreen(renderer: WebGLRenderer, readBuffer: WebGLRenderTarget): void {
    this.fsQuad.material = this.materialCopy;
    (this.copyUniforms["tDiffuse"].value as any) = readBuffer.texture;
    renderer.setRenderTarget(null);
    this.fsQuad.render(renderer);
  }

  // Consolidated state management
  private savedState: {
    clearColor: Color;
    clearAlpha: number;
    shadowMapEnabled: boolean;
    autoClear: boolean;
    blendEnabled: boolean;
    srcBlendFactor: number;
    dstBlendFactor: number;
  } = {
    clearColor: new Color(),
    clearAlpha: 1,
    shadowMapEnabled: true,
    autoClear: true,
    blendEnabled: false,
    srcBlendFactor: 0,
    dstBlendFactor: 0,
  };

  private saveRenderState(renderer: WebGLRenderer): void {
    // Save only Three.js renderer state
    this.savedState.clearColor.copy(renderer.getClearColor(new Color()));
    this.savedState.clearAlpha = renderer.getClearAlpha();
    this.savedState.shadowMapEnabled = renderer.shadowMap.enabled;
    this.savedState.autoClear = renderer.autoClear;
  }

  private restoreRenderState(renderer: WebGLRenderer): void {
    // Only restore Three.js renderer state, not OpenGL blend state
    // Shadows need blending to remain disabled after our processing
    renderer.setClearColor(this.savedState.clearColor, this.savedState.clearAlpha);
    renderer.autoClear = this.savedState.autoClear;
    renderer.shadowMap.enabled = this.savedState.shadowMapEnabled;
  }

  dispose(): void {
    // Dispose all cloned materials to prevent GPU memory leaks
    for (const material of this.clonedMaterials) {
      material.dispose();
    }
    this.clonedMaterials.clear();

    // Dispose shared material
    if (this.sharedIDMaterial) {
      this.sharedIDMaterial.dispose();
    }

    // Dispose copy material
    if (this.materialCopy) {
      this.materialCopy.dispose();
    }

    this.renderTargetIDBuffer.dispose();
    this.renderTargetTempBuffer.dispose();
    this.renderTargetEdgeBuffer1.dispose();
    this.idBasedEdgeDetectionPass.dispose();
  }
}
