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
      this.onClick = chit.onClick.bind(chit);
    }
  }

  createMesh() {
    const mesh = this.chitRenderInstance.group.clone(true) ?? new Group();
    mesh.rotation.set(0, 0, 0);
    mesh.position.set(0, 0, 0);
    return mesh;
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
