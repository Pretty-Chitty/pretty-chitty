import {
  Scene,
  Vector2,
  Color,
  WebGLRenderer,
  WebGLRenderTarget,
  LinearFilter,
  RGBAFormat,
} from "three";
import { Pass, Camera } from "../types";
import { ShaderPass } from "../ShaderPass";
import { CopyShader } from "../shaders";
import { DepthRenderPass } from "./DepthRenderPass";
import { MaskPreparationPass } from "./MaskPreparationPass";
import { EdgeDetectionPass } from "./EdgeDetectionPass";
import { BlurPass, BlurDirection } from "./BlurPass";
import { OutlineCompositePass } from "./OutlineCompositePass";

export class OutlineEffectComposer extends Pass {
  renderScene: Scene;
  renderCamera: Camera;
  selectedObjects: Array<any>;

  // Public configuration
  visibleEdgeColor = new Color(1, 1, 1);
  edgeGlow = 0.0;
  usePatternTexture = false;
  edgeThickness = 1.0;
  edgeStrength = 3.0;
  downSampleRatio = 2;
  pulsePeriod = 0;
  patternTexture: any = null;

  resolution: Vector2;

  // Render targets
  private renderTargetDepthBuffer!: WebGLRenderTarget;
  private renderTargetMaskBuffer!: WebGLRenderTarget;
  private renderTargetMaskDownSampleBuffer!: WebGLRenderTarget;
  private renderTargetEdgeBuffer1!: WebGLRenderTarget;
  private renderTargetBlurBuffer1!: WebGLRenderTarget;
  private renderTargetBlurBuffer2!: WebGLRenderTarget;
  private renderTargetEdgeBuffer2!: WebGLRenderTarget;

  // Individual passes
  private depthRenderPass!: DepthRenderPass;
  private maskPreparationPass!: MaskPreparationPass;
  private downsamplePass!: ShaderPass;
  private edgeDetectionPass!: EdgeDetectionPass;
  private blurPass1!: BlurPass;
  private blurPass2!: BlurPass;
  private compositePass!: OutlineCompositePass;
  private copyPass!: ShaderPass;

  // State management
  private oldClearColor = new Color();
  private oldClearAlpha = 1;

  clear = false;
  needsSwap = false;

  constructor(
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

    this.renderTargetDepthBuffer = new WebGLRenderTarget(this.resolution.x, this.resolution.y, pars);
    this.renderTargetDepthBuffer.texture.name = "OutlineEffect.depth";
    this.renderTargetDepthBuffer.texture.generateMipmaps = false;

    this.renderTargetMaskBuffer = new WebGLRenderTarget(this.resolution.x, this.resolution.y, pars);
    this.renderTargetMaskBuffer.texture.name = "OutlineEffect.mask";
    this.renderTargetMaskBuffer.texture.generateMipmaps = false;

    this.renderTargetMaskDownSampleBuffer = new WebGLRenderTarget(resx, resy, pars);
    this.renderTargetMaskDownSampleBuffer.texture.name = "OutlineEffect.maskDownSample";
    this.renderTargetMaskDownSampleBuffer.texture.generateMipmaps = false;

    this.renderTargetEdgeBuffer1 = new WebGLRenderTarget(resx, resy, pars);
    this.renderTargetEdgeBuffer1.texture.name = "OutlineEffect.edge1";
    this.renderTargetEdgeBuffer1.texture.generateMipmaps = false;

    this.renderTargetBlurBuffer1 = new WebGLRenderTarget(resx, resy, pars);
    this.renderTargetBlurBuffer1.texture.name = "OutlineEffect.blur1";
    this.renderTargetBlurBuffer1.texture.generateMipmaps = false;

    this.renderTargetBlurBuffer2 = new WebGLRenderTarget(Math.round(resx / 2), Math.round(resy / 2), pars);
    this.renderTargetBlurBuffer2.texture.name = "OutlineEffect.blur2";
    this.renderTargetBlurBuffer2.texture.generateMipmaps = false;

    this.renderTargetEdgeBuffer2 = new WebGLRenderTarget(Math.round(resx / 2), Math.round(resy / 2), pars);
    this.renderTargetEdgeBuffer2.texture.name = "OutlineEffect.edge2";
    this.renderTargetEdgeBuffer2.texture.generateMipmaps = false;
  }

  private initializePasses(): void {
    // Initialize all the component passes
    this.depthRenderPass = new DepthRenderPass(this.renderScene, this.renderCamera, this.selectedObjects);

    this.maskPreparationPass = new MaskPreparationPass(this.renderScene, this.renderCamera, this.selectedObjects);

    this.downsamplePass = new ShaderPass(CopyShader);

    this.edgeDetectionPass = new EdgeDetectionPass();

    this.blurPass1 = new BlurPass(4); // MAX_EDGE_THICKNESS
    this.blurPass2 = new BlurPass(4); // MAX_EDGE_GLOW

    this.compositePass = new OutlineCompositePass();

    this.copyPass = new ShaderPass(CopyShader);
  }

  override setSize(width: number, height: number): void {
    this.renderTargetDepthBuffer.setSize(width, height);
    this.renderTargetMaskBuffer.setSize(width, height);

    let resx = Math.round(width / this.downSampleRatio);
    let resy = Math.round(height / this.downSampleRatio);

    this.renderTargetMaskDownSampleBuffer.setSize(resx, resy);
    this.renderTargetEdgeBuffer1.setSize(resx, resy);
    this.renderTargetBlurBuffer1.setSize(resx, resy);

    resx = Math.round(resx / 2);
    resy = Math.round(resy / 2);

    this.renderTargetBlurBuffer2.setSize(resx, resy);
    this.renderTargetEdgeBuffer2.setSize(resx, resy);

    // Update pass configurations
    this.blurPass1.setTextureSize(Math.round(width / this.downSampleRatio), Math.round(height / this.downSampleRatio));
    this.blurPass2.setTextureSize(resx, resy);
  }

