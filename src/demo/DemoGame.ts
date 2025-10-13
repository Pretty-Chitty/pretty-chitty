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
import {
  BagChit,
  Card,
  Card2,
  Card3,
  CounterChit,
  Deck,
  Hand,
  Bag,
  MyPlayer,
  Root,
  Row,
  SideBoards,
  Table,
} from "./ChitLibrary";
import * as CanvasLibrary from "./CanvasLibrary";
import { PlayerAid } from "./PlayerAid";
import { table } from "./assets/environment";

const theme = GameTheme.withDefaults("#003344", "#ef8354", "#ffeedd");
theme.dialogBackgroundColor = "#ef8354cc";
theme.dialogForegroundColor = "#000000ee";
theme.chitHighlightColor = "#ffffff";
theme.chitOutlineDownsample = 1;
theme.chitOutlineWidth = 3;
theme.chitOutlineStrength = 1;

export class DemoGame implements Game<MyPlayer, Root> {
  name = "Demo Game";

  showGrid = true;
  chitLibrary = {
    Card3,
    Card,
    Card2,
    Table,
    Bag,
    SideBoards,
    Root,
    Deck,
    MyPlayer,
    PlayerAid,
    CounterChit,
    BagChit,
    Row,
    Hand,
  };
  canvasLibrary = CanvasLibrary;
  buttonLibrary = { FlipButton, PassButton, HandButton };

  theme = theme;

  async run(players: MyPlayer[], setup: Turn<any, MyPlayer, Root>, rootChit: Root) {
    players[0].color = "#ed00cb";
    players[1].color = "#00edcb";
    players[2].color = "#002244";

    const W = 10;
    const H = 10;

    // set up the board
    // const rows = [...new Array(H)].map(() =>
    //   new Row().set((row) => {
    //     rootChit.mainBoard.add(row);
    //   }),
    // );

    const b = new Bag();
    rootChit.mainBoard.add(b);

    const pieces = [...new Array(W * H)].map((d, i) =>
      new Card().set((c) => {
        c.something = i;
        c.x = Math.floor(i / H);
        c.y = i % H;
        rootChit.mainBoard.add(c);

        c.token2 = new Card2();
        // c.add(new Card2(), "testoutlet");
        c.add(new Card3(), "testoutlet2");
        // c.add(new Card(), "testoutlet3");
      }),
    );
    setup.flush();

    // for (let i = 0; i < 3000; i++) {
    //   for (let c = 0; c < 6; c++) {
    //     const index = Math.floor((await setup.rng()) * 3) - 1;
    //     const pieceIndex = Math.floor((await setup.rng()) * pieces.length);
    //     pieces[pieceIndex].something = i * c;
    //     if (index === -1) {
    //       rootChit.mainBoard.add(pieces[pieceIndex]);
    //       pieces[pieceIndex].raised = !pieces[pieceIndex].raised;
    //     } else {
    //       players[index].add(pieces[pieceIndex]);
    //     }
    //   }
    //   setup.flush();
    // }

    // players[2].add(pieces[2]);
    // setup.flush();

    // players[0].add(pieces[3]);
    // setup.flush();

    // pieces[0].add(b.draw());
    // setup.flush();
    pieces[1].add(b.draw());
    setup.flush();
    // pieces[2].add(new Card2());
    // setup.flush();

    await setup.createTurn([rootChit], players[2], async (turn) => {
      // const c = new Card();
      // rootChit.mainBoard.add(c);
      // turn.flush();
      // c.removeFromParent();
      // turn.flush();
      // pieces[2].removeFromParent();
      // turn.flush();
      // pieces[4].removeFromParent();
      // turn.flush();
      // pieces[6].removeFromParent();
      // turn.flush();

      await turn.pick(
        Chit.pick([pieces[3], pieces[1]], async (c: Card) => {
          // const target = players[0];
          // target.add(c);
          // c.raised = true;
          c.something = 9999;
          players[0].add(c);

          if (c === pieces[1]) {
            await turn.pick([
              Chit.pick(pieces, async (c2: Card) => {
                c2.something = 8888;
                players[0].add(c2);
              }).message(
                "pick a second piece to take, or if you don't want to, then don't.  it's totally up to you, you can do whatever you want.  I don't really care.  I bet you wish i did, but i don't",
              ),
              Chit.pick([pieces[0].token2], async (c2: Card2) => {
                c2.something = 7777;
                players[0].add(c2);
              }).message("third thing that causes it to go to another line"),
            ]);
          }
        })
          .message("pick a piece to take")
          // .toggleButton(new HandButton())
          .context(pieces[7]),
      );
    });

    pieces[3].removeFromParent();
    setup.flush();

    await setup.createTurn([rootChit], players[0], async (turn) => {
      await turn.pick(
        Chit.pick([pieces[1], pieces[0]], async (c: Card) => {
          c.raised = true;
          // const target = players[Math.floor((await turn.rng()) * players.length)];
          // target.add(c);
        }),
      );
      await turn.noValidMoves("You did thing", "bad thing");
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
    spec.camera.targetFov = 45;
    spec.camera.paddingRight = 0;
    spec.camera.paddingTop = 0;
    spec.camera.paddingBottom = 0;
    spec.camera.paddingLeft = 0;

    spec.lightSpec = LightSpec.realistic();
  }
}
