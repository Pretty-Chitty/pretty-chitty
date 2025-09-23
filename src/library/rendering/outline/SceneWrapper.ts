import { Scene, MeshBasicMaterial } from "three";

export class SceneWrapper {
  private realScene: Scene;
  private outlineScene: Scene;
  private shadowMeshes = new Map<number, any>(); // object.id -> shadow mesh
  private basicMaterial: MeshBasicMaterial;
  private outlinedObjects = new Map<number, any>(); // object.id -> original object

  constructor(realScene: Scene = new Scene()) {
    this.realScene = realScene;
    this.outlineScene = new Scene();
    this.basicMaterial = new MeshBasicMaterial({ color: 0xffffff });
  }

  get scene(): Scene {
    return this.realScene;
  }

  get outlineShadowScene(): Scene {
    return this.outlineScene;
  }

  get hasOutlinedObjects(): boolean {
    return this.outlinedObjects.size > 0;
  }

  _dirty = false;
  markDirty() {
    this._dirty = true;
  }

  // Fast update - only updates transforms of existing outlined objects
  update(): void {
    if (this._dirty) {
      this.fullUpdate();
      return;
    }

    for (const [meshId, originalObject] of this.outlinedObjects) {
      const shadowMesh = this.shadowMeshes.get(meshId);
      if (shadowMesh && originalObject.parent) {
        // Only update if object still exists in scene
        // Update transform to match original but with scaling applied
        originalObject.updateMatrixWorld(true);
        shadowMesh.matrix.copy(originalObject.matrixWorld);
        shadowMesh.matrix.scale(shadowMesh.scale);
        shadowMesh.matrixWorldNeedsUpdate = false;
      }
    }
  }

  // Full update - traverses scene to find objects that should be outlined
  fullUpdate(): void {
    this._dirty = false;

    // Track existing shadow meshes
    const existingShadowIds = new Set(this.shadowMeshes.keys());
    const currentOutlineIds = new Set<number>();

    // Traverse real scene to find meshes with outline userData
    this.realScene.traverse((object: any) => {
      if (object.isMesh && object.userData?.outlineColor) {
        const meshId = object.id;
        currentOutlineIds.add(meshId);

        // Track this as an outlined object
        this.outlinedObjects.set(meshId, object);

        let shadowMesh = this.shadowMeshes.get(meshId);

        if (!shadowMesh) {
          // Create new shadow mesh
          shadowMesh = object.clone();
          shadowMesh.geometry = object.geometry; // Share geometry (no need to clone)

          // Use basic material - transparency is handled in ID pass
          shadowMesh.material = this.basicMaterial.clone();

          // Copy the userData for the outline system
          shadowMesh.userData = { ...object.userData };

          this.shadowMeshes.set(meshId, shadowMesh);
          this.outlineScene.add(shadowMesh);
        }

        // Update userData to reflect any changes (like outline color changes)
        shadowMesh.userData = { ...object.userData };

        // Update transform to match original but with scaling applied
        object.updateMatrixWorld(true);
        shadowMesh.matrix.copy(object.matrixWorld);

        shadowMesh.matrixWorldNeedsUpdate = false;
        shadowMesh.matrixAutoUpdate = false; // We'll manage transforms manually
      }
    });

    // Remove shadow meshes for objects that no longer have outlines
    for (const existingId of existingShadowIds) {
      if (!currentOutlineIds.has(existingId)) {
        const shadowMesh = this.shadowMeshes.get(existingId);
        if (shadowMesh) {
          this.outlineScene.remove(shadowMesh);
          this.shadowMeshes.delete(existingId);
          this.outlinedObjects.delete(existingId);
        }
      }
    }
  }

  dispose(): void {
    this.shadowMeshes.clear();
    this.outlinedObjects.clear();
    this.outlineScene.clear();
    this.basicMaterial.dispose();
  }
}
