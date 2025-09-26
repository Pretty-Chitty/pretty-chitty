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
import { InterMeshEdgeDetectionPass } from "./passes/InterMeshEdgeDetectionPass";
import { DebugIDMappingPass } from "./passes/DebugIDMappingPass";
import { FullScreenQuad } from "./FullScreenQuad";
import { CopyShader } from "./shaders";

export class IDBasedOutlinePass extends Pass {
  edgeThickness = 0;
  edgeStrength = 3.0;

  // Simplified properties for userData-based outlining
  private static instanceCounter = 0;
  private instanceId: number;

  // Debug mode toggle
  public debugMode = false;

  sceneDepthTexture: any = null;

  downSampleRatio = 2;
  fsQuad = new FullScreenQuad(null);
  materialCopy!: ShaderMaterial;

  // ID rendering
  private renderTargetIDBuffer!: WebGLRenderTarget;
  private renderTargetTempBuffer!: WebGLRenderTarget; // Dedicated temp buffer to avoid sharing conflicts
  private sharedIDMaterial!: ShaderMaterial; // Single shared material
  private idBasedEdgeDetectionPass!: InterMeshEdgeDetectionPass;
  private debugIDMappingPass!: DebugIDMappingPass;

  resolution: Vector2;
  copyUniforms!: Record<string, IUniform>;

