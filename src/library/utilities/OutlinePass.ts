// postprocessing.ts
// three REVISION = '117' (behavior preserved)

// Named imports only — no THREE namespace pollution.
import {
  AdditiveBlending,
  Clock,
  Color,
  DoubleSide,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshDepthMaterial,
  NoBlending,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  RGBAFormat,
  RGBADepthPacking,
  Scene,
  ShaderMaterial,
  UniformsUtils,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
  IUniform,
  LinearToneMapping,
  ReinhardToneMapping,
  CineonToneMapping,
  ACESFilmicToneMapping,
  SRGBTransfer,
  RawShaderMaterial,
  ColorManagement,
  ColorSpace,
  CustomToneMapping,
  NormalBlending,
} from "three";

// ----------------------------------------
// CopyShader (shader source kept verbatim)
// ----------------------------------------

export const CopyShader = {
  uniforms: {
    tDiffuse: { value: null as any },
    opacity: { value: 1.0 },
  } as Record<string, IUniform>,

  vertexShader: [
    "varying vec2 vUv;",
    "void main() {",
    "vUv = uv;",
    "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
    "}",
  ].join("\n"),

  fragmentShader: [
    "uniform float opacity;",
    "uniform sampler2D tDiffuse;",
    "varying vec2 vUv;",
    "void main() {",
    "vec4 texel = texture2D( tDiffuse, vUv );",
    "gl_FragColor = opacity * texel;",
    "}",
  ].join("\n"),
} as const;

// ----------------------------------------
// Pass base + FullScreenQuad helper
// ----------------------------------------

export abstract class Pass {
  /** if true, the pass is processed by the composer */
  enabled = true;
  /** if true, swap read/write buffers after rendering */
  needsSwap = true;
  /** if true, clear before rendering */
  clear = false;
  /** set automatically by EffectComposer for the last enabled pass */
  renderToScreen = false;

  setSize(_width: number, _height: number): void {
    // optional
  }

  abstract render(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ): void;
}

// Fullscreen-quad renderer for screen-space passes.
class FullScreenQuad {
  private static camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private static geometry = new PlaneGeometry(2, 2);
  private _mesh: Mesh;

  constructor(material: ShaderMaterial | null) {
    this._mesh = new Mesh(FullScreenQuad.geometry, material as any);
  }

  get material(): ShaderMaterial | null {
    return this._mesh.material as ShaderMaterial | null;
  }
  set material(value: ShaderMaterial | null) {
    this._mesh.material = value as any;
  }

  dispose(): void {
    this._mesh.geometry.dispose();
  }

  render(renderer: WebGLRenderer): void {
    renderer.render(this._mesh, FullScreenQuad.camera);
  }
}

// ----------------------------------------
// EffectComposer (+ setRenderer support)
// ----------------------------------------

// Utility: save the parameters we use to (re)build RTs safely.
type RTParams = ConstructorParameters<typeof WebGLRenderTarget>[2];

export class EffectComposer {
  private renderer: WebGLRenderer;

  private _pixelRatio: number;
  private _width: number;
  private _height: number;

  private _rtParams: RTParams;

  renderTarget1: WebGLRenderTarget;
  renderTarget2: WebGLRenderTarget;

  writeBuffer: WebGLRenderTarget;
  readBuffer: WebGLRenderTarget;

  renderToScreen = true;
  passes: Pass[] = [];

  private copyPass: ShaderPass;
  private clock = new Clock();

  constructor(renderer: WebGLRenderer, renderTarget?: WebGLRenderTarget) {
    this.renderer = renderer;

    if (!renderTarget) {
      this._rtParams = {
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        format: RGBAFormat,
        stencilBuffer: false,
      };

      const size = renderer.getSize(new Vector2());
      this._pixelRatio = renderer.getPixelRatio();
      this._width = size.width;
      this._height = size.height;

      renderTarget = new WebGLRenderTarget(
        Math.max(1, Math.floor(this._width * this._pixelRatio)),
        Math.max(1, Math.floor(this._height * this._pixelRatio)),
        this._rtParams,
      );
      renderTarget.texture.name = "EffectComposer.rt1";
    } else {
      // Learn params from provided RT so we can rebuild later consistently.
      this._rtParams = {
        minFilter: renderTarget.texture.minFilter,
        magFilter: renderTarget.texture.magFilter,
        format: renderTarget.texture.format,
        stencilBuffer: renderTarget.stencilBuffer,
      } as any;

      this._pixelRatio = 1;
      this._width = renderTarget.width;
      this._height = renderTarget.height;
    }

    this.renderTarget1 = renderTarget;
    this.renderTarget2 = renderTarget.clone();
    this.renderTarget2.texture.name = "EffectComposer.rt2";

    this.writeBuffer = this.renderTarget1;
    this.readBuffer = this.renderTarget2;

    this.copyPass = new ShaderPass(CopyShader);
  }