  render(
    renderer: WebGLRenderer,
    _writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
    _deltaTime: number,
    maskActive: boolean,
  ): void {
    if (this.selectedObjects.length === 0) {
      if (this.renderToScreen) {
        this.copyPass.uniforms["tDiffuse"].value = readBuffer.texture;
        this.copyPass.render(renderer, null as any, readBuffer);
      }
      return;
    }

    this.saveRenderState(renderer);
    this.setupRenderState(renderer, maskActive);

    // Execute the pipeline
    this.executeDepthPass(renderer);
    this.executeMaskPass(renderer);
    this.executeDownsamplePass(renderer);
    this.executeEdgeDetectionPass(renderer);
    this.executeBlurPasses(renderer);
    this.executeCompositePass(renderer, readBuffer, maskActive);

    this.restoreRenderState(renderer);

    if (this.renderToScreen) {
      this.copyPass.uniforms["tDiffuse"].value = readBuffer.texture;
      this.copyPass.render(renderer, null as any, readBuffer);
    }
  }

  private saveRenderState(renderer: WebGLRenderer): void {
    this.oldClearColor.copy(renderer.getClearColor(new Color()));
    this.oldClearAlpha = renderer.getClearAlpha();
  }

  private setupRenderState(renderer: WebGLRenderer, maskActive: boolean): void {
    renderer.autoClear = false;
    if (maskActive) (renderer.state as any).buffers.stencil.setTest(false);
    renderer.setClearColor(0xffffff, 1);
  }

  private restoreRenderState(renderer: WebGLRenderer): void {
    renderer.setClearColor(this.oldClearColor, this.oldClearAlpha);
    renderer.autoClear = true;
  }

  private executeDepthPass(renderer: WebGLRenderer): void {
    this.depthRenderPass.render(renderer, this.renderTargetDepthBuffer);
  }

  private executeMaskPass(renderer: WebGLRenderer): void {
    this.maskPreparationPass.setDepthTexture(this.renderTargetDepthBuffer.texture);
    this.maskPreparationPass.render(renderer, this.renderTargetMaskBuffer);
  }

  private executeDownsamplePass(renderer: WebGLRenderer): void {
    this.downsamplePass.uniforms["tDiffuse"].value = this.renderTargetMaskBuffer.texture;
    this.downsamplePass.render(renderer, this.renderTargetMaskDownSampleBuffer, this.renderTargetMaskBuffer);
  }

  private executeEdgeDetectionPass(renderer: WebGLRenderer): void {
    this.edgeDetectionPass.visibleEdgeColor.copy(this.visibleEdgeColor);
    this.edgeDetectionPass.pulsePeriod = this.pulsePeriod;
    this.edgeDetectionPass.setMaskTexture(this.renderTargetMaskDownSampleBuffer.texture);
    this.edgeDetectionPass.setTextureSize(
      this.renderTargetMaskDownSampleBuffer.width,
      this.renderTargetMaskDownSampleBuffer.height
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
    this.blurPass2.setKernelRadius(4); // MAX_EDGE_GLOW

    // Horizontal blur
    this.blurPass2.setDirection(BlurDirection.HORIZONTAL);
    this.blurPass2.setColorTexture(this.renderTargetEdgeBuffer1.texture);
    this.blurPass2.render(renderer, this.renderTargetBlurBuffer2);

    // Vertical blur
    this.blurPass2.setDirection(BlurDirection.VERTICAL);
    this.blurPass2.setColorTexture(this.renderTargetBlurBuffer2.texture);
    this.blurPass2.render(renderer, this.renderTargetEdgeBuffer2);
  }

  private executeCompositePass(renderer: WebGLRenderer, readBuffer: WebGLRenderTarget, maskActive: boolean): void {
    this.compositePass.edgeStrength = this.edgeStrength;
    this.compositePass.edgeGlow = this.edgeGlow;
    this.compositePass.usePatternTexture = this.usePatternTexture;
    this.compositePass.setPatternTexture(this.patternTexture);

    this.compositePass.setMaskTexture(this.renderTargetMaskBuffer.texture);
    this.compositePass.setEdgeTexture1(this.renderTargetEdgeBuffer1.texture);
    this.compositePass.setEdgeTexture2(this.renderTargetEdgeBuffer2.texture);

    if (maskActive) (renderer.state as any).buffers.stencil.setTest(true);

    this.compositePass.render(renderer, readBuffer);
  }

  dispose(): void {
    this.renderTargetDepthBuffer.dispose();
    this.renderTargetMaskBuffer.dispose();
    this.renderTargetMaskDownSampleBuffer.dispose();
    this.renderTargetEdgeBuffer1.dispose();
    this.renderTargetBlurBuffer1.dispose();
    this.renderTargetBlurBuffer2.dispose();
    this.renderTargetEdgeBuffer2.dispose();

    this.depthRenderPass.dispose();
    this.maskPreparationPass.dispose();
    this.edgeDetectionPass.dispose();
    this.blurPass1.dispose();
    this.blurPass2.dispose();
    this.compositePass.dispose();
  }
}