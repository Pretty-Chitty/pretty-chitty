import { Scene, MeshBasicMaterial } from "three";

export class SceneWrapper {
  private realScene: Scene;
  private outlineScene: Scene;
  private shadowMeshes = new Map<number, any>(); // object.id -> shadow mesh
  private basicMaterial: MeshBasicMaterial;

  constructor(realScene: Scene) {
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

  update(): void {
    // Track existing shadow meshes
    const existingShadowIds = new Set(this.shadowMeshes.keys());
    const currentOutlineIds = new Set<number>();

    // Traverse real scene to find meshes with outline userData
    this.realScene.traverse((object: any) => {
      if (object.isMesh && object.userData?.outlineColor) {
        const meshId = object.id;
        currentOutlineIds.add(meshId);

        let shadowMesh = this.shadowMeshes.get(meshId);

        if (!shadowMesh) {
          // Create new shadow mesh
          shadowMesh = object.clone();
          shadowMesh.material = this.basicMaterial; // Use basic material, no textures
          shadowMesh.geometry = object.geometry; // Share geometry (no need to clone)

          this.shadowMeshes.set(meshId, shadowMesh);
          this.outlineScene.add(shadowMesh);
        }

        // Update transform to match original
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
        }
      }
    }
  }

  dispose(): void {
    this.shadowMeshes.clear();
    this.outlineScene.clear();
    this.basicMaterial.dispose();
  }
}