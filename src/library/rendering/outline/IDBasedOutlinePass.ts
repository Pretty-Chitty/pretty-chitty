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
  // Additional properties for ID-based detection
  interMeshEdgeColor = new Color(0.5, 0.5, 0.5);
  edgeMode = EdgeMode.SELECTED_ONLY;
  showInterMeshEdges = false;

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

  setShowInterMeshEdges(show: boolean): void {
    this.showInterMeshEdges = show;
    if (show && this.selectedObjects.length > 0) {
      this.edgeMode = EdgeMode.SELECTED_AND_BOUNDARIES;
    } else if (show) {
      this.edgeMode = EdgeMode.ALL_MESHES;
    } else {
      this.edgeMode = EdgeMode.SELECTED_ONLY;
    }
  }

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
    if (this.selectedObjects.length === 0 && !this.showInterMeshEdges) {
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

    // Step 3: Simple composition - copy original scene first, then add edges
    this.fsQuad.material = this.materialCopy;
    (this.copyUniforms["tDiffuse"].value as any) = readBuffer.texture;
    renderer.setRenderTarget(readBuffer);
    this.fsQuad.render(renderer);

    // Add edges with proper alpha blending to preserve edge colors
    renderer.autoClear = false;
    const gl = renderer.getContext();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); // Standard alpha blending

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

        // Use the actual mesh ID that will be consistent with selected objects
        const meshID = object.id;


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
    // Configure the ID-based edge detection
    this.idBasedEdgeDetectionPass.visibleEdgeColor.copy(this.visibleEdgeColor);
    this.idBasedEdgeDetectionPass.interMeshEdgeColor.copy(this.interMeshEdgeColor);
    this.idBasedEdgeDetectionPass.pulsePeriod = this.pulsePeriod;
    this.idBasedEdgeDetectionPass.edgeMode = this.edgeMode;

    // Use convenience toggle if set - now enable the actual inter-mesh detection
    if (this.showInterMeshEdges && this.selectedObjects.length > 0) {
      this.idBasedEdgeDetectionPass.edgeMode = EdgeMode.SELECTED_AND_BOUNDARIES;
    } else if (this.showInterMeshEdges) {
      this.idBasedEdgeDetectionPass.edgeMode = EdgeMode.ALL_MESHES;
    }


    this.idBasedEdgeDetectionPass.setIDTexture(this.renderTargetIDBuffer.texture);
    this.idBasedEdgeDetectionPass.setSelectedObjects(this.selectedObjects);
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