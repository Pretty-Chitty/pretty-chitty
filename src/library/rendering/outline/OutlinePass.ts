import {
  Color,
  Vector2,
  Vector3,
  Matrix4,
  MeshBasicMaterial,
  MeshDepthMaterial,
  ShaderMaterial,
  WebGLRenderTarget,
  WebGLRenderer,
  Scene,
  DoubleSide,
  LinearFilter,
  RGBAFormat,
  RGBADepthPacking,
  NoBlending,
  UniformsUtils,
  IUniform,
  NormalBlending,
} from "three";
import { Pass, Camera } from "./types";
import { FullScreenQuad } from "./FullScreenQuad";
import { CopyShader } from "./shaders";

export class OutlinePass extends Pass {
  renderScene: Scene;
  renderCamera: Camera;
  selectedObjects: Array<any>;

  visibleEdgeColor = new Color(1, 1, 1);
  edgeGlow = 0.0;
  usePatternTexture = false;
  edgeThickness = 1.0;
  edgeStrength = 3.0;
  downSampleRatio = 2;
  pulsePeriod = 0;

  resolution: Vector2;

  maskBufferMaterial!: MeshBasicMaterial;
  renderTargetMaskBuffer!: WebGLRenderTarget;

  depthMaterial!: MeshDepthMaterial;
  prepareMaskMaterial!: ShaderMaterial;
  renderTargetDepthBuffer!: WebGLRenderTarget;

  renderTargetMaskDownSampleBuffer!: WebGLRenderTarget;

  renderTargetBlurBuffer1!: WebGLRenderTarget;
  renderTargetBlurBuffer2!: WebGLRenderTarget;

  edgeDetectionMaterial!: ShaderMaterial;
  renderTargetEdgeBuffer1!: WebGLRenderTarget;
  renderTargetEdgeBuffer2!: WebGLRenderTarget;

  separableBlurMaterial1!: ShaderMaterial;
  separableBlurMaterial2!: ShaderMaterial;

  overlayMaterial!: ShaderMaterial;

  copyUniforms!: Record<string, IUniform>;
  materialCopy!: ShaderMaterial;

  oldClearColor = new Color();
  oldClearAlpha = 1;

  fsQuad = new FullScreenQuad(null);

  tempPulseColor1 = new Color();
  tempPulseColor2 = new Color();
  textureMatrix = new Matrix4();

  patternTexture: any;

  static BlurDirectionX = new Vector2(1.0, 0.0);
  static BlurDirectionY = new Vector2(0.0, 1.0);

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

    this.initializeMaterials();
    this.initializeRenderTargets();

