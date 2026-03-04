import { Group, Object3D } from "three";
import { GalleryItem } from "../components/GalleryViewer";
import { Chit } from "../game/Chit";
import { IconMap } from "../utilities/CanvasStack/CanvasOperations";
import { RichTextRenderOptionsParameters } from "../utilities/CanvasStack/RichTextRenderer";
import { SceneWrapper } from "./outline";

type UpdateHandler = () => void;

export class ChitGalleryItemInstance implements GalleryItem {
  private cbs: UpdateHandler[] = [];
  id: string;
  onClick?: (() => void) | undefined;
  unsubscribe: () => void;

  maximumWidth?: number;
  maximumHeight?: number;
  preferredWidth?: number;
  preferredHeight?: number;

  originalSummary?: string;
  summary?: string;
  shortSummary?: string;
  summaryIconMap?: IconMap;
  summaryRenderingOptions?: RichTextRenderOptionsParameters;
  shortSummaryRenderingOptions?: RichTextRenderOptionsParameters;

  private sceneWrapper: SceneWrapper | undefined;

  constructor(public chit: Chit) {
    this.id = chit.id ?? "no id";

    this.onClick = () => {
      if (chit.onClick) {
        chit.onClick();
      }
    };

    // handle refreshes.
    this.unsubscribe = chit.onChange("deserialized parent onClick renderInstance", () => {
      if (chit.renderInstance) {
        chit.renderInstance.createGalleryItem(this);
      }
      if (this.sceneWrapper) {
        this.sceneWrapper.markDirty();
      }
    });
    chit.renderInstance?.createGalleryItem(this);
  }

  private cloneWithUserData(object: Object3D): any {
    // Use Three.js clone for geometry/materials, then manually copy userData
    const cloned = object.clone(true);

    // Copy userData for the root object
    if (object.userData) {
      cloned.userData = { ...object.userData };
    }

    // Recursively copy userData for all children
    const copyUserDataRecursively = (original: any, clone: any) => {
      if (original.userData) {
        clone.userData = { ...original.userData };
      }

      // Process children
      if (original.children && clone.children) {
        for (let i = 0; i < original.children.length; i++) {
          if (original.children[i] && clone.children[i]) {
            copyUserDataRecursively(original.children[i], clone.children[i]);
          }
        }
      }
    };

    copyUserDataRecursively(object, cloned);
    return cloned;
  }

  createMesh(sceneWrapper: SceneWrapper) {
    this.sceneWrapper = sceneWrapper;
    const renderInstance = this.chit.renderInstance;
    const g = new Group();
    if (renderInstance) {
      const mesh = this.cloneWithUserData(renderInstance.group) ?? new Group();
      mesh.visible = true;
      mesh.rotation.set(0, 0, 0);
      mesh.position.set(0, 0, 0);
      g.add(mesh);
      g.rotation.order = "ZYX";
      g.rotation.setFromVector3(renderInstance.galleryRotation());
    }
    return g;
  }

  registerUpdateHandler(cb: UpdateHandler) {
    this.cbs.push(cb);
    return () => {
      this.cbs = this.cbs.filter((c) => c !== cb);
    };
  }

  update() {
    this.cbs.forEach((cb) => cb());
  }

  destroy() {
    this.unsubscribe();
  }
}
