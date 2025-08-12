import React from "react";
import {
  BackSide,
  BoxGeometry,
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  MeshPhongMaterial,
  PlaneGeometry,
  Vector3,
} from "three";
import {
  BagSparkChit,
  PanelChit,
  GameDeck,
  RootChit,
  PlayerChit,
  DropdownChit,
  SparkChit,
  ChildOutlet,
  Chit,
  OwnerOriginPosition,
  ChitRenderSpec,
  OrderedOutlet,
  StaticImage,
} from "../library";

import { TestStack } from "./TestStack";
import { TestStack2 } from "./TestStack2";
import { PlayerAid } from "./PlayerAid";
import { cityscape, cityscape2 } from "./assets/network_overload";
import { Ordered } from "../library/utilities/Annotations";
import { CardMesh } from "../library/utilities/CardMesh";

export * from "../library/utilities/BaseTable";

export class Table extends Chit {}

export class Row extends Chit {}

export class Deck extends GameDeck<Card> {
  tapped = false;

  constructor() {
    super();
  }

  public override render(spec: ChitRenderSpec): void {
    const boxGeometry = new BoxGeometry(1, 2, 1);

    const ts = new TestStack().set((obj) => {
      obj.subTitle = "This is the deck";
    });

    const face = new MeshPhongMaterial({
      bumpMap: ts.get().texture,
      bumpScale: 1,
      map: ts.get().texture,
    });

    const side = new MeshPhongMaterial({
      color: 0xbbbbbb,
    });

    spec.object = new Mesh(boxGeometry, [side, side, side, side, face, side]);
    spec.offsetX = -2;
    spec.rotateZ = this.tapped ? Math.PI / 2 : 0;
    spec.object.castShadow = true;

    spec.showChildrenAsGallery();
  }
}

export class Hand extends Chit {
  public override render(spec: ChitRenderSpec): void {
    spec.showChildrenAsGallery();
  }
}

export class Card extends Chit {
  public something: number = 2;
  public tapped: boolean = false;
  public flipped: boolean = false;
  public x = 0;
  public y = 0;

  @ChildOutlet(new Vector3(0.5, 0, 0)) public token?: Card2;
  @ChildOutlet(new Vector3(-0.5, 0, 1)) public token2?: Card2;
  @ChildOutlet public subCard?: Card;

  @Ordered(new Vector3(0.5, 0, 0))
  public tokenList = new OrderedOutlet();
  @Ordered(new Vector3(-0.5, 0, 0))
  public tokenList2 = new OrderedOutlet("tokenList2", this);

  public override render(spec: ChitRenderSpec): void {
    const ts = new TestStack().set((obj) => {
      obj.subTitle = "This is a ...";
      obj.title = this.something.toString();
      obj.subTitle2 = this.something;
    });

    spec.object = new CardMesh(1, 2, ts.material, new MeshPhongMaterial({ color: 0xff0000 }), {
      castShadow: true,
      receiveShadow: true,
    });

    spec.rotateZ = this.tapped ? Math.PI / 2 : 0; // (this.something / 90) % (Math.PI * 2);
    spec.rotateY = this.flipped ? Math.PI : 0;
    spec.offsetZ = this.flipped ? 0.1 : 0;
    // spec.offsetX = this.x * 1.25;
    // spec.offsetY = this.y * 2.5;
    // spec.offsetZ = this.tapped ? 0.25 : 0 + (this.flipped ? 3.1 : 0);
    spec.zLiftRotationMultiplier = 3;

    if (this.parent instanceof Deck) {
      spec.rotateX += Math.PI;
    } else if (this.parent instanceof Hand) {
      spec.splay.enabled = true;
      spec.splay.rows = 1;
      spec.splay.columns = 10;
      spec.splay.itemWidth = 0.2;
      spec.rotateY = 0.08;
      spec.galleryRotateZ = (2 * Math.PI * (this.parentOutletIndex ?? 0)) / 10;
      spec.splay.columnOrientation = "increasing";
      spec.splay.zPerIndexMultiplier = 0.01;
    } else {
      spec.splay.enabled = true;
      spec.splay.rows = 3;
      spec.splay.columns = 3;
    }

    // make sure it reports it out?
    spec.setOutletPositionFromCanvas(ts);
  }
}

export class Card2 extends Chit {
  public something: number = 2;
  public thingy = false;

  @ChildOutlet
  public card3 = new Card3();

