import { Group, Material, Mesh, PlaneGeometry } from 'three';

type CardMeshOptions = {
  castShadow?: boolean;
  receiveShadow?: boolean;
  zDifference?: number;
};

export class CardMesh extends Group {
  constructor(width: number, height: number, front: Material, back: Material, options: CardMeshOptions = {}) {
    super();

    const face1 = new PlaneGeometry(width, height);
    this.add(new Mesh(face1, front));

    const face2 = new PlaneGeometry(width, height);
    face2.rotateY(Math.PI);
    face2.translate(0, 0, -(options.zDifference ?? 0.05));
    this.add(new Mesh(face2, back));

    if (options.castShadow) {
      this.children[0].castShadow = options.castShadow;
      this.children[1].castShadow = options.castShadow;
    }
    if (options.receiveShadow) {
      this.children[0].receiveShadow = options.receiveShadow;
      this.children[1].receiveShadow = options.receiveShadow;
    }
  }
}
