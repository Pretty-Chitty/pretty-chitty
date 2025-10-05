import { BufferGeometry, Material, Mesh, Object3D } from "three";
import { CanvasStack } from "../utilities/CanvasStack/CanvasStack";

export type TextureReferenceCounterRootGroup = {
  getRootGroup(): Object3D;
  markHasChange(): void;
};

export class TextureReferenaceCounter {
  private static instances: TextureReferenceCounterRootGroup[] = [];

  static registerInstance(instance: TextureReferenceCounterRootGroup) {
    if (!TextureReferenaceCounter.instances.includes(instance)) {
      TextureReferenaceCounter.instances.push(instance);
    }
  }

  static unregisterInstance(instance: TextureReferenceCounterRootGroup) {
    const index = TextureReferenaceCounter.instances.indexOf(instance);
    if (index !== -1) {
      TextureReferenaceCounter.instances.splice(index, 1);
    }
  }

  static update() {
    const allIdsUsed = new Set<string>();
    const allMaterialsUsed = new Map<string, Material>();
    const allGeosUsed = new Map<string, BufferGeometry>();
    const props = [
      "map",
      "lightMap",
      "aoMap",
      "emissiveMap",
      "bumpMap",
      "normalMap",
      "displacementMap",
      "specularMap",
      "alphaMap",
      "envMap",
    ];

    const processMaterial = (mat: Material) => {
      allMaterialsUsed.set(mat.uuid, mat);
      const mata = mat as any;
      props.forEach((prop) => {
        if (mata[prop]) {
          allIdsUsed.add(mata[prop].uuid);
        }
      });
    };

    // Scan all active root render instances
    TextureReferenaceCounter.instances.forEach((instance) => {
      instance.getRootGroup().traverse((obj) => {
        if (obj instanceof Mesh) {
          if (obj.geometry instanceof BufferGeometry) {
            allGeosUsed.set(obj.geometry.uuid, obj.geometry);
          }
          if (Array.isArray(obj.material)) {
            obj.material.forEach(processMaterial);
          } else {
            processMaterial(obj.material);
          }
        }
      });
    });

    // Mark all textures as used globally
    CanvasStack.disposer.markUsed(allIdsUsed, () => {
      // Mark all instances as dirty when textures change
      TextureReferenaceCounter.instances.forEach((instance) => {
        instance.markHasChange();
      });
    });
    CanvasStack.materialDisposer.markUsedMap(allMaterialsUsed, () => {
      TextureReferenaceCounter.instances.forEach((instance) => {
        instance.markHasChange();
      });
    });
    CanvasStack.geoDisposer.markUsedMap(allGeosUsed, () => {
      TextureReferenaceCounter.instances.forEach((instance) => {
        instance.markHasChange();
      });
    });
  }
}
