import { Group } from "three";
import { GalleryItem } from "../components/GalleryViewer";
import { Chit } from "../game/Chit";

type UpdateHandler = () => void;

export class ChitGalleryItemInstance implements GalleryItem {
  private cbs: UpdateHandler[] = [];
  id: string;
  onClick?: (() => void) | undefined;
  unsubscribe: () => void;

  maximumWidth?: number | undefined;
  maximumHeight?: number | undefined;

  constructor(private chit: Chit) {
    this.id = chit.id ?? "no id";

    this.onClick = () => {
      if (chit.onClick) {
        chit.onClick();
      }
    };

    // handle refreshes.
    this.unsubscribe = chit.onChange("deserialized parent", () => {
      if (chit.renderInstance) {
        chit.renderInstance.createGalleryItem(this);
      }
    });
    chit.renderInstance?.createGalleryItem(this);
  }

  createMesh() {
    const renderInstance = this.chit.renderInstance;
    const g = new Group();
    if (renderInstance) {
      const mesh = renderInstance.group.clone(true) ?? new Group();
      mesh.visible = true;
      mesh.rotation.set(0, 0, 0);
      mesh.position.set(0, 0, 0);
      g.add(mesh);
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
