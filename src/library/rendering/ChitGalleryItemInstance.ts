import { Group } from "three";
import { GalleryItem } from "../components/GalleryViewer";
import { Chit } from "../game/Chit";
import { ChitRenderInstance } from "./ChitRenderInstance";

type UpdateHandler = () => void;

export class ChitGalleryItemInstance implements GalleryItem {
  private cbs: UpdateHandler[] = [];
  id: string;
  onClick?: (() => void) | undefined;

  constructor(
    private chitRenderInstance: ChitRenderInstance,
    private chit: Chit,
  ) {
    this.id = chit.id ?? "no id";

    if (chit.onClick) {
      this.onClick = () => {
        if (chit.onClick) {
          chit.onClick();
        }
      };
    }
  }

  createMesh() {
    const g = new Group();
    const mesh = this.chitRenderInstance.group.clone(true) ?? new Group();
    mesh.visible = true;
    mesh.rotation.set(0, 0, 0);
    mesh.position.set(0, 0, 0);
    g.add(mesh);
    g.rotation.setFromVector3(this.chitRenderInstance.galleryRotation());
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
}