  /** Swap to a different WebGLRenderer (new canvas/GL context). Rebuilds RTs accordingly. */
  setRenderer(
    renderer: WebGLRenderer,
    opts: {
      adoptSizeFromRenderer?: boolean; // default true
      adoptPixelRatio?: boolean; // default true
      preserveLogicalSize?: boolean; // if true, keep current _width/_height
    } = {},
  ): void {
    const { adoptSizeFromRenderer = true, adoptPixelRatio = true, preserveLogicalSize = false } = opts;

    this.renderer = renderer;

    if (adoptPixelRatio) this._pixelRatio = Math.max(0.1, renderer.getPixelRatio());
    if (adoptSizeFromRenderer && !preserveLogicalSize) {
      const size = renderer.getSize(new Vector2());
      this._width = size.width;
      this._height = size.height;
    }

    // Rebuild RTs under the new GL context
    const effectiveWidth = Math.max(1, Math.floor(this._width * this._pixelRatio));
    const effectiveHeight = Math.max(1, Math.floor(this._height * this._pixelRatio));

    this.renderTarget1.dispose();
    this.renderTarget2.dispose();

    this.renderTarget1 = new WebGLRenderTarget(effectiveWidth, effectiveHeight, this._rtParams);
    this.renderTarget1.texture.name = "EffectComposer.rt1";
    this.renderTarget2 = this.renderTarget1.clone();
    this.renderTarget2.texture.name = "EffectComposer.rt2";

    this.writeBuffer = this.renderTarget1;
    this.readBuffer = this.renderTarget2;

    for (let i = 0; i < this.passes.length; i++) {
      this.passes[i].setSize(effectiveWidth, effectiveHeight);
    }
  }

  private swapBuffers(): void {
    const tmp = this.readBuffer;
    this.readBuffer = this.writeBuffer;
    this.writeBuffer = tmp;
  }

  addPass(pass: Pass): void {
    this.passes.push(pass);
    pass.setSize(this._width * this._pixelRatio, this._height * this._pixelRatio);
  }

  insertPass(pass: Pass, index: number): void {
    this.passes.splice(index, 0, pass);
    pass.setSize(this._width * this._pixelRatio, this._height * this._pixelRatio);
  }

  private isLastEnabledPass(passIndex: number): boolean {
    for (let i = passIndex + 1; i < this.passes.length; i++) {
      if (this.passes[i].enabled) return false;
    }
    return true;
  }

  render(deltaTime?: number): void {
    const dt = deltaTime ?? this.clock.getDelta();
    const currentRenderTarget = this.renderer.getRenderTarget();

    let maskActive = false;

    for (let i = 0, il = this.passes.length; i < il; i++) {
      const pass = this.passes[i];
      if (!pass.enabled) continue;

      pass.renderToScreen = this.renderToScreen && this.isLastEnabledPass(i);
      pass.render(this.renderer, this.writeBuffer, this.readBuffer, dt, maskActive);

      if (pass.needsSwap) {
        if (maskActive) {
          const context = this.renderer.getContext();
          const stencil = (this.renderer.state as any).buffers.stencil;

          stencil.setFunc(context.NOTEQUAL, 1, 0xffffffff);
          this.copyPass.render(this.renderer, this.writeBuffer, this.readBuffer);
          stencil.setFunc(context.EQUAL, 1, 0xffffffff);
        }
        this.swapBuffers();
      }

      if (pass instanceof MaskPass) {
        maskActive = true;
      } else if (pass instanceof ClearMaskPass) {
        maskActive = false;
      }
    }

    this.renderer.setRenderTarget(currentRenderTarget);
  }

  reset(renderTarget?: WebGLRenderTarget): void {
    if (!renderTarget) {
      const size = this.renderer.getSize(new Vector2());
      this._pixelRatio = this.renderer.getPixelRatio();
      this._width = size.width;
      this._height = size.height;

      renderTarget = this.renderTarget1.clone();
      renderTarget.setSize(
        Math.max(1, Math.floor(this._width * this._pixelRatio)),
        Math.max(1, Math.floor(this._height * this._pixelRatio)),
      );
    } else {
      // If user passes a custom RT, update stored params for future rebuilds.
      this._rtParams = {
        minFilter: renderTarget.texture.minFilter,
        magFilter: renderTarget.texture.magFilter,
        format: renderTarget.texture.format,
        stencilBuffer: renderTarget.stencilBuffer,
      } as any;

      this._pixelRatio = 1;
      this._width = renderTarget.width;
      this._height = renderTarget.height;
    }

    this.renderTarget1.dispose();
    this.renderTarget2.dispose();
    this.renderTarget1 = renderTarget;
    this.renderTarget2 = renderTarget.clone();

    this.writeBuffer = this.renderTarget1;
    this.readBuffer = this.renderTarget2;
  }

  setSize(width: number, height: number): void {
    this._width = Math.max(1, Math.floor(width));
    this._height = Math.max(1, Math.floor(height));

    const effectiveWidth = this._width * this._pixelRatio;
    const effectiveHeight = this._height * this._pixelRatio;

    this.renderTarget1.setSize(effectiveWidth, effectiveHeight);
    this.renderTarget2.setSize(effectiveWidth, effectiveHeight);

    for (let i = 0; i < this.passes.length; i++) {
      this.passes[i].setSize(effectiveWidth, effectiveHeight);
    }
  }

  setPixelRatio(pixelRatio: number): void {
    this._pixelRatio = Math.max(0.1, pixelRatio);
    this.setSize(this._width, this._height);
  }
}

// ----------------------------------------
// RenderPass
// ----------------------------------------

export class RenderPass extends Pass {
  public scene: Scene;
  public camera: PerspectiveCamera | OrthographicCamera;
  public overrideMaterial?: ShaderMaterial | null;
  public clearColor?: Color | number | string;
  public clearAlpha: number;

  clear = true;
  clearDepth = false;
  needsSwap = false;

