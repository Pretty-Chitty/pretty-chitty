import React from "react";
import { BoxGeometry, Mesh, MeshPhongMaterial } from "three";
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
} from "../library";

import { TestStack } from "./TestStack";
import { TestStack2 } from "./TestStack2";
import { PlayerAid } from "./PlayerAid";
import { QuestionMark, SmsFailed } from "@mui/icons-material";
import { cityscape, cityscape2 } from "./assets/network_overload";

export * from "../library/utilities/BaseTable";

export class Table extends Chit {}

export class Row extends Chit {}

export class Deck extends GameDeck<Card> {
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
    spec.object.castShadow = true;
    // spec.rotateX = Math.PI;
    // spec.offsetZ = 1;
  }
}

export class Card extends Chit {
  public something: number = 2;
  public tapped: boolean = false;
  public flipped: boolean = false;
  public x = 0;
  public y = 0;

  @ChildOutlet public token?: Card2;
  @ChildOutlet public token2?: Card2;
  @ChildOutlet public subCard?: Card;

  public override render(spec: ChitRenderSpec): void {
    const boxGeometry = new BoxGeometry(1, 2, 0.1);

    const ts = new TestStack().set((obj) => {
      obj.subTitle = "This is a ...";
      obj.title = "and a bottle" + this.something * 2;
      obj.subTitle2 = this.something;
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
    spec.object.receiveShadow = true;
    spec.object.castShadow = true;

    // if (!(this.parent instanceof Card)) {
    // spec.offsetX = this.something / 900;
    // }
    spec.rotateZ = this.tapped ? Math.PI / 2 : 0; // (this.something / 90) % (Math.PI * 2);
    spec.rotateY = this.flipped ? Math.PI : 0;
    spec.offsetZ = this.flipped ? 0.1 : 0;
    spec.offsetX = this.x * 1.25;
    spec.offsetY = this.y * 2.5;
    spec.offsetZ = this.tapped ? 0.25 : 0 + (this.flipped ? 3.1 : 0);
    spec.zLiftRotationMultiplier = 3;

    spec.setOutletPosition("token", 0.5, 0);
    spec.setOutletPosition("token2", -0.5, 0);
  }
}

export class Card2 extends Chit {
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
      new MeshPhongMaterial({
        bumpMap: ts.get().texture,
        bumpScale: 1,
        map: ts.get().texture,
      }),
      side,
    ]);
    mesh.castShadow = true;
    spec.object = mesh;

    spec.ownerOrigin = this.thingy ? OwnerOriginPosition.BottomRight : OwnerOriginPosition.Default;
    // spec.offsetX = !this.thingy ? 0.6 : 0;

    spec.rotateZ = (this.something / 360) * (Math.PI * 2) + (this.thingy ? Math.PI : 0);
  }
}

export class CounterChit extends SparkChit {
  public player: MyPlayer | undefined;

  public get icon() {
    return this.player;
  }
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
  @ChildOutlet public counter = new CounterChit().set((c) => (c.player = this));
  @ChildOutlet public counter2 = new BagChit().set((c) => (c.color = "#ca5275"));

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
        { height: 1, contents: this.players.map((p) => p) },
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
            { width: 1, contents: this.players.map((p) => p) },
          ],
        },
      ];
    }
  }
}
