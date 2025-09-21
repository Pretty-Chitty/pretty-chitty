import {
  Scene,
  ShaderMaterial,
  WebGLRenderer,
  WebGLRenderTarget,
  DoubleSide,
  MeshBasicMaterial,
  Color,
} from "three";
import { Pass, Camera } from "../types";

export class ObjectIDRenderPass extends Pass {
  scene: Scene;
  camera: Camera;
  private originalMaterials = new Map<any, any>();
  private idMaterials = new Map<number, MeshBasicMaterial>();

  clear = true;
  needsSwap = false;

  constructor(scene: Scene, camera: Camera) {
    super();
    this.scene = scene;
    this.camera = camera;
  }

  render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget): void {
    const oldAutoClear = renderer.autoClear;
    const currentBackground = this.scene.background;

    renderer.autoClear = false;
    this.scene.background = null;

    // Replace all materials with ID materials
    this.applyIDMaterials();

    renderer.setRenderTarget(writeBuffer);
    if (this.clear) renderer.clear();
    renderer.render(this.scene, this.camera);

    // Restore original materials
    this.restoreOriginalMaterials();

    // Restore state
    this.scene.background = currentBackground;
    renderer.autoClear = oldAutoClear;
  }

  private applyIDMaterials(): void {
    this.originalMaterials.clear();

    this.scene.traverse((object: any) => {
      if (object.isMesh) {
        // Store original material
        this.originalMaterials.set(object, object.material);

        // Use Three.js built-in object ID
        const meshID = object.id;

        // Store ID for later reference
        object.userData.renderID = meshID;

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
    this.scene.traverse((object: any) => {
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

  // Helper method to get mesh ID from RGB color
  static rgbToMeshID(r: number, g: number, b: number): number {
    return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
  }

  // Helper method to encode mesh ID to RGB color
  static meshIDToRgb(meshID: number): [number, number, number] {
    const r = ((meshID >> 16) & 0xff) / 255.0;
    const g = ((meshID >> 8) & 0xff) / 255.0;
    const b = (meshID & 0xff) / 255.0;
    return [r, g, b];
  }

  // Helper method to get all mesh IDs for selected objects
  getSelectedObjectIDs(selectedObjects: Array<any>): Set<number> {
    const selectedIDs = new Set<number>();

    for (const selectedObject of selectedObjects) {
      selectedObject.traverse((object: any) => {
        if (object.isMesh) {
          selectedIDs.add(object.id); // Use Three.js built-in ID
        }
      });
    }

    return selectedIDs;
  }

  dispose(): void {
    // Dispose all created ID materials
    for (const material of this.idMaterials.values()) {
      material.dispose();
    }
    this.idMaterials.clear();
    this.originalMaterials.clear();
  }
}