  constructor(
    scene: Scene,
    camera: PerspectiveCamera | OrthographicCamera,
    overrideMaterial?: ShaderMaterial | null,
    clearColor?: Color | number | string,
    clearAlpha?: number,
  ) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.overrideMaterial = overrideMaterial ?? undefined;
    this.clearColor = clearColor;
    this.clearAlpha = clearAlpha !== undefined ? clearAlpha : 0;
  }

  render(renderer: WebGLRenderer, _writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget): void {
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    let oldClearColor: number | undefined;
    let oldClearAlpha: number | undefined;
    let oldOverrideMaterial: any;

    if (this.overrideMaterial !== undefined) {
      oldOverrideMaterial = this.scene.overrideMaterial;
      this.scene.overrideMaterial = this.overrideMaterial ?? null;
    }

    if (this.clearColor !== undefined) {
      oldClearColor = renderer.getClearColor(new Color()).getHex();
      oldClearAlpha = renderer.getClearAlpha();
      renderer.setClearColor(this.clearColor as any, this.clearAlpha);
    }

    if (this.clearDepth) {
      renderer.clearDepth();
    }

    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    if (this.clear) renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
    renderer.render(this.scene, this.camera);

    if (this.clearColor !== undefined) {
      renderer.setClearColor(oldClearColor!, oldClearAlpha!);
    }

    if (this.overrideMaterial !== undefined) {
      this.scene.overrideMaterial = oldOverrideMaterial;
    }

    renderer.autoClear = oldAutoClear;
  }
}

// ----------------------------------------
// ShaderPass
// ----------------------------------------

export class ShaderPass extends Pass {
  private textureID: string;
  uniforms: Record<string, IUniform>;
  material: ShaderMaterial;
  private fsQuad: FullScreenQuad;

  constructor(shader: ShaderMaterial | typeof CopyShader, textureID?: string) {
    super();
    this.textureID = textureID ?? "tDiffuse";

    if (shader instanceof ShaderMaterial) {
      this.uniforms = shader.uniforms as Record<string, IUniform>;
      this.material = shader;
    } else if (shader) {
      this.uniforms = UniformsUtils.clone(shader.uniforms);
      this.material = new ShaderMaterial({
        defines: Object.assign({}, (shader as any).defines),
        uniforms: this.uniforms,
        vertexShader: (shader as any).vertexShader,
        fragmentShader: (shader as any).fragmentShader,
      });
    } else {
      throw new Error("ShaderPass requires a shader");
    }

    this.fsQuad = new FullScreenQuad(this.material);
  }

  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget): void {
    if (this.uniforms[this.textureID]) {
      this.uniforms[this.textureID].value = readBuffer.texture;
    }

    this.fsQuad.material = this.material;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
      this.fsQuad.render(renderer);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
      this.fsQuad.render(renderer);
    }
  }
}

// ----------------------------------------
// OutlinePass (shader code verbatim)
// ----------------------------------------

export class OutlinePass extends Pass {
  renderScene: Scene;
  renderCamera: PerspectiveCamera | OrthographicCamera;
  selectedObjects: Array<any>;

  visibleEdgeColor = new Color(1, 1, 1);
  edgeGlow = 0.0;
  usePatternTexture = false;
  edgeThickness = 1.0;
  edgeStrength = 3.0;
  downSampleRatio = 2;
  pulsePeriod = 0;

  resolution: Vector2;

  maskBufferMaterial: MeshBasicMaterial;
  renderTargetMaskBuffer: WebGLRenderTarget;

  depthMaterial: MeshDepthMaterial;
  prepareMaskMaterial: ShaderMaterial;
  renderTargetDepthBuffer: WebGLRenderTarget;

  renderTargetMaskDownSampleBuffer: WebGLRenderTarget;

  renderTargetBlurBuffer1: WebGLRenderTarget;
  renderTargetBlurBuffer2: WebGLRenderTarget;

  edgeDetectionMaterial: ShaderMaterial;
  renderTargetEdgeBuffer1: WebGLRenderTarget;
  renderTargetEdgeBuffer2: WebGLRenderTarget;

  separableBlurMaterial1: ShaderMaterial;
  separableBlurMaterial2: ShaderMaterial;

  overlayMaterial: ShaderMaterial;

  copyUniforms: Record<string, IUniform>;
  materialCopy: ShaderMaterial;

  oldClearColor = new Color();
  oldClearAlpha = 1;

  fsQuad = new FullScreenQuad(null);

  tempPulseColor1 = new Color();
  tempPulseColor2 = new Color();
  textureMatrix = new Matrix4();

  patternTexture: any;

