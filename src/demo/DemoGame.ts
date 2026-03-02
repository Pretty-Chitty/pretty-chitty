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
  GameMetaData,
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
  Player,
  Root,
  Row,
  SideBoards,
  Table,
} from "./ChitLibrary";
import * as CanvasLibrary from "./CanvasLibrary";
import { PlayerAid } from "./PlayerAid";
import { table } from "./assets/environment";
import { cityscape } from "./assets/network_overload";
import { Bookshelf, ShelfRow, ShelfSpace } from "./Bookshelft";
import { DragTarget } from "../library/game/Pick";

const theme = GameTheme.withDefaults("#003344", "#ef8354", "#ffeedd");
theme.dialogBackgroundColor = "#ef8354cc";
theme.dialogForegroundColor = "#000000ee";
theme.chitHighlightColor = "#ffffff";
theme.gallerySummaryBackgroundColor = "#ff0000";
theme.dialogForegroundColor = "#ffffff";
// theme.chitOutlineStrength = 0.5;
theme.chitOutlineStrength = 0.9;
theme.chitOutlineWidth = 3;

theme.galleryItemWidth = 50;
theme.galleryItemHeight = 50;
theme.galleryItemSpacing = 10;
// theme.fontScalar = 2;
// theme.bottomBarFontFamily = "monospace";
// theme.fontFamily = "monospace";

export class DemoGame implements Game<Player, Root> {
  metadata: GameMetaData = {
    name: "Demo Game",
    description: "A demo game to showcase Pretty Chitty features",
    boxArt: "",
    screenshot: "",
  };

  chitLibrary = {
    Card3,
    Card,
    Card2,
    Table,
    Bag,
    SideBoards,
    ShelfRow,
    ShelfSpace,
    Root,
    Deck,
    Player,
    PlayerAid,
    CounterChit,
    BagChit,
    Bookshelf,
    Row,
    Hand,
  };
  canvasLibrary = CanvasLibrary;
  buttonLibrary = { FlipButton, PassButton, HandButton };

  theme = theme;

  tokenMap = {
    thingy2: { image: cityscape },
    thingy: { label: "Thingy", color: "#ff00ff", image: cityscape },
    stuff: { label: "Stuff", color: "#00ffff" },
  };

  async run(setup: Turn<any, Player, Root>, rootChit: Root) {
    const players = rootChit.players.copy();
    const color = ["#ed00cb", "#00edcb", "#002244"];
    for (let i = 0; i < players.length; i++) {
      players[i].color = color[i % color.length];
    }

    const W = rootChit.size === "large" ? 10 : rootChit.size === "medium" ? 7 : 5;
    const H = W;

    // set up the board
    // const rows = [...new Array(H)].map(() =>
    //   new Row().set((row) => {
    //     rootChit.mainBoard.add(row);
    //   }),
    // );

    const b = new Bag();
    rootChit.shelf.setup();
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
        // setup.flush();
        // setup.log(
        //   i % 2 === 0 ? `Created a card, ${c.id} :stuff: that is :thingy:` : `Created a card, ${c.id} :thingy2:`,
        // );
        players[i % players.length].counter.value += (c.parentOutletIndex ?? 0) % 2 === 0 ? 1 : i % players.length;
        // c.add(new Card(), "testoutlet3");
      }),
    );
    setup.flush();
    setup.log("Cards set up!");

    for (let i = 0; i < 10; i++) {
      for (let c = 0; c < 4; c++) {
        const index = Math.floor((await setup.rng()) * 3) - 1;
        const pieceIndex = Math.floor((await setup.rng()) * pieces.length);
        pieces[pieceIndex].something = i * c;
        if (index === -1) {
          rootChit.mainBoard.add(pieces[pieceIndex]);
          pieces[pieceIndex].raised = !pieces[pieceIndex].raised;
        } else {
          players[index].add(pieces[pieceIndex]);
        }
      }
      setup.flush();
    }

    // players[2].add(pieces[2]);
    // setup.flush();

    // players[0].add(pieces[3]);
    // setup.flush();

    // pieces[0].add(b.draw());
    // setup.flush();
    pieces[1].add(b.draw());
    setup.flush();
    setup.log("Gave :p2: a card");
    // pieces[2].add(new Card2());
    // setup.flush();

    await setup.createTurn([rootChit], players[0], async (turn) => {
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

      let done = false;
      while (!done) {
        await turn.pick([
          new PassButton(() => {
            done = true;
          }).pick(),
          Chit.dragPick(pieces.slice(pieces.length - 5, pieces.length), [
            DragTarget.from(pieces, (from, to) => {
              to.add(from);
            }),
          ]).message("pick a piece to take and put in the bag"),
        ]);
        turn.zip();
      }

      await turn.pick(
        Chit.pick(pieces.slice(0, 6), async (c: Card) => {
          // const target = players[0];
          // target.add(c);
          // c.raised = true;
          // c.something = 9999;
          players[0].add(c);

          if (c === pieces[1]) {
            turn.log(":p1: chose the first card");
            await turn.pick([
              Chit.pick(pieces, async (c2: Card) => {
                c2.something = 8888;
                players[0].add(c2);

                turn.amendLog((oldLog) => oldLog + " followed by a new card");
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
          .toggleButton(new HandButton())
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
      // await turn.noValidMoves("You did thing", "bad thing");
    });

    return {
      winners: [players[0]],
    };
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