  constructor(resolution: Vector2) {
    super();
    this.resolution = resolution ? new Vector2(resolution.x, resolution.y) : new Vector2(256, 256);
    this.instanceId = ++IDBasedOutlinePass.instanceCounter;

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
    // Create ID buffer render target with depth buffer
    // Use NearestFilter to avoid any interpolation/antialiasing for exact ID colors
    const pars = { minFilter: NearestFilter, magFilter: NearestFilter, format: RGBAFormat, depthBuffer: true };
    this.renderTargetIDBuffer = new WebGLRenderTarget(this.resolution.x, this.resolution.y, pars);
    this.renderTargetIDBuffer.texture.name = "IDBasedOutline.idBuffer";
    this.renderTargetIDBuffer.texture.generateMipmaps = false;

    // Add depth texture to ID buffer
    this.renderTargetIDBuffer.depthTexture = new DepthTexture(this.resolution.x, this.resolution.y);
    this.renderTargetIDBuffer.depthTexture.type = UnsignedShortType;

    // Create dedicated temp buffer to avoid cross-contamination
    this.renderTargetTempBuffer = new WebGLRenderTarget(this.resolution.x, this.resolution.y, pars);
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
    this.sharedIDMaterial = new ShaderMaterial({
      uniforms: {
        outlineIdColor: { value: new Color(1, 1, 1) }, // Will be updated per mesh (encoded outlineId)
        sceneDepthTexture: { value: null }, // Will be set before rendering
        useDepthTest: { value: false }, // Will be updated before rendering
        resolution: { value: new Vector2(this.resolution.x, this.resolution.y) },
        cameraDistance: { value: 1.0 }, // Will be updated per mesh
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

        void main() {
          vUv = uv;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vProjectedCoord = projectionMatrix * mvPosition;

          // Apply pixel offset in screen space
          vec2 pixelSize = 2.0 / resolution; // Size of one pixel in NDC
          vec2 offset = pixelOffset * pixelSize;

          gl_Position = vProjectedCoord + vec4(offset, 0.0, 0.0);
        }
      `,
      fragmentShader: `
        uniform vec3 outlineIdColor;
        uniform sampler2D sceneDepthTexture;
        uniform bool useDepthTest;
        uniform vec2 resolution;
        uniform float cameraDistance;
        uniform sampler2D originalMap;
        uniform float originalOpacity;
        uniform float alphaTest;
        uniform bool hasOriginalMap;
        varying vec2 vUv;
        varying vec4 vProjectedCoord;

        void main() {
          // Handle backface culling
          if (!gl_FrontFacing) {
            discard; // Only render front faces
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
            // Scale tolerance based on camera distance - closer = tighter tolerance
            float baseTolerance = 0.001;
            float depthTolerance = baseTolerance * (cameraDistance * 0.15);
            // if (abs(currentDepth - sceneDepth) > depthTolerance) {
            //   discard;  // Only discard if significantly behind
            // }
          }

          // Write the encoded outlineId to the buffer
          gl_FragColor = vec4(outlineIdColor, 1.0);
        }
      `,
      side: FrontSide, // Default to front side, will be overridden per material
    });
  }

  // Simplified API - no more edge modes, just outline meshes with userData.outlineColor

  override setSize(width: number, height: number): void {
    // Call parent first to resize all the inherited render targets
    this.renderTargetMaskBuffer.setSize(width, height);

    let resx = Math.round(width / this.downSampleRatio);
    let resy = Math.round(height / this.downSampleRatio);
    this.renderTargetEdgeBuffer1.setSize(resx, resy);

    resx = Math.round(resx / 2);
    resy = Math.round(resy / 2);

    // CRITICAL: Update our internal resolution property
    this.resolution.set(width, height);

    // Resize our additional buffers
    this.renderTargetIDBuffer.setSize(width, height);
    this.renderTargetTempBuffer.setSize(width, height);

    // Update depth texture for ID buffer
    if (this.renderTargetIDBuffer.depthTexture) {
      this.renderTargetIDBuffer.depthTexture.dispose();
      this.renderTargetIDBuffer.depthTexture = new DepthTexture(width, height);
      this.renderTargetIDBuffer.depthTexture.type = UnsignedShortType;
    }

    // Sizes updated successfully

    // Update edge detection pass texture size
    this.idBasedEdgeDetectionPass.setTextureSize(
      Math.round(width / this.downSampleRatio),
      Math.round(height / this.downSampleRatio),
    );
  }

  override render(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
    maskActive: boolean,
  ): void {
    const renderStart = performance.now();

    // Always ensure our sizes match the current renderer - critical for shared renderers
    const currentSize = renderer.getSize(new Vector2());

    // Force resize if there's any mismatch to prevent cross-contamination
    if (Math.abs(currentSize.x - this.resolution.x) > 1 || Math.abs(currentSize.y - this.resolution.y) > 1) {
      this.setSize(currentSize.x, currentSize.y);
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

    // Set the depth texture from the read buffer (output of previous render pass)
    this.setSceneDepthTexture(readBuffer.depthTexture);

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

    // Then composite temp + edges to final buffer (writeBuffer, not readBuffer!)
    renderer.setRenderTarget(writeBuffer);
    renderer.clear(); // Clear the buffer to ensure proper compositing

    // Copy temp buffer to output
    (this.copyUniforms["tDiffuse"].value as any) = this.renderTargetTempBuffer.texture;
    this.fsQuad.render(renderer);

    // Add edges using Three.js material blending instead of direct OpenGL
    renderer.autoClear = false;

    // // Use Three.js's own blending by setting the material to use normal blending
    const originalBlending = this.materialCopy.blending;
    const originalTransparent = this.materialCopy.transparent;

    this.materialCopy.blending = NormalBlending;
    this.materialCopy.transparent = true;
    this.materialCopy.needsUpdate = true;

    (this.copyUniforms["tDiffuse"].value as any) = this.renderTargetEdgeBuffer1.texture;
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
    if (Math.random() < 0.016) {
      // ~1/60 chance
      console.log(`Outline Pass Timing:
  Total: ${totalTime.toFixed(2)}ms
  SceneWrapper Update: ${updateTime.toFixed(2)}ms
  ID Buffer Render: ${idBufferTime.toFixed(2)}ms
  Edge Detection: ${edgeDetectTime.toFixed(2)}ms
  Compositing: ${compositingTime.toFixed(2)}ms`);
    }
  }

  renderTargetMaskBuffer!: WebGLRenderTarget;
  renderTargetMaskDownSampleBuffer!: WebGLRenderTarget;
  renderTargetBlurBuffer1!: WebGLRenderTarget;
  renderTargetBlurBuffer2!: WebGLRenderTarget;
  renderTargetEdgeBuffer1!: WebGLRenderTarget;
  renderTargetEdgeBuffer2!: WebGLRenderTarget;
  separableBlurMaterial1!: any;
  separableBlurMaterial2!: any;

  private initializeRenderTargets(): void {
    const pars = { minFilter: LinearFilter, magFilter: LinearFilter, format: RGBAFormat } as any;

    const resx = Math.round(this.resolution.x / this.downSampleRatio);
    const resy = Math.round(this.resolution.y / this.downSampleRatio);

    this.renderTargetMaskBuffer = new WebGLRenderTarget(this.resolution.x, this.resolution.y, pars);
    this.renderTargetMaskBuffer.texture.name = "OutlinePass.mask";
    this.renderTargetMaskBuffer.texture.generateMipmaps = false;

    this.renderTargetMaskDownSampleBuffer = new WebGLRenderTarget(resx, resy, pars);
    this.renderTargetMaskDownSampleBuffer.texture.name = "OutlinePass.maskDownSample";
    this.renderTargetMaskDownSampleBuffer.texture.generateMipmaps = false;

    this.renderTargetBlurBuffer1 = new WebGLRenderTarget(resx, resy, pars);
    this.renderTargetBlurBuffer1.texture.name = "OutlinePass.blur1";
    this.renderTargetBlurBuffer1.texture.generateMipmaps = false;

    this.renderTargetBlurBuffer2 = new WebGLRenderTarget(resx / 2, resy / 2, pars);
    this.renderTargetBlurBuffer2.texture.name = "OutlinePass.blur2";
    this.renderTargetBlurBuffer2.texture.generateMipmaps = false;

    this.renderTargetEdgeBuffer1 = new WebGLRenderTarget(resx, resy, pars);
    this.renderTargetEdgeBuffer1.texture.name = "OutlinePass.edge1";
    this.renderTargetEdgeBuffer1.texture.generateMipmaps = false;

    this.renderTargetEdgeBuffer2 = new WebGLRenderTarget(resx / 2, resy / 2, pars);
    this.renderTargetEdgeBuffer2.texture.name = "OutlinePass.edge2";
    this.renderTargetEdgeBuffer2.texture.generateMipmaps = false;

    // Create placeholder materials to prevent errors
    this.separableBlurMaterial1 = { uniforms: { texSize: { value: new Vector2(resx, resy) } } };
    this.separableBlurMaterial2 = { uniforms: { texSize: { value: new Vector2(resx / 2, resy / 2) } } };
  }

  setSceneDepthTexture(depthTexture: any): void {
    this.sceneDepthTexture = depthTexture;
  }

  private renderIDBuffer(renderer: WebGLRenderer): void {
    const oldAutoClear = renderer.autoClear;

    renderer.autoClear = false;

    // Disable antialiasing for ID buffer render to get exact colors
    const gl = renderer.getContext();
    const wasAntialiasingEnabled = gl.getParameter(gl.SAMPLE_COVERAGE);
    if (wasAntialiasingEnabled) {
      gl.disable(gl.SAMPLE_COVERAGE);
      gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    }

    // Materials already prepared by SceneWrapper calling prepareShadowMesh

    renderer.setRenderTarget(this.renderTargetIDBuffer);
    renderer.setClearColor(0x000000, 1); // Black only for ID buffer
    renderer.clear(true, true, true); // Clear color, depth, and stencil explicitly
    // Restore original clear color immediately after clearing ID buffer
    renderer.setClearColor(this.savedState.clearColor, this.savedState.clearAlpha);

    // First pass: Normal rendering (no offset)
    this.updateSharedMaterialUniforms(-2.5, -2.5);
    renderer.render(this.sceneWrapper.outlineShadowScene, this.camera);

    // Second pass: 1-pixel right shift (additive to same buffer)
    renderer.autoClear = false; // Don't clear between passes
    this.updateSharedMaterialUniforms(2.5, 2.5);
    renderer.render(this.sceneWrapper.outlineShadowScene, this.camera);

    // Re-enable antialiasing if it was enabled
    if (wasAntialiasingEnabled) {
      gl.enable(gl.SAMPLE_COVERAGE);
      gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    }

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
        meshMaterial.uniforms["outlineIdColor"].value = new Color(r, g, b);

        // Set static uniforms that don't change per frame
        meshMaterial.uniforms["sceneDepthTexture"].value = this.sceneDepthTexture;
        meshMaterial.uniforms["useDepthTest"].value = this.sceneDepthTexture !== null;
        meshMaterial.uniforms["resolution"].value.set(this.resolution.x, this.resolution.y);

        meshMaterial.needsUpdate = true;

        this.copyMaterialProperties(meshMaterial, originalMaterial);
        return meshMaterial;
      });

      shadowMesh.material = idMaterials;
    } else {
      // Single material case
      const meshMaterial = this.sharedIDMaterial.clone();
      meshMaterial.uniforms["outlineIdColor"].value = new Color(r, g, b);

      // Set static uniforms that don't change per frame
      meshMaterial.uniforms["sceneDepthTexture"].value = this.sceneDepthTexture;
      meshMaterial.uniforms["useDepthTest"].value = this.sceneDepthTexture !== null;
      meshMaterial.uniforms["resolution"].value.set(this.resolution.x, this.resolution.y);

      meshMaterial.needsUpdate = true;

      this.copyMaterialProperties(meshMaterial, originalMesh.material);
      shadowMesh.material = meshMaterial;
    }
  }

  // Helper method to copy material properties to ID material
  private copyMaterialProperties(idMaterial: any, originalMaterial: any): void {
    if (originalMaterial) {
      // Copy alpha-related properties
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

      // Copy backface culling settings
      if (originalMaterial.side !== undefined) {
        idMaterial.side = originalMaterial.side;
      }

      // Copy texture and alpha properties to uniforms
      idMaterial.uniforms["originalOpacity"].value =
        originalMaterial.opacity !== undefined ? originalMaterial.opacity : 1.0;
      idMaterial.uniforms["originalMap"].value = originalMaterial.map || null;
      idMaterial.uniforms["hasOriginalMap"].value = !!originalMaterial.map;
      idMaterial.uniforms["alphaTest"].value = originalMaterial.alphaTest || 0.0;
    } else {
      // Default values for materials without transparency
      idMaterial.uniforms["originalOpacity"].value = 1.0;
      idMaterial.uniforms["originalMap"].value = null;
      idMaterial.uniforms["hasOriginalMap"].value = false;
      idMaterial.uniforms["alphaTest"].value = 0.0;
      idMaterial.transparent = false;
      idMaterial.opacity = 1.0;
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
      this.debugIDMappingPass.setTextureSize(
        Math.round(this.resolution.x / this.downSampleRatio),
        Math.round(this.resolution.y / this.downSampleRatio),
      );
      this.debugIDMappingPass.render(renderer, this.renderTargetEdgeBuffer1);
    } else {
      // Use normal edge detection pass
      this.idBasedEdgeDetectionPass.setIDTexture(this.renderTargetIDBuffer.texture);
      this.idBasedEdgeDetectionPass.setIDDepthTexture(this.renderTargetIDBuffer.depthTexture);
      this.idBasedEdgeDetectionPass.setSceneDepthTexture(this.sceneDepthTexture);
      this.idBasedEdgeDetectionPass.setOutliningMeshes(outliningMeshes);
      this.idBasedEdgeDetectionPass.setTextureSize(
        Math.round(this.resolution.x / this.downSampleRatio),
        Math.round(this.resolution.y / this.downSampleRatio),
      );
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
    this.renderTargetIDBuffer.dispose();
    this.renderTargetTempBuffer.dispose();
    this.renderTargetMaskBuffer.dispose();
    this.renderTargetMaskDownSampleBuffer.dispose();
    this.renderTargetBlurBuffer1.dispose();
    this.renderTargetBlurBuffer2.dispose();
    this.renderTargetEdgeBuffer1.dispose();
    this.renderTargetEdgeBuffer2.dispose();
    this.idBasedEdgeDetectionPass.dispose();
  }
}