  constructor(
    resolution: Vector2,
    scene: Scene,
    camera: PerspectiveCamera | OrthographicCamera,
    selectedObjects?: Array<any>,
  ) {
    super();

    this.renderScene = scene;
    this.renderCamera = camera;
    this.selectedObjects = selectedObjects ?? [];
    this.resolution = resolution ? new Vector2(resolution.x, resolution.y) : new Vector2(256, 256);

    const pars = { minFilter: LinearFilter, magFilter: LinearFilter, format: RGBAFormat } as any;

    const resx = Math.round(this.resolution.x / this.downSampleRatio);
    const resy = Math.round(this.resolution.y / this.downSampleRatio);

    this.maskBufferMaterial = new MeshBasicMaterial({ color: 0xffffff });
    this.maskBufferMaterial.side = DoubleSide;

    this.renderTargetMaskBuffer = new WebGLRenderTarget(this.resolution.x, this.resolution.y, pars);
    this.renderTargetMaskBuffer.texture.name = "OutlinePass.mask";
    this.renderTargetMaskBuffer.texture.generateMipmaps = false;

    this.depthMaterial = new MeshDepthMaterial();
    this.depthMaterial.side = DoubleSide;
    this.depthMaterial.depthPacking = RGBADepthPacking;
    this.depthMaterial.blending = NoBlending;

    this.prepareMaskMaterial = this.getPrepareMaskMaterial();
    this.prepareMaskMaterial.side = DoubleSide;
    this.prepareMaskMaterial.fragmentShader = this.replaceDepthToViewZ(
      this.prepareMaskMaterial.fragmentShader,
      this.renderCamera,
    );

    this.renderTargetDepthBuffer = new WebGLRenderTarget(this.resolution.x, this.resolution.y, pars);
    this.renderTargetDepthBuffer.texture.name = "OutlinePass.depth";
    this.renderTargetDepthBuffer.texture.generateMipmaps = false;

    this.renderTargetMaskDownSampleBuffer = new WebGLRenderTarget(resx, resy, pars);
    this.renderTargetMaskDownSampleBuffer.texture.name = "OutlinePass.depthDownSample";
    this.renderTargetMaskDownSampleBuffer.texture.generateMipmaps = false;

    this.renderTargetBlurBuffer1 = new WebGLRenderTarget(resx, resy, pars);
    this.renderTargetBlurBuffer1.texture.name = "OutlinePass.blur1";
    this.renderTargetBlurBuffer1.texture.generateMipmaps = false;

    this.renderTargetBlurBuffer2 = new WebGLRenderTarget(Math.round(resx / 2), Math.round(resy / 2), pars);
    this.renderTargetBlurBuffer2.texture.name = "OutlinePass.blur2";
    this.renderTargetBlurBuffer2.texture.generateMipmaps = false;

    this.edgeDetectionMaterial = this.getEdgeDetectionMaterial();
    this.renderTargetEdgeBuffer1 = new WebGLRenderTarget(resx, resy, pars);
    this.renderTargetEdgeBuffer1.texture.name = "OutlinePass.edge1";
    this.renderTargetEdgeBuffer1.texture.generateMipmaps = false;

    this.renderTargetEdgeBuffer2 = new WebGLRenderTarget(Math.round(resx / 2), Math.round(resy / 2), pars);
    this.renderTargetEdgeBuffer2.texture.name = "OutlinePass.edge2";
    this.renderTargetEdgeBuffer2.texture.generateMipmaps = false;

    const MAX_EDGE_THICKNESS = 4;
    const MAX_EDGE_GLOW = 4;

    this.separableBlurMaterial1 = this.getSeperableBlurMaterial(MAX_EDGE_THICKNESS);
    (this.separableBlurMaterial1.uniforms["texSize"].value as Vector2).set(resx, resy);
    (this.separableBlurMaterial1.uniforms["kernelRadius"].value as number) = 1;

    this.separableBlurMaterial2 = this.getSeperableBlurMaterial(MAX_EDGE_GLOW);
    (this.separableBlurMaterial2.uniforms["texSize"].value as Vector2).set(Math.round(resx / 2), Math.round(resy / 2));
    (this.separableBlurMaterial2.uniforms["kernelRadius"].value as number) = MAX_EDGE_GLOW;

    this.overlayMaterial = this.getOverlayMaterial();

    // copy material
    this.copyUniforms = UniformsUtils.clone(CopyShader.uniforms);
    (this.copyUniforms["opacity"].value as number) = 1.0;

    this.materialCopy = new ShaderMaterial({
      uniforms: this.copyUniforms,
      vertexShader: CopyShader.vertexShader,
      fragmentShader: CopyShader.fragmentShader,
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });

    this.enabled = true;
    this.needsSwap = false;
  }

  private replaceDepthToViewZ(str: string, camera: PerspectiveCamera | OrthographicCamera): string {
    const type = (camera as any).isPerspectiveCamera ? "perspective" : "orthographic";
    return str.replace(/DEPTH_TO_VIEW_Z/g, `${type}DepthToViewZ`);
  }

  dispose(): void {
    this.renderTargetMaskBuffer.dispose();
    this.renderTargetDepthBuffer.dispose();
    this.renderTargetMaskDownSampleBuffer.dispose();
    this.renderTargetBlurBuffer1.dispose();
    this.renderTargetBlurBuffer2.dispose();
    this.renderTargetEdgeBuffer1.dispose();
    this.renderTargetEdgeBuffer2.dispose();
  }

  override setSize(width: number, height: number): void {
    this.renderTargetMaskBuffer.setSize(width, height);

    let resx = Math.round(width / this.downSampleRatio);
    let resy = Math.round(height / this.downSampleRatio);
    this.renderTargetMaskDownSampleBuffer.setSize(resx, resy);
    this.renderTargetBlurBuffer1.setSize(resx, resy);
    this.renderTargetEdgeBuffer1.setSize(resx, resy);
    (this.separableBlurMaterial1.uniforms["texSize"].value as Vector2).set(resx, resy);

    resx = Math.round(resx / 2);
    resy = Math.round(resy / 2);

    this.renderTargetBlurBuffer2.setSize(resx, resy);
    this.renderTargetEdgeBuffer2.setSize(resx, resy);
    (this.separableBlurMaterial2.uniforms["texSize"].value as Vector2).set(resx, resy);
  }

