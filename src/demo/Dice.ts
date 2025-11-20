import { BoxGeometry, Mesh, MeshPhongMaterial } from "three";
import { Chit, ChitRenderSpec } from "../library";
import { DiceFace } from "./CanvasLibrary";

export class Dice extends Chit {
  size = 1;
  value: number = 1;
  pipPadding = 3;
  dpi = 100;
  backgroundColor: string = "#ffffff";
  foregroundColor: string = "#000000";

  public override render(spec: ChitRenderSpec): void {
    const boxGeometry = new BoxGeometry(this.size, this.size, this.size);
    const FACE_ORDER = [2, 5, 3, 4, 1, 6];
    spec.object = new Mesh(
      boxGeometry,
      FACE_ORDER.map((i) => {
        const texture = new DiceFace()
          .set((d) => {
            d.width = this.dpi;
            d.height = this.dpi;
            d.backgroundColor = this.backgroundColor;
            d.foregroundColor = this.foregroundColor;
            d.value = i;
            d.pipPadding = this.pipPadding;
          })
          .get().texture;
        const bump = new DiceFace()
          .set((d) => {
            d.width = this.dpi;
            d.height = this.dpi;
            d.shadow = true;
            d.value = i;
            d.pipPadding = this.pipPadding;
          })
          .get().texture;

        return new MeshPhongMaterial({
          map: texture,
          bumpMap: bump,
          bumpScale: -5,
        });
      }),
    );
    spec.object.castShadow = true;

    switch (this.value) {
      case 1:
        break;
      case 2:
        spec.rotateY = -Math.PI / 2;
        break;
      case 3:
        spec.rotateX = Math.PI / 2;
        break;
      case 4:
        spec.rotateX = Math.PI / 2;
        spec.rotateY = -Math.PI;
        break;
      case 5:
        spec.rotateY = Math.PI / 2;
        spec.rotateX = Math.PI;
        break;
      case 6:
        spec.rotateY = Math.PI;
        break;
    }

    spec.galleryRotateX = spec.rotateX;
    spec.galleryRotateY = spec.rotateY;
    spec.galleryRotateZ = spec.rotateZ;
    spec.galleryPreferredWidth = 65;
  }
}
