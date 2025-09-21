import {
  Scene,
  ShaderMaterial,
  WebGLRenderer,
  WebGLRenderTarget,
  DoubleSide,
  Vector2,
  Matrix4,
} from "three";
import { Pass, Camera } from "../types";

export class MaskPreparationPass extends Pass {
  scene: Scene;
  camera: Camera;
  selectedObjects: Array<any>;
  prepareMaskMaterial: ShaderMaterial;
  textureMatrix = new Matrix4();

  clear = true;
  needsSwap = false;

  constructor(scene: Scene, camera: Camera, selectedObjects: Array<any>) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.selectedObjects = selectedObjects;

    this.prepareMaskMaterial = this.createPrepareMaskMaterial();
    this.prepareMaskMaterial.side = DoubleSide;
    this.prepareMaskMaterial.fragmentShader = this.replaceDepthToViewZ(
      this.prepareMaskMaterial.fragmentShader,
      this.camera,
    );
  }

  setDepthTexture(depthTexture: any): void {
    this.prepareMaskMaterial.uniforms["depthTexture"].value = depthTexture;
  }

  private replaceDepthToViewZ(str: string, camera: Camera): string {
    const type = (camera as any).isPerspectiveCamera ? "perspective" : "orthographic";
    return str.replace(/DEPTH_TO_VIEW_Z/g, `${type}DepthToViewZ`);
  }

  private updateTextureMatrix(): void {
    this.textureMatrix.set(0.5, 0.0, 0.0, 0.5, 0.0, 0.5, 0.0, 0.5, 0.0, 0.0, 0.5, 0.5, 0.0, 0.0, 0.0, 1.0);
    this.textureMatrix.multiply(this.camera.projectionMatrix);
    this.textureMatrix.multiply((this.camera as any).matrixWorldInverse);
  }

  private changeVisibilityOfNonSelectedObjects(visible: boolean): void {
    const selectedMeshes: any[] = [];
    const gather = (object: any) => {
      if (object.isMesh) selectedMeshes.push(object);
    };

    for (const selectedObject of this.selectedObjects) {
      selectedObject.traverse(gather);
    }

    const change = (object: any) => {
      if (object.isMesh || object.isLine || object.isSprite) {
        let found = false;
        for (const selectedMesh of selectedMeshes) {
          if (selectedMesh.id === object.id) {
            found = true;
            break;
          }
        }
        if (!found) {
          const visibility = object.visible;
          if (!visible || object.bVisible) object.visible = visible;
          object.bVisible = visibility;
        }
      }
    };

    this.scene.traverse(change);
  }

  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget): void {
    const oldAutoClear = renderer.autoClear;
    const oldOverrideMaterial = this.scene.overrideMaterial;

    renderer.autoClear = false;

    this.updateTextureMatrix();
    this.changeVisibilityOfNonSelectedObjects(false);

    this.scene.overrideMaterial = this.prepareMaskMaterial;

    // Update uniforms
    (this.prepareMaskMaterial.uniforms["cameraNearFar"].value as Vector2).set(
      (this.camera as any).near,
      (this.camera as any).far,
    );
    (this.prepareMaskMaterial.uniforms["textureMatrix"].value as Matrix4) = this.textureMatrix;

    renderer.setRenderTarget(writeBuffer);
    if (this.clear) renderer.clear();
    renderer.render(this.scene, this.camera);

    // Restore state
    this.scene.overrideMaterial = oldOverrideMaterial;
    this.changeVisibilityOfNonSelectedObjects(true);
    renderer.autoClear = oldAutoClear;
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

  dispose(): void {
    this.prepareMaskMaterial.dispose();
  }
}