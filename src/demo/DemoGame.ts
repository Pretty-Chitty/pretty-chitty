import {
  Game,
  PlayerInfo,
  Chit,
  Turn,
  GameTheme,
  ChitRenderSpec,
  LightSpec,
  CameraSpec,
  StaticImage,
} from "../library";

import { Mesh, MeshPhongMaterial, PlaneGeometry } from "three";

import { FlipButton, HandButton, PassButton } from "./ButtonLibrary";
import { BagChit, Card, Card2, CounterChit, Deck, Hand, MyPlayer, Root, Row, SideBoards, Table } from "./ChitLibrary";
import * as CanvasLibrary from "./CanvasLibrary";
import { PlayerAid } from "./PlayerAid";
import { table } from "./assets/environment";

export class DemoGame implements Game<MyPlayer, Root> {
  galleryItemWidth = 150;
  galleryItemSpacing = 20;
  name = "Demo Game";

  showGrid = true;
  chitLibrary = { Card, Card2, Table, SideBoards, Root, Deck, MyPlayer, PlayerAid, CounterChit, BagChit, Row, Hand };
  canvasLibrary = CanvasLibrary;
  buttonLibrary = { FlipButton, PassButton, HandButton };

  theme = GameTheme.withDefaults("#2d3142", "#ef8354");

  async run(players: MyPlayer[], setup: Turn<any, MyPlayer, Root>, rootChit: Root) {
    players[0].color = "#ed00cb";
    players[1].color = "#00edcb";

    const W = 3;
    const H = 3;

    // set up the board
    // const rows = [...new Array(H)].map(() =>
    //   new Row().set((row) => {
    //     rootChit.mainBoard.add(row);
    //   }),
    // );

    const pieces = [...new Array(W * H)].map((d, i) =>
      new Card().set((c) => {
        c.x = Math.floor(i / H);
        c.y = i % H;
        rootChit.mainBoard.add(c);

        const c2 = new Card2();
        c.add(c2, "testoutlet");
      }),
    );
    setup.flush();

    await setup.createTurn([rootChit], players[0], async (turn) => {
      const c = new Card();
      rootChit.mainBoard.add(c);
      turn.flush();
      c.removeFromParent();
      turn.flush();
      pieces[2].removeFromParent();
      turn.flush();
      pieces[4].removeFromParent();
      turn.flush();
      pieces[6].removeFromParent();
      turn.flush();

      await turn.pick(
        Chit.pick([pieces[1], pieces[0]], (c) => {
          const target = players[Math.floor(Math.random() * players.length)];
          target.add(c);
        }),
      );
    });

    pieces[3].removeFromParent();
    setup.flush();

    await setup.createTurn([rootChit], players[0], async (turn) => {
      await turn.pick(
        Chit.pick([pieces[1], pieces[0]], (c) => {
          const target = players[Math.floor(Math.random() * players.length)];
          target.add(c);
        }),
      );
    });

    return {
      winners: [players[0]],
    };
  }

  generateRootChit() {
    return new Root();
  }

  generatePlayer(playerInfo: PlayerInfo) {
    return new MyPlayer(playerInfo);
  }

  renderDefaultRootChit(spec: ChitRenderSpec): void {
    const scale = { rx: 25, ry: 25 };
    const m = new Mesh(
      new PlaneGeometry(100, 100),
      new MeshPhongMaterial({
        map: StaticImage.texture(table, scale),
      }),
    );
    m.position.z = -0.02;
    spec.ornaments.push(m);

    spec.camera = new CameraSpec();
    spec.camera.padding = 0.1;
    spec.camera.targetFov = 45;

    spec.lightSpec = LightSpec.realistic();
  }
}
