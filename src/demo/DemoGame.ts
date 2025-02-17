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

import { FlipButton } from "./ButtonLibrary";
import { BagChit, Card, Card2, CounterChit, Deck, MyPlayer, Root, Row, SideBoards, Table } from "./ChitLibrary";
import * as CanvasLibrary from "./CanvasLibrary";
import { PlayerAid } from "./PlayerAid";
import { table } from "./assets/environment";

export class DemoGame implements Game<MyPlayer, Root> {
  name = "Demo Game";

  chitLibrary = { Card, Card2, Table, SideBoards, Root, Deck, MyPlayer, PlayerAid, CounterChit, BagChit, Row };
  canvasLibrary = CanvasLibrary;
  buttonLibrary = { FlipButton };

  theme = GameTheme.withDefaults("#2d3142", "#ef8354");

  async run(players: MyPlayer[], setup: Turn<any, MyPlayer, Root>, rootChit: Root) {
    players[0].color = "#ed00cb";
    players[1].color = "#00edcb";

    const W = 3;
    const H = 3;
    const rng2 = await setup.takeRng(W * H);
    const pieces2 = [...new Array(W * H)].map((d, i) =>
      new Card().set((c) => {
        c.x = Math.floor(i / H);
        c.y = i % H;
        const target = players[Math.floor(rng2() * players.length)];
        target.add(c);
      }),
    );

    const offscreenDeck = new Deck().set((c) => {
      rootChit.add(c);
    });
    offscreenDeck.discard(new Card());

    const deck = new Deck().set((c) => {
      rootChit.mainBoard.add(c);
    });

    const count = 5;
    const rng3 = await setup.takeRng(count);
    for (let i = 0; i < count; i++) {
      deck.discard(
        new Card().set((c) => {
          c.something = 2.5 + rng3();
        }),
      );
    }

    // set up the board
    const rows = [...new Array(H)].map(() =>
      new Row().set((row) => {
        rootChit.mainBoard.add(row);
      }),
    );

    const pieces = [...new Array(W * H)].map((d, i) =>
      new Card().set((c) => {
        c.x = Math.floor(i / H);
        c.y = i % H;
        rows[c.y].add(c);
      }),
    );
    setup.flush();

    // should animate to offscreen location
    offscreenDeck.discard(pieces[3]);
    setup.flush();

    // set up a goofy chit
    const rng = await setup.takeRng(2);
    const index = 1; //Math.floor(rng() * pieces.length);
    const c2 = new Card2().set((c) => {
      pieces[index].tokenList.add(c);
      setup.flush();
    });

    // await setup.createTurn([rootChit], players[0], async (turn) => {
    //   await turn.select(pieces);
    // });

    const c3 = new Card2().set((c) => {
      pieces[Math.floor(rng() * pieces.length)].add(c);
    });

    pieces[index].tokenList2.add(c2);
    setup.flush();
    pieces[index].tokenList.add(c2);
    setup.flush();
    pieces[index].tokenList2.add(c2);
    pieces[index].tokenList2.add(c3);
    setup.flush();
    for (let i = 0; i < 30; i++) {
      pieces[index].tokenList2.add(new Card2());
      setup.flush();
    }

    // now do 100 turns
    for (let i = 0; i < 5; i++) {
      rootChit.playerAid.turnCount++;
      players[0].counter.value += Math.round((await setup.rng()) * 10);
      // alternating players
      await setup.createTurn(
        [...pieces, ...pieces2, ...rows, deck, c3, ...players.map((p) => p.counter), ...players.map((p) => p.counter2)],
        players[i % 2],
        async (turn) => {
          let lastPiece: Card | undefined;

          const player = players[i % 2];
          const counter = (await turn.rng()) * 3 + 3;

          for (let i = 0; i < counter; i++) {
            await turn.pick([
              Chit.pick(pieces, async (chit) => {
                if (!chit.subCard) {
                  chit.tapped = true;
                  const drawn = await deck.draw();

                  if (drawn) {
                    chit.subCard = drawn;
                  }
                  chit.tapped = false;
                } else {
                  deck.discard(chit.subCard);
                }

                chit.token = c2;
                lastPiece = chit;
              })
                .focus(player)
                .message("pick a card")
                .help(
                  "Pick a card.  If it already has a card on it, it'll go back to the deck.  Otherwise, it'll draw a card from the deck and put it on top of this card",
                ),
              Chit.pick(pieces2, (chit) => {
                chit.token = c2;
                chit.flipped = !chit.flipped;
              })
                .message("bring home")
                .help("Bring one back to your home territory and flip it"),
              lastPiece &&
                new FlipButton(async () => {
                  if (lastPiece) {
                    lastPiece.flipped = !lastPiece.flipped;
                    c2.something = (await turn.rng()) * 10;

                    const target = players[i % 2].counter2;
                    target.add(c3);
                  }
                }).config({ flipped: lastPiece?.flipped ?? true }),
            ]);
          }
        },
      );
    }

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
