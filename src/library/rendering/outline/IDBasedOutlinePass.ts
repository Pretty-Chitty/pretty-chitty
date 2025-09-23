import {
  Color,
  Vector2,
  WebGLRenderTarget,
  WebGLRenderer,
  Scene,
  LinearFilter,
  NearestFilter,
  RGBAFormat,
  MeshBasicMaterial,
  DoubleSide,
  PerspectiveCamera,
  DepthTexture,
  UnsignedShortType,
  ShaderMaterial,
} from "three";
import { OutlinePass } from "./OutlinePass";
import { Camera } from "./types";
import { InterMeshEdgeDetectionPass, EdgeMode } from "./passes/InterMeshEdgeDetectionPass";
import { DebugIDMappingPass } from "./passes/DebugIDMappingPass";

export class IDBasedOutlinePass extends OutlinePass {
  // Simplified properties for userData-based outlining
  private static instanceCounter = 0;
  private instanceId: number;

  // Debug mode toggle
  public debugMode = false;

  // ID rendering
  private renderTargetIDBuffer!: WebGLRenderTarget;
  private renderTargetTempBuffer!: WebGLRenderTarget; // Dedicated temp buffer to avoid sharing conflicts
  private originalMaterials = new Map<any, any>();
  private sharedIDMaterial!: ShaderMaterial; // Single shared material
  private idBasedEdgeDetectionPass!: InterMeshEdgeDetectionPass;
  private debugIDMappingPass!: DebugIDMappingPass;