  private changeVisibilityOfSelectedObjects(bVisible: boolean): void {
    const toggle = (object: any) => {
      if ((object as any).isMesh) {
        if (bVisible) {
          object.visible = object.userData.oldVisible;
          delete object.userData.oldVisible;
        } else {
          object.userData.oldVisible = object.visible;
          object.visible = bVisible;
        }
      }
    };
    for (let i = 0; i < this.selectedObjects.length; i++) {
      const selectedObject = this.selectedObjects[i];
      selectedObject.traverse(toggle);
    }
  }

  private changeVisibilityOfNonSelectedObjects(bVisible: boolean): void {
    const selectedMeshes: any[] = [];
    const gather = (object: any) => {
      if (object.isMesh) selectedMeshes.push(object);
    };
    for (let i = 0; i < this.selectedObjects.length; i++) {
      const selectedObject = this.selectedObjects[i];
      selectedObject.traverse(gather);
    }

    const change = (object: any) => {
      if (object.isMesh || object.isLine || object.isSprite) {
        let found = false;
        for (let i = 0; i < selectedMeshes.length; i++) {
          if (selectedMeshes[i].id === object.id) {
            found = true;
            break;
          }
        }
        if (!found) {
          const visibility = object.visible;
          if (!bVisible || object.bVisible) object.visible = bVisible;
          object.bVisible = visibility;
        }
      }
    };

    this.renderScene.traverse(change);
  }

  private updateTextureMatrix(): void {
    this.textureMatrix.set(0.5, 0.0, 0.0, 0.5, 0.0, 0.5, 0.0, 0.5, 0.0, 0.0, 0.5, 0.5, 0.0, 0.0, 0.0, 1.0);
    this.textureMatrix.multiply(this.renderCamera.projectionMatrix);
    this.textureMatrix.multiply((this.renderCamera as any).matrixWorldInverse);
  }

  override render(
    renderer: WebGLRenderer,
    _writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
    _deltaTime: number,
    maskActive: boolean,
  ): void {
    if (this.selectedObjects.length > 0) {
      this.oldClearColor.copy(renderer.getClearColor(new Color()));
      this.oldClearAlpha = renderer.getClearAlpha();
      const oldAutoClear = renderer.autoClear;
      renderer.autoClear = false;

      if (maskActive) (renderer.state as any).buffers.stencil.setTest(false);

      renderer.setClearColor(0xffffff, 1);

      // 1. Draw Non Selected objects in the depth buffer
      this.changeVisibilityOfSelectedObjects(false);

      const currentBackground = this.renderScene.background;
      this.renderScene.background = null;

      this.renderScene.overrideMaterial = this.depthMaterial;
      renderer.setRenderTarget(this.renderTargetDepthBuffer);
      renderer.clear();
      renderer.render(this.renderScene, this.renderCamera);

      // Make selected objects visible
      this.changeVisibilityOfSelectedObjects(true);

      // 2. Prepare mask by comparing depth
      this.updateTextureMatrix();
      this.changeVisibilityOfNonSelectedObjects(false);
      this.renderScene.overrideMaterial = this.prepareMaskMaterial;
      (this.prepareMaskMaterial.uniforms["cameraNearFar"].value as Vector2).set(
        (this.renderCamera as any).near,
        (this.renderCamera as any).far,
      );
      (this.prepareMaskMaterial.uniforms["depthTexture"].value as any) = this.renderTargetDepthBuffer.texture;
      (this.prepareMaskMaterial.uniforms["textureMatrix"].value as Matrix4) = this.textureMatrix;

      renderer.setRenderTarget(this.renderTargetMaskBuffer);
      renderer.clear();
      renderer.render(this.renderScene, this.renderCamera);
      this.renderScene.overrideMaterial = null as any;
      this.changeVisibilityOfNonSelectedObjects(true);

      this.renderScene.background = currentBackground;

      // 3. Downsample to half res
      this.fsQuad.material = this.materialCopy;
      (this.copyUniforms["tDiffuse"].value as any) = this.renderTargetMaskBuffer.texture;
      renderer.setRenderTarget(this.renderTargetMaskDownSampleBuffer);
      renderer.clear();
      this.fsQuad.render(renderer);

      // Pulse colors
      this.tempPulseColor1.copy(this.visibleEdgeColor);

      if (this.pulsePeriod > 0) {
        const scalar = (1 + 0.25) / 2 + (Math.cos((performance.now() * 0.01) / this.pulsePeriod) * (1.0 - 0.25)) / 2;
        this.tempPulseColor1.multiplyScalar(scalar);
        this.tempPulseColor2.multiplyScalar(scalar);
      }

      // 4. Edge detection
      this.fsQuad.material = this.edgeDetectionMaterial;
      (this.edgeDetectionMaterial.uniforms["maskTexture"].value as any) = this.renderTargetMaskDownSampleBuffer.texture;
      (this.edgeDetectionMaterial.uniforms["texSize"].value as Vector2).set(
        this.renderTargetMaskDownSampleBuffer.width,
        this.renderTargetMaskDownSampleBuffer.height,
      );
      (this.edgeDetectionMaterial.uniforms["visibleEdgeColor"].value as any) = new Vector3(
        this.tempPulseColor1.r,
        this.tempPulseColor1.g,
        this.tempPulseColor1.b,
      );

      renderer.setRenderTarget(this.renderTargetEdgeBuffer1);
      renderer.clear();
      this.fsQuad.render(renderer);

      // 5. Blur half res (X then Y)
      this.fsQuad.material = this.separableBlurMaterial1;
      (this.separableBlurMaterial1.uniforms["colorTexture"].value as any) = this.renderTargetEdgeBuffer1.texture;
      (this.separableBlurMaterial1.uniforms["direction"].value as Vector2) = OutlinePass.BlurDirectionX.clone();
      (this.separableBlurMaterial1.uniforms["kernelRadius"].value as number) = this.edgeThickness;
      renderer.setRenderTarget(this.renderTargetBlurBuffer1);
      renderer.clear();
      this.fsQuad.render(renderer);

      (this.separableBlurMaterial1.uniforms["colorTexture"].value as any) = this.renderTargetBlurBuffer1.texture;
      (this.separableBlurMaterial1.uniforms["direction"].value as Vector2) = OutlinePass.BlurDirectionY.clone();
      renderer.setRenderTarget(this.renderTargetEdgeBuffer1);
      renderer.clear();
      this.fsQuad.render(renderer);

      // 6. Blur quarter res (X then Y)
      this.fsQuad.material = this.separableBlurMaterial2;
      (this.separableBlurMaterial2.uniforms["colorTexture"].value as any) = this.renderTargetEdgeBuffer1.texture;
      (this.separableBlurMaterial2.uniforms["direction"].value as Vector2) = OutlinePass.BlurDirectionX.clone();
      renderer.setRenderTarget(this.renderTargetBlurBuffer2);
      renderer.clear();
      this.fsQuad.render(renderer);

      (this.separableBlurMaterial2.uniforms["colorTexture"].value as any) = this.renderTargetBlurBuffer2.texture;
      (this.separableBlurMaterial2.uniforms["direction"].value as Vector2) = OutlinePass.BlurDirectionY.clone();
      renderer.setRenderTarget(this.renderTargetEdgeBuffer2);
      renderer.clear();
      this.fsQuad.render(renderer);

      // 7. Overlay additively
      this.fsQuad.material = this.overlayMaterial;
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

      renderer.setClearColor(this.oldClearColor, this.oldClearAlpha);
      renderer.autoClear = oldAutoClear;
    }

    if (this.renderToScreen) {
      this.fsQuad.material = this.materialCopy;
      (this.copyUniforms["tDiffuse"].value as any) = readBuffer.texture;
      renderer.setRenderTarget(null);
      this.fsQuad.render(renderer);
    }
  }