    this.enabled = true;
    this.needsSwap = false;
  }

  private initializeMaterials(): void {
    this.maskBufferMaterial = new MeshBasicMaterial({ color: 0xffffff });
    this.maskBufferMaterial.side = DoubleSide;

    this.depthMaterial = new MeshDepthMaterial();
    this.depthMaterial.side = DoubleSide;
    this.depthMaterial.depthPacking = RGBADepthPacking;
    this.depthMaterial.blending = NoBlending;

    this.prepareMaskMaterial = this.createPrepareMaskMaterial();
    this.prepareMaskMaterial.side = DoubleSide;
    this.prepareMaskMaterial.fragmentShader = this.replaceDepthToViewZ(
      this.prepareMaskMaterial.fragmentShader,
      this.renderCamera,
    );

    this.edgeDetectionMaterial = this.createEdgeDetectionMaterial();

    const MAX_EDGE_THICKNESS = 4;
    const MAX_EDGE_GLOW = 4;

    this.separableBlurMaterial1 = this.createSeparableBlurMaterial(MAX_EDGE_THICKNESS);
    this.separableBlurMaterial2 = this.createSeparableBlurMaterial(MAX_EDGE_GLOW);

    this.overlayMaterial = this.createOverlayMaterial();

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
  }

  private initializeRenderTargets(): void {
    const pars = { minFilter: LinearFilter, magFilter: LinearFilter, format: RGBAFormat } as any;

    const resx = Math.round(this.resolution.x / this.downSampleRatio);
    const resy = Math.round(this.resolution.y / this.downSampleRatio);

    this.renderTargetMaskBuffer = new WebGLRenderTarget(this.resolution.x, this.resolution.y, pars);
    this.renderTargetMaskBuffer.texture.name = "OutlinePass.mask";
    this.renderTargetMaskBuffer.texture.generateMipmaps = false;

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

    this.renderTargetEdgeBuffer1 = new WebGLRenderTarget(resx, resy, pars);
    this.renderTargetEdgeBuffer1.texture.name = "OutlinePass.edge1";
    this.renderTargetEdgeBuffer1.texture.generateMipmaps = false;

    this.renderTargetEdgeBuffer2 = new WebGLRenderTarget(Math.round(resx / 2), Math.round(resy / 2), pars);
    this.renderTargetEdgeBuffer2.texture.name = "OutlinePass.edge2";
    this.renderTargetEdgeBuffer2.texture.generateMipmaps = false;

    this.updateBlurMaterialUniforms(resx, resy);
  }

  private updateBlurMaterialUniforms(resx: number, resy: number): void {
    (this.separableBlurMaterial1.uniforms["texSize"].value as Vector2).set(resx, resy);
    (this.separableBlurMaterial1.uniforms["kernelRadius"].value as number) = 1;

    (this.separableBlurMaterial2.uniforms["texSize"].value as Vector2).set(Math.round(resx / 2), Math.round(resy / 2));
    (this.separableBlurMaterial2.uniforms["kernelRadius"].value as number) = 4;
  }

  private replaceDepthToViewZ(str: string, camera: Camera): string {
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
    if (this.selectedObjects.length === 0) {
      if (this.renderToScreen) {
        this.renderCopyToScreen(renderer, readBuffer);
      }
      return;
    }

    this.saveRenderState(renderer);
    this.setupRenderState(renderer, maskActive);

    this.renderDepthBuffer(renderer);
    this.prepareMask(renderer);
    this.downsampleMask(renderer);
    this.performEdgeDetection(renderer);
    this.performBlurPasses(renderer);
    this.renderOverlay(renderer, readBuffer, maskActive);

    this.restoreRenderState(renderer);

    if (this.renderToScreen) {
      this.renderCopyToScreen(renderer, readBuffer);
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

  private renderDepthBuffer(renderer: WebGLRenderer): void {
    this.changeVisibilityOfSelectedObjects(false);

    const currentBackground = this.renderScene.background;
    this.renderScene.background = null;

    this.renderScene.overrideMaterial = this.depthMaterial;
    renderer.setRenderTarget(this.renderTargetDepthBuffer);
    renderer.clear();
    renderer.render(this.renderScene, this.renderCamera);

    this.changeVisibilityOfSelectedObjects(true);
    this.renderScene.background = currentBackground;
  }

  private prepareMask(renderer: WebGLRenderer): void {
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
  }

  private downsampleMask(renderer: WebGLRenderer): void {
    this.fsQuad.material = this.materialCopy;
    (this.copyUniforms["tDiffuse"].value as any) = this.renderTargetMaskBuffer.texture;
    renderer.setRenderTarget(this.renderTargetMaskDownSampleBuffer);
    renderer.clear();
    this.fsQuad.render(renderer);
  }

  private performEdgeDetection(renderer: WebGLRenderer): void {
    this.updatePulseColors();

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
  }

  private updatePulseColors(): void {
    this.tempPulseColor1.copy(this.visibleEdgeColor);

    if (this.pulsePeriod > 0) {
      const scalar = (1 + 0.25) / 2 + (Math.cos((performance.now() * 0.01) / this.pulsePeriod) * (1.0 - 0.25)) / 2;
      this.tempPulseColor1.multiplyScalar(scalar);
      this.tempPulseColor2.multiplyScalar(scalar);
    }
  }

  private performBlurPasses(renderer: WebGLRenderer): void {
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
  }

  private renderOverlay(renderer: WebGLRenderer, readBuffer: WebGLRenderTarget, maskActive: boolean): void {
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
  }

  private renderCopyToScreen(renderer: WebGLRenderer, readBuffer: WebGLRenderTarget): void {
    this.fsQuad.material = this.materialCopy;
    (this.copyUniforms["tDiffuse"].value as any) = readBuffer.texture;
    renderer.setRenderTarget(null);
    this.fsQuad.render(renderer);
  }

  private createPrepareMaskMaterial(): ShaderMaterial {
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

  private createEdgeDetectionMaterial(): ShaderMaterial {
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

  private createSeparableBlurMaterial(maxRadius: number): ShaderMaterial {
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

  private createOverlayMaterial(): ShaderMaterial {
    return new ShaderMaterial({
      uniforms: {
        maskTexture: { value: null },
        edgeTexture1: { value: null },
        edgeTexture2: { value: null },
        patternTexture: { value: null },
        edgeStrength: { value: 1.0 },
        edgeGlow: { value: 1.0 },
        usePatternTexture: { value: false },
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
}