  constructor(resolution: Vector2, scene?: Scene, camera?: Camera, selectedObjects?: Array<any>) {
    super(resolution, scene, camera, selectedObjects);

    this.instanceId = ++IDBasedOutlinePass.instanceCounter;

    // Initialize ID-based components
    this.initializeIDComponents();
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
        varying vec2 vUv;
        varying vec4 vProjectedCoord;

        void main() {
          if (useDepthTest) {
            // Convert screen space position to UV coordinates
            vec2 screenUV = (vProjectedCoord.xy / vProjectedCoord.w) * 0.5 + 0.5;

            // Sample the main scene depth at this pixel
            float sceneDepth = texture2D(sceneDepthTexture, screenUV).r;

            // Current fragment depth in screen space
            float currentDepth = (gl_FragCoord.z);

            // Only draw if depths approximately match (mesh is visible in main scene)
            // Scale tolerance based on camera distance - closer = tighter tolerance
            float baseTolerance = 0.03;
            float depthTolerance = baseTolerance * (cameraDistance * 0.025);
            if (currentDepth > sceneDepth + depthTolerance) {
              discard;  // Only discard if significantly behind
            }
          }

          // Write the encoded outlineId to the buffer
          gl_FragColor = vec4(outlineIdColor, 1.0);
        }
      `,
      side: DoubleSide,
    });
  }

  // Simplified API - no more edge modes, just outline meshes with userData.outlineColor

  override setSize(width: number, height: number): void {
    // Call parent first to resize all the inherited render targets
    super.setSize(width, height);

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
    deltaTime: number,
    maskActive: boolean,
  ): void {
    // Always ensure our sizes match the current renderer - critical for shared renderers
    const currentSize = renderer.getSize(new Vector2());

    // Force resize if there's any mismatch to prevent cross-contamination
    if (Math.abs(currentSize.x - this.resolution.x) > 1 || Math.abs(currentSize.y - this.resolution.y) > 1) {
      this.setSize(currentSize.x, currentSize.y);
    }
    // Check if any meshes have userData.outlineColor
    let hasOutlinedMeshes = false;
    this.renderScene.traverse((object: any) => {
      if (object.isMesh && object.userData?.outlineColor) {
        hasOutlinedMeshes = true;
      }
    });

    if (!hasOutlinedMeshes) {
      if (this.renderToScreen) {
        this.renderIDCopyToScreen(renderer, readBuffer);
      }
      return;
    }

    this.saveIDRenderState(renderer);
    this.setupIDRenderState(renderer, maskActive);

    // Set the depth texture from the read buffer (output of previous render pass)
    this.setSceneDepthTexture(readBuffer.depthTexture);

    // Step 1: Render ID buffer
    this.renderIDBuffer(renderer);

    // Step 2: Use ID-based edge detection instead of the original method
    this.performIDBasedEdgeDetection(renderer);

    // Step 3: Safe composition using dedicated temporary buffer to avoid feedback loops
    // First copy original scene to our dedicated temp buffer
    this.fsQuad.material = this.materialCopy;
    (this.copyUniforms["tDiffuse"].value as any) = readBuffer.texture;
    renderer.setRenderTarget(this.renderTargetTempBuffer); // Use dedicated temp buffer
    this.fsQuad.render(renderer);

    // Then composite temp + edges to final buffer
    renderer.setRenderTarget(readBuffer);
    renderer.clear();

    // Copy temp buffer to output
    (this.copyUniforms["tDiffuse"].value as any) = this.renderTargetTempBuffer.texture;
    this.fsQuad.render(renderer);

    // Add edges with proper alpha blending
    renderer.autoClear = false;
    const gl = renderer.getContext();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    (this.copyUniforms["tDiffuse"].value as any) = this.renderTargetEdgeBuffer1.texture;
    this.fsQuad.render(renderer);

    gl.disable(gl.BLEND);
    renderer.autoClear = true;

    this.restoreIDRenderState(renderer);

    if (this.renderToScreen) {
      this.renderIDCopyToScreen(renderer, readBuffer);
    }
  }

  private renderIDBuffer(renderer: WebGLRenderer): void {
    const oldAutoClear = renderer.autoClear;
    const currentBackground = this.renderScene.background;

    renderer.autoClear = false;
    this.renderScene.background = null;

    // Disable antialiasing for ID buffer render to get exact colors
    const gl = renderer.getContext();
    const wasAntialiasingEnabled = gl.getParameter(gl.SAMPLE_COVERAGE);
    if (wasAntialiasingEnabled) {
      gl.disable(gl.SAMPLE_COVERAGE);
      gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    }

    // Replace all materials with ID materials
    this.applyIDMaterials();

    renderer.setRenderTarget(this.renderTargetIDBuffer);
    renderer.clear(true, true, true); // Clear color, depth, and stencil explicitly

    // First pass: Normal rendering (no offset)
    this.updateSharedMaterialUniforms(0.0, 0.0);
    renderer.render(this.renderScene, this.renderCamera);

    // Second pass: 1-pixel right shift (additive to same buffer)
    renderer.autoClear = false; // Don't clear between passes
    this.updateSharedMaterialUniforms(1.0, 0.0);
    renderer.render(this.renderScene, this.renderCamera);

    // Restore original materials
    this.restoreOriginalMaterials();

    // Re-enable antialiasing if it was enabled
    if (wasAntialiasingEnabled) {
      gl.enable(gl.SAMPLE_COVERAGE);
      gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    }

    this.renderScene.background = currentBackground;
    renderer.autoClear = oldAutoClear;
  }

  private updateSharedMaterialUniforms(offsetX: number, offsetY: number): void {
    // Update all cloned materials with the new pixel offset
    this.renderScene.traverse((object: any) => {
      if (object.isMesh && object.material && object.material.uniforms) {
        object.material.uniforms["pixelOffset"].value.set(offsetX, offsetY);
      }
    });
  }

  private applyIDMaterials(): void {
    this.originalMaterials.clear();

    // Update shared material uniforms for this render
    this.sharedIDMaterial.uniforms["sceneDepthTexture"].value = this.sceneDepthTexture;
    this.sharedIDMaterial.uniforms["useDepthTest"].value = this.sceneDepthTexture !== null;
    this.sharedIDMaterial.uniforms["resolution"].value.set(this.resolution.x, this.resolution.y);

    this.renderScene.traverse((object: any) => {
      if (object.isMesh) {
        // Store original material
        this.originalMaterials.set(object, object.material);

        // Only assign IDs to meshes that have userData.outlineColor
        // Use ONLY the outlineId, never object.id
        let meshID = 0;
        if (object.userData?.outlineColor && object.userData?.outlineId !== undefined) {
          meshID = object.userData.outlineId;
        }

        // Encode mesh ID for lookup
        const r = ((meshID >> 16) & 0xff) / 255.0;
        const g = ((meshID >> 8) & 0xff) / 255.0;
        const b = (meshID & 0xff) / 255.0;

        // Clone the shared material and set the encoded ID
        const meshMaterial = this.sharedIDMaterial.clone();
        meshMaterial.uniforms["outlineIdColor"].value = new Color(r, g, b);

        // Pass camera distance for depth tolerance scaling
        const cameraDistance = this.renderCamera.position.length();
        meshMaterial.uniforms["cameraDistance"] = { value: cameraDistance };

        object.material = meshMaterial;
      }
    });
  }

  private restoreOriginalMaterials(): void {
    this.renderScene.traverse((object: any) => {
      if (object.isMesh) {
        const originalMaterial = this.originalMaterials.get(object);
        if (originalMaterial) {
          object.material = originalMaterial;
        } else {
          console.warn("No original material found for mesh:", object);
        }
      }
    });
  }

  private performIDBasedEdgeDetection(renderer: WebGLRenderer): void {
    // Collect all meshes with userData.outlineColor
    const outliningMeshes: Array<{ id: number; color: Color }> = [];

    this.renderScene.traverse((object: any) => {
      if (object.isMesh && object.userData?.outlineColor && object.userData?.outlineId !== undefined) {
        // Use ONLY the outlineId, never object.id
        const meshID = object.userData.outlineId;

        // Check if we already have this ID (for grouped meshes)
        const existing = outliningMeshes.find((m) => m.id === meshID);
        if (!existing) {
          outliningMeshes.push({
            id: meshID,
            color: object.userData.outlineColor,
          });
        }
      }
    });

    if (this.debugMode) {
      // Use debug pass to visualize ID->Color mapping
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
      this.idBasedEdgeDetectionPass.render(renderer, this.renderTargetEdgeBuffer1);
    }
  }

  // Reuse the original blur and composite methods from OutlinePass
  private performIDBlurPasses(renderer: WebGLRenderer): void {
    // First blur pass (half res)
    this.separableBlurMaterial1.uniforms["kernelRadius"].value = this.edgeThickness;
    this.fsQuad.material = this.separableBlurMaterial1;

    // Horizontal blur
    (this.separableBlurMaterial1.uniforms["direction"].value as Vector2).copy(OutlinePass.BlurDirectionX);
    (this.separableBlurMaterial1.uniforms["colorTexture"].value as any) = this.renderTargetEdgeBuffer1.texture;
    renderer.setRenderTarget(this.renderTargetBlurBuffer1);
    renderer.clear();
    this.fsQuad.render(renderer);

    // Vertical blur
    (this.separableBlurMaterial1.uniforms["direction"].value as Vector2).copy(OutlinePass.BlurDirectionY);
    (this.separableBlurMaterial1.uniforms["colorTexture"].value as any) = this.renderTargetBlurBuffer1.texture;
    renderer.setRenderTarget(this.renderTargetEdgeBuffer1);
    renderer.clear();
    this.fsQuad.render(renderer);

    // Second blur pass (quarter res)
    this.separableBlurMaterial2.uniforms["kernelRadius"].value = 4;
    this.fsQuad.material = this.separableBlurMaterial2;

    // Horizontal blur
    (this.separableBlurMaterial2.uniforms["direction"].value as Vector2).copy(OutlinePass.BlurDirectionX);
    (this.separableBlurMaterial2.uniforms["colorTexture"].value as any) = this.renderTargetEdgeBuffer1.texture;
    renderer.setRenderTarget(this.renderTargetBlurBuffer2);
    renderer.clear();
    this.fsQuad.render(renderer);

    // Vertical blur
    (this.separableBlurMaterial2.uniforms["direction"].value as Vector2).copy(OutlinePass.BlurDirectionY);
    (this.separableBlurMaterial2.uniforms["colorTexture"].value as any) = this.renderTargetBlurBuffer2.texture;
    renderer.setRenderTarget(this.renderTargetEdgeBuffer2);
    renderer.clear();
    this.fsQuad.render(renderer);
  }

  private renderIDOverlay(renderer: WebGLRenderer, readBuffer: WebGLRenderTarget, maskActive: boolean): void {
    this.fsQuad.material = this.overlayMaterial;

    // Use the original mask texture (depth-based) for now to debug
    (this.overlayMaterial.uniforms["maskTexture"].value as any) = this.renderTargetMaskBuffer.texture;
    (this.overlayMaterial.uniforms["edgeTexture1"].value as any) = this.renderTargetEdgeBuffer1.texture;
    (this.overlayMaterial.uniforms["edgeTexture2"].value as any) = this.renderTargetEdgeBuffer2.texture;
    (this.overlayMaterial.uniforms["patternTexture"].value as any) = this.patternTexture;
    (this.overlayMaterial.uniforms["edgeStrength"].value as number) = this.edgeStrength;
    (this.overlayMaterial.uniforms["edgeGlow"].value as number) = this.edgeGlow;
    (this.overlayMaterial.uniforms["usePatternTexture"].value as boolean) = this.usePatternTexture;

    if (maskActive) (renderer.state as any).buffers.stencil.setTest(true);

    renderer.setRenderTarget(readBuffer);
    this.fsQuad.render(renderer);
  }

  private renderIDCopyToScreen(renderer: WebGLRenderer, readBuffer: WebGLRenderTarget): void {
    this.fsQuad.material = this.materialCopy;
    (this.copyUniforms["tDiffuse"].value as any) = readBuffer.texture;
    renderer.setRenderTarget(null);
    this.fsQuad.render(renderer);
  }

  private saveIDRenderState(renderer: WebGLRenderer): void {
    this.oldClearColor.copy(renderer.getClearColor(new Color()));
    this.oldClearAlpha = renderer.getClearAlpha();
  }

  private setupIDRenderState(renderer: WebGLRenderer, maskActive: boolean): void {
    renderer.autoClear = false;
    if (maskActive) (renderer.state as any).buffers.stencil.setTest(false);
    renderer.setClearColor(0x000000, 1); // Black background for ID buffer
  }

  private restoreIDRenderState(renderer: WebGLRenderer): void {
    renderer.setClearColor(this.oldClearColor, this.oldClearAlpha);
    renderer.autoClear = true;
  }

  override dispose(): void {
    super.dispose();

    this.renderTargetIDBuffer.dispose();
    this.renderTargetTempBuffer.dispose();
    this.idBasedEdgeDetectionPass.dispose();

    // Dispose all created ID materials
    for (const material of this.idMaterials.values()) {
      material.dispose();
    }
    this.idMaterials.clear();
    this.originalMaterials.clear();
  }
}
