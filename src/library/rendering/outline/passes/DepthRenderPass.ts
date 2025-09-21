import {
  Scene,
  MeshDepthMaterial,
  WebGLRenderer,
  WebGLRenderTarget,
  DoubleSide,
  RGBADepthPacking,
  NoBlending,
} from "three";
import { Pass, Camera } from "../types";

export class DepthRenderPass extends Pass {
  scene: Scene;
  camera: Camera;
  selectedObjects: Array<any>;
  depthMaterial: MeshDepthMaterial;

  clear = true;
  needsSwap = false;

  constructor(scene: Scene, camera: Camera, selectedObjects: Array<any>) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.selectedObjects = selectedObjects;

    this.depthMaterial = new MeshDepthMaterial();
    this.depthMaterial.side = DoubleSide;
    this.depthMaterial.depthPacking = RGBADepthPacking;
    this.depthMaterial.blending = NoBlending;
  }

  private changeVisibilityOfSelectedObjects(visible: boolean): void {
    const toggle = (object: any) => {
      if (object.isMesh) {
        if (visible) {
          object.visible = object.userData.oldVisible;
          delete object.userData.oldVisible;
        } else {
          object.userData.oldVisible = object.visible;
          object.visible = visible;
        }
      }
    };

    for (const selectedObject of this.selectedObjects) {
      selectedObject.traverse(toggle);
    }
  }

  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget): void {
    const oldAutoClear = renderer.autoClear;
    const currentBackground = this.scene.background;
    const oldOverrideMaterial = this.scene.overrideMaterial;

    renderer.autoClear = false;
    this.scene.background = null;

    // Hide selected objects to render depth of everything else
    this.changeVisibilityOfSelectedObjects(false);

    this.scene.overrideMaterial = this.depthMaterial;
    renderer.setRenderTarget(writeBuffer);
    if (this.clear) renderer.clear();
    renderer.render(this.scene, this.camera);

    // Restore state
    this.changeVisibilityOfSelectedObjects(true);
    this.scene.background = currentBackground;
    this.scene.overrideMaterial = oldOverrideMaterial;
    renderer.autoClear = oldAutoClear;
  }

  dispose(): void {
    this.depthMaterial.dispose();
  }
}