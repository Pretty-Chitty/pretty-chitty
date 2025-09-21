import {
  Color,
  Vector2,
  WebGLRenderTarget,
  WebGLRenderer,
  Scene,
  LinearFilter,
  RGBAFormat,
  MeshBasicMaterial,
  DoubleSide,
} from "three";
import { OutlinePass } from "./OutlinePass";
import { Camera } from "./types";
import { InterMeshEdgeDetectionPass, EdgeMode } from "./passes/InterMeshEdgeDetectionPass";

export class IDBasedOutlinePass extends OutlinePass {
  // Simplified properties for userData-based outlining

  // ID rendering
  private renderTargetIDBuffer!: WebGLRenderTarget;
  private originalMaterials = new Map<any, any>();
  private idMaterials = new Map<number, MeshBasicMaterial>();
  private idBasedEdgeDetectionPass!: InterMeshEdgeDetectionPass;

  constructor(
    resolution: Vector2,
    scene: Scene,
    camera: Camera,
    selectedObjects?: Array<any>,
  ) {
    super(resolution, scene, camera, selectedObjects);

    // Initialize ID-based components
    this.initializeIDComponents();
  }

  private initializeIDComponents(): void {
    // Create ID buffer render target
    const pars = { minFilter: LinearFilter, magFilter: LinearFilter, format: RGBAFormat };
    this.renderTargetIDBuffer = new WebGLRenderTarget(this.resolution.x, this.resolution.y, pars);
    this.renderTargetIDBuffer.texture.name = "IDBasedOutline.idBuffer";
    this.renderTargetIDBuffer.texture.generateMipmaps = false;

    // Create ID-based edge detection pass
    this.idBasedEdgeDetectionPass = new InterMeshEdgeDetectionPass();
  }

  // Simplified API - no more edge modes, just outline meshes with userData.outlineColor

  override setSize(width: number, height: number): void {
    super.setSize(width, height);
    this.renderTargetIDBuffer.setSize(width, height);
  }

  override render(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ): void {
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

    // Step 1: Render ID buffer
    this.renderIDBuffer(renderer);

    // Step 2: Use ID-based edge detection instead of the original method
    this.performIDBasedEdgeDetection(renderer);

    // Step 3: Safe composition using temporary buffer to avoid feedback loops
    // First copy original scene to a temp buffer
    this.fsQuad.material = this.materialCopy;
    (this.copyUniforms["tDiffuse"].value as any) = readBuffer.texture;
    renderer.setRenderTarget(this.renderTargetBlurBuffer1); // Use blur buffer as temp
    this.fsQuad.render(renderer);

    // Then composite temp + edges to final buffer
    renderer.setRenderTarget(readBuffer);
    renderer.clear();

    // Copy temp buffer to output
    (this.copyUniforms["tDiffuse"].value as any) = this.renderTargetBlurBuffer1.texture;
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

    // Replace all materials with ID materials
    this.applyIDMaterials();

    renderer.setRenderTarget(this.renderTargetIDBuffer);
    renderer.clear();
    renderer.render(this.renderScene, this.renderCamera);

    // Restore original materials
    this.restoreOriginalMaterials();

    this.renderScene.background = currentBackground;
    renderer.autoClear = oldAutoClear;
  }

  private applyIDMaterials(): void {
    this.originalMaterials.clear();

    this.renderScene.traverse((object: any) => {
      if (object.isMesh) {
        // Store original material
        this.originalMaterials.set(object, object.material);

        // Only assign IDs to meshes that have userData.outlineColor
        // All others get ID 0 (background/black)
        const meshID = object.userData?.outlineColor ? object.id : 0;

        // Get or create ID material for this mesh
        let idMaterial = this.idMaterials.get(meshID);
        if (!idMaterial) {
          idMaterial = this.createIDMaterial(meshID);
          this.idMaterials.set(meshID, idMaterial);
        }

        object.material = idMaterial;
      }
    });
  }

  private restoreOriginalMaterials(): void {
    this.renderScene.traverse((object: any) => {
      if (object.isMesh) {
        const originalMaterial = this.originalMaterials.get(object);
        if (originalMaterial) {
          object.material = originalMaterial;
        }
      }
    });
  }

  private createIDMaterial(meshID: number): MeshBasicMaterial {
    // Encode mesh ID as RGB color (supports up to 16M unique objects)
    const r = ((meshID >> 16) & 0xff) / 255.0;
    const g = ((meshID >> 8) & 0xff) / 255.0;
    const b = (meshID & 0xff) / 255.0;

    return new MeshBasicMaterial({
      color: new Color(r, g, b),
      side: DoubleSide,
    });
  }

  private performIDBasedEdgeDetection(renderer: WebGLRenderer): void {
    // Collect all meshes with userData.outlineColor
    const outliningMeshes: Array<{id: number, color: Color}> = [];

    this.renderScene.traverse((object: any) => {
      if (object.isMesh && object.userData?.outlineColor) {
        outliningMeshes.push({
          id: object.id,
          color: object.userData.outlineColor
        });
      }
    });

    this.idBasedEdgeDetectionPass.setIDTexture(this.renderTargetIDBuffer.texture);
    this.idBasedEdgeDetectionPass.setOutliningMeshes(outliningMeshes);
    this.idBasedEdgeDetectionPass.setTextureSize(
      Math.round(this.resolution.x / this.downSampleRatio),
      Math.round(this.resolution.y / this.downSampleRatio)
    );

    this.idBasedEdgeDetectionPass.render(renderer, this.renderTargetEdgeBuffer1);
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
    this.idBasedEdgeDetectionPass.dispose();

    // Dispose all created ID materials
    for (const material of this.idMaterials.values()) {
      material.dispose();
    }
    this.idMaterials.clear();
    this.originalMaterials.clear();
  }
}