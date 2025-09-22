import { Scene, Vector2, Color, WebGLRenderer, WebGLRenderTarget, LinearFilter, RGBAFormat } from "three";
import { Pass, Camera } from "../types";
import { ShaderPass } from "../ShaderPass";
import { CopyShader } from "../shaders";
import { ObjectIDRenderPass } from "./ObjectIDRenderPass";
import { InterMeshEdgeDetectionPass, EdgeMode } from "./InterMeshEdgeDetectionPass";
import { BlurPass, BlurDirection } from "./BlurPass";
import { OutlineCompositePass } from "./OutlineCompositePass";

export class EnhancedOutlineEffectComposer extends Pass {
  renderScene: Scene;
  renderCamera: Camera;
  selectedObjects: Array<any>;

  // Public configuration
  visibleEdgeColor = new Color(1, 1, 1);
  interMeshEdgeColor = new Color(0.5, 0.5, 0.5); // Color for edges between different meshes
  edgeGlow = 0.0;
  usePatternTexture = false;
  edgeThickness = 1.0;
  edgeStrength = 3.0;
  downSampleRatio = 2;
  pulsePeriod = 0;
  patternTexture: any = null;

  // New edge detection options
  edgeMode = EdgeMode.SELECTED_ONLY;
  minEdgeStrength = 0.1;
  showInterMeshEdges = false; // Simple toggle for common use case

  resolution: Vector2;

  // Render targets
  private renderTargetIDBuffer!: WebGLRenderTarget;
  private renderTargetEdgeBuffer1!: WebGLRenderTarget;
  private renderTargetBlurBuffer1!: WebGLRenderTarget;
  private renderTargetBlurBuffer2!: WebGLRenderTarget;
  private renderTargetEdgeBuffer2!: WebGLRenderTarget;

  // Individual passes
  private objectIDRenderPass!: ObjectIDRenderPass;
  private edgeDetectionPass!: InterMeshEdgeDetectionPass;
  private blurPass1!: BlurPass;
  private blurPass2!: BlurPass;
  private compositePass!: OutlineCompositePass;
  private copyPass!: ShaderPass;

  // State management
  private oldClearColor = new Color();
  private oldClearAlpha = 1;

  clear = false;
  needsSwap = true;

  constructor(
    private textureId: string,
    resolution: Vector2,
    scene: Scene,
    camera: Camera,
    selectedObjects?: Array<any>,
  ) {
    super();

    this.renderScene = scene;
    this.renderCamera = camera;
    this.selectedObjects = selectedObjects ?? [];
    this.resolution = resolution ? new Vector2(resolution.x, resolution.y) : new Vector2(256, 256);

    this.initializeRenderTargets();
    this.initializePasses();

    this.enabled = true;
  }

  private initializeRenderTargets(): void {
    const pars = { minFilter: LinearFilter, magFilter: LinearFilter, format: RGBAFormat };

    const resx = Math.round(this.resolution.x / this.downSampleRatio);
    const resy = Math.round(this.resolution.y / this.downSampleRatio);

    this.renderTargetIDBuffer = new WebGLRenderTarget(this.resolution.x, this.resolution.y, pars);
    this.renderTargetIDBuffer.texture.name = "EnhancedOutline.idBuffer";
    this.renderTargetIDBuffer.texture.generateMipmaps = false;

    this.renderTargetEdgeBuffer1 = new WebGLRenderTarget(resx, resy, pars);
    this.renderTargetEdgeBuffer1.texture.name = "EnhancedOutline.edge1";
    this.renderTargetEdgeBuffer1.texture.generateMipmaps = false;

    this.renderTargetBlurBuffer1 = new WebGLRenderTarget(resx, resy, pars);
    this.renderTargetBlurBuffer1.texture.name = "EnhancedOutline.blur1";
    this.renderTargetBlurBuffer1.texture.generateMipmaps = false;

    this.renderTargetBlurBuffer2 = new WebGLRenderTarget(Math.round(resx / 2), Math.round(resy / 2), pars);
    this.renderTargetBlurBuffer2.texture.name = "EnhancedOutline.blur2";
    this.renderTargetBlurBuffer2.texture.generateMipmaps = false;

    this.renderTargetEdgeBuffer2 = new WebGLRenderTarget(Math.round(resx / 2), Math.round(resy / 2), pars);
    this.renderTargetEdgeBuffer2.texture.name = "EnhancedOutline.edge2";
    this.renderTargetEdgeBuffer2.texture.generateMipmaps = false;
  }

  private initializePasses(): void {
    this.objectIDRenderPass = new ObjectIDRenderPass(this.renderScene, this.renderCamera);
    this.edgeDetectionPass = new InterMeshEdgeDetectionPass();
    this.blurPass1 = new BlurPass(4);
    this.blurPass2 = new BlurPass(4);
    this.compositePass = new OutlineCompositePass();
    this.copyPass = new ShaderPass(CopyShader, this.textureId);
  }

  // Convenience method to enable inter-mesh edge display
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
    this.renderTargetIDBuffer.setSize(width, height);

    let resx = Math.round(width / this.downSampleRatio);
    let resy = Math.round(height / this.downSampleRatio);

    this.renderTargetEdgeBuffer1.setSize(resx, resy);
    this.renderTargetBlurBuffer1.setSize(resx, resy);

    resx = Math.round(resx / 2);
    resy = Math.round(resy / 2);

    this.renderTargetBlurBuffer2.setSize(resx, resy);
    this.renderTargetEdgeBuffer2.setSize(resx, resy);