  private getPrepareMaskMaterial(): ShaderMaterial {
    return new ShaderMaterial({
      uniforms: {
        depthTexture: { value: null },
        cameraNearFar: { value: new Vector2(0.5, 0.5) },
        textureMatrix: { value: null },
      },
      vertexShader: `#include <morphtarget_pars_vertex>
        #include <skinning_pars_vertex>
        varying vec4 projTexCoord;
        varying vec4 vPosition;
        uniform mat4 textureMatrix;
        void main() {
          #include <skinbase_vertex>
          #include <begin_vertex>
          #include <morphtarget_vertex>
          #include <skinning_vertex>
          #include <project_vertex>
          vPosition = mvPosition;
          vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
          projTexCoord = textureMatrix * worldPosition;
        }`,
      fragmentShader: `#include <packing>
        varying vec4 vPosition;
        varying vec4 projTexCoord;
        uniform sampler2D depthTexture;
        uniform vec2 cameraNearFar;
        void main() {
          float depth = unpackRGBAToDepth(texture2DProj( depthTexture, projTexCoord ));
          float viewZ = - DEPTH_TO_VIEW_Z( depth, cameraNearFar.x, cameraNearFar.y );
          float depthTest = (-vPosition.z > viewZ) ? 1.0 : 0.0;
          gl_FragColor = vec4(0.0, depthTest, 1.0, 1.0);
        }`,
    });
  }

  private getEdgeDetectionMaterial(): ShaderMaterial {
    return new ShaderMaterial({
      uniforms: {
        maskTexture: { value: null },
        texSize: { value: new Vector2(0.5, 0.5) },
        visibleEdgeColor: { value: new Vector3(1.0, 1.0, 1.0) },
      } as any,
      vertexShader: `varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`,
      fragmentShader: `varying vec2 vUv;
        uniform sampler2D maskTexture;
        uniform vec2 texSize;
        uniform vec3 visibleEdgeColor;
        
        void main() {
          vec2 invSize = 1.0 / texSize;
          vec4 uvOffset = vec4(1.0, 0.0, 0.0, 1.0) * vec4(invSize, invSize);
          vec4 c1 = texture2D( maskTexture, vUv + uvOffset.xy);
          vec4 c2 = texture2D( maskTexture, vUv - uvOffset.xy);
          vec4 c3 = texture2D( maskTexture, vUv + uvOffset.yw);
          vec4 c4 = texture2D( maskTexture, vUv - uvOffset.yw);
          float diff1 = (c1.r - c2.r)*0.5;
          float diff2 = (c3.r - c4.r)*0.5;
          float d = length( vec2(diff1, diff2) );
          float a1 = min(c1.g, c2.g);
          float a2 = min(c3.g, c4.g);
          float visibilityFactor = min(a1, a2);
          if (1.0 - visibilityFactor > 0.001) {
            gl_FragColor = vec4(visibleEdgeColor, 1.0) * vec4(d);
          } else {
            gl_FragColor = vec4(visibleEdgeColor, 1.0) * vec4(0);
          }
        }`,
    });
  }