  public override render(spec: ChitRenderSpec): void {
    const boxGeometry = new BoxGeometry(0.25, 0.25, 0.25);

    const ts = new TestStack2();
    ts.subTitle = "yo ho ho";
    ts.title = "and a bottle" + this.something * 2;

    const side = new MeshPhongMaterial({
      color: 0x999999,
    });

    const mesh = new Mesh(boxGeometry, [
      side,
      side,
      side,
      side,
      // new MeshPhongMaterial({
      //   bumpMap: ts.get().texture,
      //   bumpScale: 1,
      //   map: ts.get().texture,
      // }),
      StaticImage.material(cityscape),
      side,
    ]);
    mesh.castShadow = true;
    spec.object = mesh;

    spec.ownerOrigin = this.thingy ? OwnerOriginPosition.BottomRight : OwnerOriginPosition.Default;
    // spec.offsetX = !this.thingy ? 0.6 : 0;

    // spec.rotateZ = Math.PI / 2.5 + (this.something / 360) * (Math.PI * 2) + (this.thingy ? Math.PI : 0);

    spec.splay.enabled = true;
    spec.splay.rows = 5;
    spec.splay.columnOrientation = "increasing";
    spec.splay.rowOrientation = "decreasing";
    spec.splay.columns = 3;
    spec.splay.spacingMultiplier = 1;
  }
}
export class Card3 extends Chit {
  public something: number = 2;
  public thingy = false;

  public override render(spec: ChitRenderSpec): void {
    const boxGeometry = new BoxGeometry(0.25, 0.25, 0.25);

    const ts = new TestStack2();
    ts.subTitle = "yo ho ho";
    ts.title = "and a bottle" + this.something * 2;

    const side = new MeshPhongMaterial({
      color: 0x999999,
    });

    const mesh = new Mesh(boxGeometry, [
      side,
      side,
      side,
      side,
      // new MeshPhongMaterial({
      //   bumpMap: ts.get().texture,
      //   bumpScale: 1,
      //   map: ts.get().texture,
      // }),
      StaticImage.material(cityscape),
      side,
    ]);
    mesh.castShadow = true;
    spec.object = mesh;

    spec.ownerOrigin = this.thingy ? OwnerOriginPosition.BottomRight : OwnerOriginPosition.Default;
    // spec.offsetX = !this.thingy ? 0.6 : 0;

    // spec.rotateZ = Math.PI / 2.5 + (this.something / 360) * (Math.PI * 2) + (this.thingy ? Math.PI : 0);

    spec.splay.enabled = true;
    spec.splay.rows = 5;
    spec.splay.columnOrientation = "increasing";
    spec.splay.rowOrientation = "decreasing";
    spec.splay.columns = 3;
    spec.splay.spacingMultiplier = 1;
  }
}

export class CounterChit extends SparkChit {
  public get headerIcon() {
    return cityscape2;
  }
}
export class BagChit extends BagSparkChit<Card2> {
  public get icon() {
    return cityscape;
  }
}

export class SideBoards extends PanelChit {
  @ChildOutlet public sideBoard1 = new Table();
  @ChildOutlet public sideBoard2 = new Table();

  override getLayout(width: number, height: number) {
    if (height > width) {
      return [
        {
          height: 2,
          contents: this.sideBoard1,
        },
        {
          height: 1,
          contents: this.sideBoard2,
        },
      ];
    } else {
      return [
        {
          width: 1,
          contents: [this.sideBoard1, this.sideBoard2],
        },
      ];
    }
  }
}

export class MyPlayer extends PlayerChit {
  // @ChildOutlet public token = new Card2();
  @ChildOutlet public counter = new CounterChit().set((c) => c.bindToPlayer(this));
  @ChildOutlet public counter2 = new BagChit().set((c) => (c.color = "#ca5275"));
  @ChildOutlet(new Vector3(-4, 4, 0)) public hand = new Hand();

  override getSparks(): SparkChit[] {
    return [this.counter, this.counter2];
  }
}

export class Root extends RootChit<MyPlayer> {
  @ChildOutlet public mainBoard = new Table();
  @ChildOutlet public playerAid = new PlayerAid();

  override getDropdowns(): DropdownChit[] {
    return [this.playerAid];
  }

  override getLayout(width: number, height: number) {
    if (height > width) {
      return [
        {
          height: 2,
          contents: this.mainBoard,
        },
        width > this.players.length * 200
          ? {
              height: 1,
              contents: this.players.map((p) => ({
                contents: p,
                width: 1,
              })),
            }
          : { height: 1, contents: this.players.map((p) => p) },
      ];
    } else {
      return [
        {
          height: 1,
          contents: [
            {
              width: 2,
              contents: this.mainBoard,
            },

            height > this.players.length * 200
              ? {
                  width: 1,
                  contents: this.players.map((p) => ({
                    contents: p,
                    height: 1,
                  })),
                }
              : { width: 1, contents: this.players.map((p) => p) },
          ],
        },
      ];
    }
  }
}
