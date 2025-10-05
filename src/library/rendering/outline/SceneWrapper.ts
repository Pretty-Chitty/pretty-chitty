import { Scene, Vector3, Quaternion, Mesh } from "three";

export class SceneWrapper {
  private realScene: Scene;
  private outlineScene: Scene;
  private shadowMeshes = new Map<number, Mesh>(); // object.id -> shadow mesh
  private outlinedObjects = new Map<number, Mesh>(); // object.id -> original object
  private materialHashes = new Map<number, string>(); // object.id -> material hash for change detection
  private outlinePass: any = null; // Will be set by IDBasedOutlinePass

  // Material update tracking
  private materialsDirty = false;
  private lastDepthTexture: any = null;

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
    // return false;
    return this.outlinedObjects.size > 0;
  }

  _dirty = true;
  _needsRebuild = false;
  markDirty() {
    this._dirty = true;
  }

  markMaterialsDirty() {
    this.materialsDirty = true;
  }

  rebuild() {
    this._dirty = true;
    this._needsRebuild = true;
  }

  private executeRebuild() {
    if (!this._needsRebuild) {
      return;
    }
    this._needsRebuild = false;

    // Remove shadow meshes for objects that no longer have outlines
    for (const existingId of this.shadowMeshes.keys()) {
      const shadowMesh = this.shadowMeshes.get(existingId);
      this.outlineScene.remove(shadowMesh!);
      // Dispose materials to prevent GPU memory leaks
      if (shadowMesh!.material) {
        if (Array.isArray(shadowMesh!.material)) {
          shadowMesh!.material.forEach((mat) => mat.dispose());
        } else {
          shadowMesh!.material.dispose();
        }
      }
    }
    this.shadowMeshes.clear();
    this.outlinedObjects.clear();
    this.materialHashes.clear();
  }

  private _lastX = -1;
  private _lastY = -1;
  setOutlinePass(outlinePass: any) {
    const outlinePassChanged = this.outlinePass !== outlinePass;
    this.outlinePass = outlinePass;

    if (outlinePassChanged || this._lastX !== outlinePass.resolution.x || this._lastY !== outlinePass.resolution.y) {
      this._lastX = outlinePass.resolution.x;
      this._lastY = outlinePass.resolution.y;
      this.rebuild();
    }
  }

  // Generate hash of material properties for change detection
  private getMaterialHash(material: any): string {
    if (!material) return "null";

    if (Array.isArray(material)) {
      return material.map((m) => this.getSingleMaterialHash(m)).join("|");
    }

    return this.getSingleMaterialHash(material);
  }

  private getSingleMaterialHash(material: any): string {
    if (!material) return "null";

    // Hash key material properties that would affect ID material creation
    const props = [
      material.uuid || "no-uuid",
      material.transparent || false,
      material.opacity || 1,
      material.alphaTest || 0,
      material.side || 0,
      material.map?.uuid || "no-map",
    ];

    return props.join("_");
  }

  // Fast update - only updates transforms of existing outlined objects
  update(): void {
    if (this._dirty) {
      this.fullUpdate();
    }

    // Update materials if needed
    if (this.materialsDirty && this.outlinePass) {
      this.updateMaterials();
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

    this.executeRebuild();

    // Log memory before flush if significant changes expected
    const beforeMemory = this.getMemorySnapshot();

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

        // Check if material has changed
        const currentMaterialHash = this.getMaterialHash(object.material);
        const previousMaterialHash = this.materialHashes.get(meshId);
        const materialChanged = previousMaterialHash !== currentMaterialHash;

        let shadowMesh = this.shadowMeshes.get(meshId);

        if (!shadowMesh) {
          // Create new shadow mesh
          shadowMesh = object.clone() as Mesh;
          shadowMesh.geometry = object.geometry; // Share geometry (no need to clone)

          // Copy the userData for the outline system
          shadowMesh.userData = { ...object.userData };

          // Ensure shadow properties are copied
          shadowMesh.castShadow = object.castShadow;
          shadowMesh.receiveShadow = object.receiveShadow;

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

          // Let the outline pass prepare the ID materials for this new mesh
          if (this.outlinePass) {
            this.outlinePass.prepareShadowMesh(shadowMesh, object);
          }

          // Store material hash
          this.materialHashes.set(meshId, currentMaterialHash);
        } else {
          // Update userData to reflect any changes (like outline color changes)
          const userDataChanged =
            object.userData.outlineColor !== shadowMesh.userData.outlineColor ||
            object.userData.outlineId !== shadowMesh.userData.outlineId;
          shadowMesh.userData = { ...object.userData };

          // Update transform to match original
          const worldPos = new Vector3();
          const worldQuat = new Quaternion();
          const worldScale = new Vector3();
          object.matrixWorld.decompose(worldPos, worldQuat, worldScale);

          shadowMesh.position.copy(worldPos);
          shadowMesh.quaternion.copy(worldQuat);
          shadowMesh.scale.copy(worldScale);
          shadowMesh.updateMatrix();
          shadowMesh.updateMatrixWorld(true);

          // If material changed, recreate ID materials
          if ((materialChanged || userDataChanged) && this.outlinePass) {
            this.outlinePass.prepareShadowMesh(shadowMesh, object);
            this.materialHashes.set(meshId, currentMaterialHash);
          }
        }
      }
    });

    // Remove shadow meshes for objects that no longer have outlines
    for (const existingId of existingShadowIds) {
      if (!currentOutlineIds.has(existingId)) {
        const shadowMesh = this.shadowMeshes.get(existingId);
        if (shadowMesh) {
          this.outlineScene.remove(shadowMesh);

          // Dispose materials to prevent GPU memory leaks
          if (shadowMesh.material) {
            if (Array.isArray(shadowMesh.material)) {
              shadowMesh.material.forEach((mat) => mat.dispose());
            } else {
              shadowMesh.material.dispose();
            }
          }

          this.shadowMeshes.delete(existingId);
          this.outlinedObjects.delete(existingId);
          this.materialHashes.delete(existingId);
        }
      }
    }

    // Log memory after flush and compare
    const afterMemory = this.getMemorySnapshot();
    this.logMemoryChanges(beforeMemory, afterMemory, existingShadowIds.size, currentOutlineIds.size);
  }

  // Single consolidated material update method
  updateMaterials(): void {
    if (!this.outlinePass) return;

    const currentDepthTexture = this.outlinePass.sceneDepthTexture;
    const depthTextureChanged = this.lastDepthTexture !== currentDepthTexture;

    if (!this.materialsDirty && !depthTextureChanged) {
      return; // No updates needed
    }

    const useDepthTest = currentDepthTexture !== null;
    let materialsUpdated = false;

    // Update all shadow mesh materials in one pass
    this.outlineScene.traverse((object: any) => {
      if (object.isMesh && object.material) {
        const updateMaterial = (mat: any) => {
          if (mat.uniforms) {
            let materialChanged = false;

            if (mat.uniforms["sceneDepthTexture"] && mat.uniforms["sceneDepthTexture"].value !== currentDepthTexture) {
              mat.uniforms["sceneDepthTexture"].value = currentDepthTexture;
              materialChanged = true;
            }

            if (mat.uniforms["useDepthTest"] && mat.uniforms["useDepthTest"].value !== useDepthTest) {
              mat.uniforms["useDepthTest"].value = useDepthTest;
              materialChanged = true;
            }

            if (materialChanged) {
              mat.needsUpdate = true;
              materialsUpdated = true;
            }
          }
        };

        if (Array.isArray(object.material)) {
          object.material.forEach(updateMaterial);
        } else {
          updateMaterial(object.material);
        }
      }
    });

    // Update tracking
    this.lastDepthTexture = currentDepthTexture;
    this.materialsDirty = false;

    if (materialsUpdated) {
      console.log(
        `SceneWrapper: Updated materials (depth texture: ${!!currentDepthTexture}, useDepthTest: ${useDepthTest})`,
      );
    }
  }

  dispose(): void {
    // Dispose all shadow mesh materials before clearing
    for (const shadowMesh of this.shadowMeshes.values()) {
      if (shadowMesh.material) {
        if (Array.isArray(shadowMesh.material)) {
          shadowMesh.material.forEach((mat) => mat.dispose());
        } else {
          shadowMesh.material.dispose();
        }
      }
    }

    this.shadowMeshes.clear();
    this.outlinedObjects.clear();
    this.materialHashes.clear();
    this.outlineScene.clear();
  }

  private getMemorySnapshot() {
    // Shadow scene stats (outline materials)
    const shadowStats = this.analyzeSceneMemory(this.outlineScene, "shadow");

    // Real scene stats (original materials)
    const realStats = this.analyzeSceneMemory(this.realScene, "real");

    return {
      timestamp: performance.now(),
      shadow: shadowStats,
      real: realStats,
    };
  }

  private analyzeSceneMemory(scene: any, sceneType: string) {
    const geometries = new Set();
    const materials = new Set();
    const textureMemoryMap = new Map<string, number>(); // Store memory usage, not texture refs
    let totalMeshes = 0;
    let totalVertices = 0;
    let totalFaces = 0;
    let transparentMaterials = 0;
    let opaqueMaterials = 0;
    let texturesUsed = 0;
    let outlinedMeshes = 0;
    let nonOutlinedMeshes = 0;

    scene.traverse((object: any) => {
      if (object.isMesh) {
        totalMeshes++;

        // Check if mesh has outline userData
        if (object.userData?.outlineColor) {
          outlinedMeshes++;
        } else {
          nonOutlinedMeshes++;
        }

        // Analyze geometry
        if (object.geometry) {
          geometries.add(object.geometry.uuid);
          const positions = object.geometry.attributes.position;
          if (positions) {
            totalVertices += positions.count;
            if (object.geometry.index) {
              totalFaces += object.geometry.index.count / 3;
            } else {
              totalFaces += positions.count / 3;
            }
          }
        }

        // Analyze materials
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach((mat: any) => {
              materials.add(mat.uuid);
              this.analyzeMaterial(mat, sceneType, {
                transparentMaterials: () => transparentMaterials++,
                opaqueMaterials: () => opaqueMaterials++,
                texturesUsed: () => texturesUsed++,
                textureMemoryMap,
              });
            });
          } else {
            materials.add(object.material.uuid);
            this.analyzeMaterial(object.material, sceneType, {
              transparentMaterials: () => transparentMaterials++,
              opaqueMaterials: () => opaqueMaterials++,
              texturesUsed: () => texturesUsed++,
              textureMemoryMap,
            });
          }
        }
      }
    });

    // Sum up texture memory
    const textureMemoryMB = Array.from(textureMemoryMap.values()).reduce((sum, mem) => sum + mem, 0);

    return {
      meshes: totalMeshes,
      outlinedMeshes,
      nonOutlinedMeshes,
      geometries: geometries.size,
      materials: materials.size,
      textures: textureMemoryMap.size,
      textureMemoryMB,
      vertices: totalVertices,
      faces: totalFaces,
      transparentMaterials,
      opaqueMaterials,
      texturesUsed,
    };
  }

  private analyzeMaterial(material: any, sceneType: string, counters: any) {
    if (sceneType === "shadow") {
      // Shadow materials (ID materials)
      if (material.transparent) {
        counters.transparentMaterials();
      } else {
        counters.opaqueMaterials();
      }
      if (material.uniforms?.originalMap?.value) {
        counters.texturesUsed();
        const texture = material.uniforms.originalMap.value;
        if (!counters.textureMemoryMap.has(texture.uuid)) {
          counters.textureMemoryMap.set(texture.uuid, this.calculateSingleTextureMemory(texture));
        }
      }
    } else {
      // Real scene materials (original materials)
      if (material.transparent || material.opacity < 1.0) {
        counters.transparentMaterials();
      } else {
        counters.opaqueMaterials();
      }
      if (material.map) {
        counters.texturesUsed();
        if (!counters.textureMemoryMap.has(material.map.uuid)) {
          counters.textureMemoryMap.set(material.map.uuid, this.calculateSingleTextureMemory(material.map));
        }
      }
      // Also check other common texture maps
      ["normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "aoMap"].forEach((mapType) => {
        if (material[mapType]) {
          if (!counters.textureMemoryMap.has(material[mapType].uuid)) {
            counters.textureMemoryMap.set(material[mapType].uuid, this.calculateSingleTextureMemory(material[mapType]));
          }
        }
      });
    }
  }

  private calculateSingleTextureMemory(texture: any): number {
    if (!texture?.image) return 0;

    const width = texture.image.width || 512; // Default fallback
    const height = texture.image.height || 512;

    // Determine bytes per pixel based on format
    let bytesPerPixel = 4; // Default RGBA
    if (texture.format !== undefined) {
      // Three.js texture formats
      switch (texture.format) {
        case 1023: // RGBAFormat
          bytesPerPixel = 4;
          break;
        case 1022: // RGBFormat
          bytesPerPixel = 3;
          break;
        case 1021: // RGFormat (Red Green)
          bytesPerPixel = 2;
          break;
        case 1019: // RedFormat
          bytesPerPixel = 1;
          break;
        case 1020: // AlphaFormat
          bytesPerPixel = 1;
          break;
        default:
          bytesPerPixel = 4; // Safe default
      }
    }

    // Base texture memory
    let textureMemory = width * height * bytesPerPixel;

    // Add mipmap memory (approximately 1.33x base size if mipmaps enabled)
    if (texture.generateMipmaps !== false) {
      textureMemory *= 1.33;
    }

    // Convert to MB
    return textureMemory / (1024 * 1024);
  }

  private logMemoryChanges(before: any, after: any, beforeCount: number, afterCount: number) {
    // Check for significant changes in either scene
    const shadowChanged = this.hasSignificantChanges(before.shadow, after.shadow);
    const realChanged = this.hasSignificantChanges(before.real, after.real);

    if (shadowChanged || realChanged) {
      console.group(`SceneWrapper Memory Update (${beforeCount} → ${afterCount} outlined objects)`);

      // Real Scene Stats
      console.group(`🎨 Real Scene (Original Materials)`);
      this.logSceneStats(before.real, after.real);
      console.groupEnd();

      // Shadow Scene Stats
      console.group(`👤 Shadow Scene (Outline Materials)`);
      this.logSceneStats(before.shadow, after.shadow);
      console.groupEnd();

      // Combined memory estimate
      const totalVertices = after.real.vertices + after.shadow.vertices;
      const totalFaces = after.real.faces + after.shadow.faces;
      const vertexMemoryMB = (totalVertices * 3 * 4) / (1024 * 1024);
      const faceMemoryMB = (totalFaces * 3 * 2) / (1024 * 1024);
      const totalTextures = after.real.textures + after.shadow.textures;
      const totalTextureMemoryMB = (after.real.textureMemoryMB || 0) + (after.shadow.textureMemoryMB || 0);

      console.log(`📊 Combined Memory Estimate:`);
      console.log(`  Geometry: ${(vertexMemoryMB + faceMemoryMB).toFixed(2)}MB`);
      console.log(`  Textures: ${totalTextureMemoryMB.toFixed(2)}MB (${totalTextures} unique)`);
      console.log(`  Total GPU: ${(vertexMemoryMB + faceMemoryMB + totalTextureMemoryMB).toFixed(2)}MB`);
      console.log(`  Optimization: ${after.shadow.opaqueMaterials} shadow materials skip texture sampling`);

      console.groupEnd();
    }
  }

  private hasSignificantChanges(before: any, after: any): boolean {
    if (!before || !after) return true;
    return (
      Math.abs(after.meshes - before.meshes) > 0 ||
      Math.abs(after.geometries - before.geometries) > 0 ||
      Math.abs(after.materials - before.materials) > 0
    );
  }

  private logSceneStats(before: any, after: any) {
    if (!before || !after) {
      console.log("No previous data for comparison");
      return;
    }

    const meshDelta = after.meshes - before.meshes;
    const geometryDelta = after.geometries - before.geometries;
    const materialDelta = after.materials - before.materials;
    const vertexDelta = after.vertices - before.vertices;
    const faceDelta = after.faces - before.faces;
    const transparentDelta = after.transparentMaterials - before.transparentMaterials;
    const opaqueDelta = after.opaqueMaterials - before.opaqueMaterials;
    const texturesDelta = after.texturesUsed - before.texturesUsed;
    const textureMemoryDelta = (after.textureMemoryMB || 0) - (before.textureMemoryMB || 0);

    console.log(`Meshes: ${before.meshes} → ${after.meshes} (${meshDelta > 0 ? "+" : ""}${meshDelta})`);
    console.log(`  ├─ With Outlines: ${before.outlinedMeshes || 0} → ${after.outlinedMeshes || 0}`);
    console.log(`  └─ Without Outlines: ${before.nonOutlinedMeshes || 0} → ${after.nonOutlinedMeshes || 0}`);
    console.log(
      `Geometries: ${before.geometries} → ${after.geometries} (${geometryDelta > 0 ? "+" : ""}${geometryDelta})`,
    );
    console.log(
      `Materials: ${before.materials} → ${after.materials} (${materialDelta > 0 ? "+" : ""}${materialDelta})`,
    );
    console.log(
      `  ├─ Transparent: ${before.transparentMaterials} → ${after.transparentMaterials} (${transparentDelta > 0 ? "+" : ""}${transparentDelta})`,
    );
    console.log(
      `  ├─ Opaque: ${before.opaqueMaterials} → ${after.opaqueMaterials} (${opaqueDelta > 0 ? "+" : ""}${opaqueDelta})`,
    );
    console.log(
      `  └─ Using Textures: ${before.texturesUsed} → ${after.texturesUsed} (${texturesDelta > 0 ? "+" : ""}${texturesDelta})`,
    );
    console.log(
      `Textures: ${(before.textureMemoryMB || 0).toFixed(2)}MB → ${(after.textureMemoryMB || 0).toFixed(2)}MB (${textureMemoryDelta > 0 ? "+" : ""}${textureMemoryDelta.toFixed(2)}MB)`,
    );
    console.log(
      `Vertices: ${before.vertices.toLocaleString()} → ${after.vertices.toLocaleString()} (${vertexDelta > 0 ? "+" : ""}${vertexDelta.toLocaleString()})`,
    );
    console.log(
      `Faces: ${before.faces.toLocaleString()} → ${after.faces.toLocaleString()} (${faceDelta > 0 ? "+" : ""}${faceDelta.toLocaleString()})`,
    );
  }
}