  private getSeperableBlurMaterial(maxRadius: number): ShaderMaterial {
    return new ShaderMaterial({
      defines: {
        MAX_RADIUS: maxRadius,
      } as any,
      uniforms: {
        colorTexture: { value: null },
        texSize: { value: new Vector2(0.5, 0.5) },
        direction: { value: new Vector2(0.5, 0.5) },
        kernelRadius: { value: 1.0 },
      },
      vertexShader: `varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`,
      fragmentShader: `#include <common>
        varying vec2 vUv;
        uniform sampler2D colorTexture;
        uniform vec2 texSize;
        uniform vec2 direction;
        uniform float kernelRadius;
        
        float gaussianPdf(in float x, in float sigma) {
          return 0.39894 * exp( -0.5 * x * x/( sigma * sigma))/sigma;
        }
        void main() {
          vec2 invSize = 1.0 / texSize;
          float weightSum = gaussianPdf(0.0, kernelRadius);
          vec4 diffuseSum = texture2D( colorTexture, vUv) * weightSum;
          vec2 delta = direction * invSize * kernelRadius/float(MAX_RADIUS);
          vec2 uvOffset = delta;
          for( int i = 1; i <= MAX_RADIUS; i ++ ) {
            float w = gaussianPdf(uvOffset.x, kernelRadius);
            vec4 sample1 = texture2D( colorTexture, vUv + uvOffset);
            vec4 sample2 = texture2D( colorTexture, vUv - uvOffset);
            diffuseSum += ((sample1 + sample2) * w);
            weightSum += (2.0 * w);
            uvOffset += delta;
          }
          gl_FragColor = diffuseSum/weightSum;
        }`,
    });
  }

  private getOverlayMaterial(): ShaderMaterial {
    return new ShaderMaterial({
      uniforms: {
        maskTexture: { value: null },
        edgeTexture1: { value: null },
        edgeTexture2: { value: null },
        patternTexture: { value: null },
        edgeStrength: { value: 1.0 },
        edgeGlow: { value: 1.0 },
        usePatternTexture: { value: false }, // GLSL bool
      },
      vertexShader: `varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`,
      fragmentShader: `varying vec2 vUv;
        uniform sampler2D maskTexture;
        uniform sampler2D edgeTexture1;
        uniform sampler2D edgeTexture2;
        uniform sampler2D patternTexture;
        uniform float edgeStrength;
        uniform float edgeGlow;
        uniform bool usePatternTexture;
        
        void main() {
          vec4 edgeValue1 = texture2D(edgeTexture1, vUv);
          vec4 edgeValue2 = texture2D(edgeTexture2, vUv);
          vec4 maskColor = texture2D(maskTexture, vUv);
          vec4 patternColor = texture2D(patternTexture, 6.0 * vUv);
          float visibilityFactor = 1.0 - maskColor.g > 0.0 ? 1.0 : 0.5;
          vec4 edgeValue = edgeValue1 + edgeValue2 * edgeGlow;
          vec4 finalColor = edgeStrength * maskColor.r * edgeValue;
          if(usePatternTexture)
            finalColor += + visibilityFactor * (1.0 - maskColor.r) * (1.0 - patternColor.r);
          gl_FragColor = finalColor;
        }`,
      blending: NormalBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
  }

  static BlurDirectionX = new Vector2(1.0, 0.0);
  static BlurDirectionY = new Vector2(0.0, 1.0);
}

// ----------------------------------------
// MaskPass / ClearMaskPass
// ----------------------------------------

export class MaskPass extends Pass {
  private scene: Scene;
  private camera: PerspectiveCamera | OrthographicCamera;

  clear = true;
  needsSwap = false;
  inverse = false;

  constructor(scene: Scene, camera: PerspectiveCamera | OrthographicCamera) {
    super();
    this.scene = scene;
    this.camera = camera;
  }

  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget): void {
    const context = renderer.getContext();
    const state = renderer.state as any;

    // don't update color or depth
    state.buffers.color.setMask(false);
    state.buffers.depth.setMask(false);

    // lock buffers
    state.buffers.color.setLocked(true);
    state.buffers.depth.setLocked(true);

    // stencil setup
    const writeValue = this.inverse ? 0 : 1;
    const clearValue = this.inverse ? 1 : 0;

    state.buffers.stencil.setTest(true);
    state.buffers.stencil.setOp(context.REPLACE, context.REPLACE, context.REPLACE);
    state.buffers.stencil.setFunc(context.ALWAYS, writeValue, 0xffffffff);
    state.buffers.stencil.setClear(clearValue);
    state.buffers.stencil.setLocked(true);

    // draw into the stencil buffer
    renderer.setRenderTarget(readBuffer);
    if (this.clear) renderer.clear();
    renderer.render(this.scene, this.camera);

    renderer.setRenderTarget(writeBuffer);
    if (this.clear) renderer.clear();
    renderer.render(this.scene, this.camera);

    // unlock color and depth
    state.buffers.color.setLocked(false);
    state.buffers.depth.setLocked(false);

    // only render where stencil is set to 1
    state.buffers.stencil.setLocked(false);
    state.buffers.stencil.setFunc(context.EQUAL, 1, 0xffffffff); // draw if == 1
    state.buffers.stencil.setOp(context.KEEP, context.KEEP, context.KEEP);
    state.buffers.stencil.setLocked(true);
  }
}

export class ClearMaskPass extends Pass {
  needsSwap = false;