    this.blurPass1.setTextureSize(Math.round(width / this.downSampleRatio), Math.round(height / this.downSampleRatio));
    this.blurPass2.setTextureSize(resx, resy);
  }

  render(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
    _deltaTime: number,
    maskActive: boolean,
  ): void {
    this.saveRenderState(renderer);
    this.setupRenderState(renderer, maskActive);

    // First copy the input scene to the output
    this.copyPass.uniforms["tDiffuse"].value = readBuffer.texture;
    this.copyPass.render(renderer, writeBuffer, readBuffer);

    // Execute the enhanced pipeline
    this.executeIDRenderPass(renderer);
    this.executeEdgeDetectionPass(renderer);
    this.executeBlurPasses(renderer);
    this.executeCompositePass(renderer, writeBuffer, maskActive);

    this.restoreRenderState(renderer);

    if (this.renderToScreen) {
      this.copyPass.uniforms["tDiffuse"].value = writeBuffer.texture;
      this.copyPass.render(renderer, null as any, writeBuffer);
    }
  }

  private saveRenderState(renderer: WebGLRenderer): void {
    this.oldClearColor.copy(renderer.getClearColor(new Color()));
    this.oldClearAlpha = renderer.getClearAlpha();
  }

  private setupRenderState(renderer: WebGLRenderer, maskActive: boolean): void {
    renderer.autoClear = false;
    if (maskActive) (renderer.state as any).buffers.stencil.setTest(false);
    renderer.setClearColor(0x000000, 1);
  }

  private restoreRenderState(renderer: WebGLRenderer): void {
    renderer.setClearColor(this.oldClearColor, this.oldClearAlpha);
    renderer.autoClear = true;
  }

  private executeIDRenderPass(renderer: WebGLRenderer): void {
    this.objectIDRenderPass.render(renderer, this.renderTargetIDBuffer);
  }

  private executeEdgeDetectionPass(renderer: WebGLRenderer): void {
    // Update edge detection configuration
    this.edgeDetectionPass.visibleEdgeColor.copy(this.visibleEdgeColor);
    this.edgeDetectionPass.interMeshEdgeColor.copy(this.interMeshEdgeColor);
    this.edgeDetectionPass.pulsePeriod = this.pulsePeriod;
    this.edgeDetectionPass.edgeMode = this.edgeMode;
    this.edgeDetectionPass.minEdgeStrength = this.minEdgeStrength;

    // Use convenience toggle if set
    if (this.showInterMeshEdges && this.selectedObjects.length > 0) {
      this.edgeDetectionPass.edgeMode = EdgeMode.SELECTED_AND_BOUNDARIES;
    } else if (this.showInterMeshEdges) {
      this.edgeDetectionPass.edgeMode = EdgeMode.ALL_MESHES;
    }

    this.edgeDetectionPass.setIDTexture(this.renderTargetIDBuffer.texture);
    this.edgeDetectionPass.setSelectedObjects(this.selectedObjects);
    this.edgeDetectionPass.setTextureSize(
      Math.round(this.resolution.x / this.downSampleRatio),
      Math.round(this.resolution.y / this.downSampleRatio),
    );

    this.edgeDetectionPass.render(renderer, this.renderTargetEdgeBuffer1);
  }

  private executeBlurPasses(renderer: WebGLRenderer): void {
    // First blur pass (half res)
    this.blurPass1.edgeThickness = this.edgeThickness;

    // Horizontal blur
    this.blurPass1.setDirection(BlurDirection.HORIZONTAL);
    this.blurPass1.setColorTexture(this.renderTargetEdgeBuffer1.texture);
    this.blurPass1.render(renderer, this.renderTargetBlurBuffer1);

    // Vertical blur
    this.blurPass1.setDirection(BlurDirection.VERTICAL);
    this.blurPass1.setColorTexture(this.renderTargetBlurBuffer1.texture);
    this.blurPass1.render(renderer, this.renderTargetEdgeBuffer1);

    // Second blur pass (quarter res)
    this.blurPass2.setKernelRadius(4);

    // Horizontal blur
    this.blurPass2.setDirection(BlurDirection.HORIZONTAL);
    this.blurPass2.setColorTexture(this.renderTargetEdgeBuffer1.texture);
    this.blurPass2.render(renderer, this.renderTargetBlurBuffer2);

    // Vertical blur
    this.blurPass2.setDirection(BlurDirection.VERTICAL);
    this.blurPass2.setColorTexture(this.renderTargetBlurBuffer2.texture);
    this.blurPass2.render(renderer, this.renderTargetEdgeBuffer2);
  }

  private executeCompositePass(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, maskActive: boolean): void {
    this.compositePass.edgeStrength = this.edgeStrength;
    this.compositePass.edgeGlow = this.edgeGlow;
    this.compositePass.usePatternTexture = this.usePatternTexture;
    this.compositePass.setPatternTexture(this.patternTexture);

    // Use the ID buffer as the mask for precise compositing
    this.compositePass.setMaskTexture(this.renderTargetIDBuffer.texture);
    this.compositePass.setEdgeTexture1(this.renderTargetEdgeBuffer1.texture);
    this.compositePass.setEdgeTexture2(this.renderTargetEdgeBuffer2.texture);

    if (maskActive) (renderer.state as any).buffers.stencil.setTest(true);

    this.compositePass.render(renderer, writeBuffer);
  }

  dispose(): void {
    this.renderTargetIDBuffer.dispose();
    this.renderTargetEdgeBuffer1.dispose();
    this.renderTargetBlurBuffer1.dispose();
    this.renderTargetBlurBuffer2.dispose();
    this.renderTargetEdgeBuffer2.dispose();

    this.objectIDRenderPass.dispose();
    this.edgeDetectionPass.dispose();
    this.blurPass1.dispose();
    this.blurPass2.dispose();
    this.compositePass.dispose();
  }
}
