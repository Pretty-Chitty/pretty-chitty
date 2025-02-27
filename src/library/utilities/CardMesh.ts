import { Group, Material, Mesh, PlaneGeometry } from "three";

type CardMeshOptions = {
  castShadow?: boolean;
  receiveShadow?: boolean;
  zDifference?: number;
};

export class CardMesh extends Group {
  constructor(
    private width: number,
    private height: number,
    private front: Material,
    private back: Material,
    private options: CardMeshOptions = {},
  ) {
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

  override clone(): this {
    const cloned = new CardMesh(this.width, this.height, this.front, this.back, this.options);
    cloned.position.copy(this.position);
    cloned.rotation.copy(this.rotation);
    cloned.scale.copy(this.scale);
    cloned.quaternion.copy(this.quaternion);
    cloned.matrix.copy(this.matrix);
    cloned.matrixWorld.copy(this.matrixWorld);
    cloned.matrixAutoUpdate = this.matrixAutoUpdate;
    cloned.matrixWorldNeedsUpdate = this.matrixWorldNeedsUpdate;
    cloned.layers.mask = this.layers.mask;
    cloned.visible = this.visible;
    cloned.castShadow = this.castShadow;
    cloned.receiveShadow = this.receiveShadow;
    cloned.frustumCulled = this.frustumCulled;
    cloned.renderOrder = this.renderOrder;
    return cloned as this;
  }
}