  render(renderer: WebGLRenderer): void {
    const state = renderer.state as any;
    state.buffers.stencil.setLocked(false);
    state.buffers.stencil.setTest(false);
  }
}

/**
 * @module OutputShader
 * @three_import import { OutputShader } from 'three/addons/shaders/OutputShader.js';
 */

/**
 * Performs tone mapping and color space conversion for
 * FX workflows.
 *
 * Used by {@link OutputPass}.
 *
 * @constant
 * @type {ShaderMaterial~Shader}
 */
const OutputShader = {
  name: "OutputShader",

  uniforms: {
    tDiffuse: { value: null },
    toneMappingExposure: { value: 1 },
  },

  vertexShader: /* glsl */ `
		precision highp float;

		uniform mat4 modelViewMatrix;
		uniform mat4 projectionMatrix;

		attribute vec3 position;
		attribute vec2 uv;

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,

  fragmentShader: /* glsl */ `

		precision highp float;

		uniform sampler2D tDiffuse;

		#include <tonemapping_pars_fragment>
		#include <colorspace_pars_fragment>

		varying vec2 vUv;

		void main() {

			gl_FragColor = texture2D( tDiffuse, vUv );

			// tone mapping

			#ifdef LINEAR_TONE_MAPPING

				gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );

			#elif defined( REINHARD_TONE_MAPPING )

				gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );

			#elif defined( CINEON_TONE_MAPPING )

				gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );

			#elif defined( ACES_FILMIC_TONE_MAPPING )

				gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );

			#elif defined( AGX_TONE_MAPPING )

				gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );

			#elif defined( NEUTRAL_TONE_MAPPING )

				gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );

			#elif defined( CUSTOM_TONE_MAPPING )

				gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );

			#endif

			// color space

			#ifdef SRGB_TRANSFER

				gl_FragColor = sRGBTransferOETF( gl_FragColor );

			#endif

		}`,
};

/**
 * This pass is responsible for including tone mapping and color space conversion
 * into your pass chain. In most cases, this pass should be included at the end
 * of each pass chain. If a pass requires sRGB input (e.g. like FXAA), the pass
 * must follow `OutputPass` in the pass chain.
 *
 * The tone mapping and color space settings are extracted from the renderer.
 *
 * ```ts
 * const outputPass = new OutputPass();
 * composer.addPass(outputPass);
 * ```
 *
 * @augments Pass
 * @three_import import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
 */
export class OutputPass extends Pass {
  /** The pass uniforms. */
  public uniforms: Record<string, IUniform>;

  /** The pass material. */
  public material: RawShaderMaterial;

  // internals
  private _fsQuad: FullScreenQuad;
  private _outputColorSpace: ColorSpace | null;
  private _toneMapping: unknown;

  /**
   * Constructs a new output pass.
   */
  constructor() {
    super();

    this.uniforms = UniformsUtils.clone(OutputShader.uniforms);

    this.material = new RawShaderMaterial({
      name: OutputShader.name,
      uniforms: this.uniforms,
      vertexShader: OutputShader.vertexShader,
      fragmentShader: OutputShader.fragmentShader,
    });

    this._fsQuad = new FullScreenQuad(this.material);

    this._outputColorSpace = null;
    this._toneMapping = null;
  }

  /**
   * Performs the output pass.
   *
   * @param renderer - The renderer.
   * @param writeBuffer - The write buffer. This buffer is intended as the rendering destination for the pass.
   * @param readBuffer - The read buffer. The pass can access the result from the previous pass from this buffer.
   * @param _deltaTime - The delta time in seconds.
   * @param _maskActive - Whether masking is active or not.
   */
  render(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
    _deltaTime?: number,
    _maskActive?: boolean,
  ): void {
    this.uniforms["tDiffuse"].value = readBuffer.texture;
    this.uniforms["toneMappingExposure"].value = renderer.toneMappingExposure;

    // rebuild defines if required
    if (this._outputColorSpace !== renderer.outputColorSpace || this._toneMapping !== renderer.toneMapping) {
      this._outputColorSpace = renderer.outputColorSpace;
      this._toneMapping = renderer.toneMapping;

      this.material.defines = {};

      if (ColorManagement.getTransfer(this._outputColorSpace) === SRGBTransfer) {
        this.material.defines.SRGB_TRANSFER = "";
      }

      if (this._toneMapping === LinearToneMapping) this.material.defines.LINEAR_TONE_MAPPING = "";
      else if (this._toneMapping === ReinhardToneMapping) this.material.defines.REINHARD_TONE_MAPPING = "";
      else if (this._toneMapping === CineonToneMapping) this.material.defines.CINEON_TONE_MAPPING = "";
      else if (this._toneMapping === ACESFilmicToneMapping) this.material.defines.ACES_FILMIC_TONE_MAPPING = "";
      // else if (this._toneMapping === AgXToneMapping) this.material.defines.AGX_TONE_MAPPING = "";
      // else if (this._toneMapping === ToneMappin) this.material.defines.NEUTRAL_TONE_MAPPING = "";
      else if (this._toneMapping === CustomToneMapping) this.material.defines.CUSTOM_TONE_MAPPING = "";

      console.log(this._toneMapping);

      this.material.needsUpdate = true;
    }

    // this.renderToScreen = false;
    if (this.renderToScreen === true) {
      renderer.setRenderTarget(null);
      this._fsQuad.render(renderer);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
      this._fsQuad.render(renderer);
    }
  }

  /**
   * Frees the GPU-related resources allocated by this instance. Call this
   * method whenever the pass is no longer used in your app.
   */
  dispose(): void {
    this.material.dispose();
    this._fsQuad.dispose();
  }
}
