import { Scene, Vector3, Quaternion, Mesh } from "three";

export class SceneWrapper {
  private realScene: Scene;
  private outlineScene: Scene;
  private shadowMeshes = new Map<number, Mesh>(); // object.id -> shadow mesh
  private outlinedObjects = new Map<number, Mesh>(); // object.id -> original object

  constructor(realScene: Scene = new Scene()) {
    this.realScene = realScene;
    this.outlineScene = new Scene();
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

  _dirty = true;
  markDirty() {
    this._dirty = true;
  }

  // Fast update - only updates transforms of existing outlined objects
  update(): void {
    if (this._dirty) {
      this.fullUpdate();
    }

    for (const [meshId, originalObject] of this.outlinedObjects) {
      const shadowMesh = this.shadowMeshes.get(meshId);
      if (shadowMesh && originalObject.parent) {
        // Only update if object still exists in scene
        // Update transform to match original
        originalObject.updateMatrixWorld(true);
        const worldPos = new Vector3();
        const worldQuat = new Quaternion();
        const worldScale = new Vector3();
        originalObject.matrixWorld.decompose(worldPos, worldQuat, worldScale);

        shadowMesh.position.copy(worldPos);
        shadowMesh.quaternion.copy(worldQuat);
        shadowMesh.scale.copy(worldScale);
        shadowMesh.updateMatrix();
        shadowMesh.updateMatrixWorld(true);
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

        // Check if object is at origin - if so, delay shadow mesh creation
        object.updateMatrixWorld(true);
        const worldPos = object.getWorldPosition(new Vector3());

        // Track this as an outlined object
        this.outlinedObjects.set(meshId, object);

        let shadowMesh = this.shadowMeshes.get(meshId);

        if (!shadowMesh) {
          // Create new shadow mesh
          shadowMesh = object.clone() as Mesh;
          shadowMesh.geometry = object.geometry; // Share geometry (no need to clone)

          // Keep original material for transparency support
          // shadowMesh.material = object.material.clone ? object.material.clone() : object.material;

          // Copy the userData for the outline system
          shadowMesh.userData = { ...object.userData };

          // Get the world transform and decompose it into position/rotation/scale
          // (worldPos already calculated above)
          const worldQuat = new Quaternion();
          const worldScale = new Vector3();
          const tempWorldPos = new Vector3(); // temp variable for decompose
          object.matrixWorld.decompose(tempWorldPos, worldQuat, worldScale);

          // Apply world transform and force immediate matrix update
          shadowMesh.position.copy(worldPos);
          shadowMesh.quaternion.copy(worldQuat);
          shadowMesh.scale.copy(worldScale);
          shadowMesh.updateMatrix();
          shadowMesh.updateMatrixWorld(true); // Force immediate world matrix update

          this.shadowMeshes.set(meshId, shadowMesh);
          this.outlineScene.add(shadowMesh);
        } else {
          // Update userData to reflect any changes (like outline color changes)
          shadowMesh.userData = { ...object.userData };

          // Update transform to match original
          object.updateMatrixWorld(true);
          const worldPos = new Vector3();
          const worldQuat = new Quaternion();
          const worldScale = new Vector3();
          object.matrixWorld.decompose(worldPos, worldQuat, worldScale);

          shadowMesh.position.copy(worldPos);
          shadowMesh.quaternion.copy(worldQuat);
          shadowMesh.scale.copy(worldScale);
          shadowMesh.updateMatrix();
          shadowMesh.updateMatrixWorld(true);
        }
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
  }
}
