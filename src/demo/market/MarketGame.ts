import { Mesh, MeshPhongMaterial, PlaneGeometry } from "three";
import {
  Chit,
  DragTarget,
  Game,
  GameButton,
  GameMetaData,
  GameTheme,
  LightSpec,
  StaticImage,
  ToggleGalleryButton,
  Turn,
} from "../../library";
import { Storefront } from "@mui/icons-material";
import { CameraSpec, ChitRenderSpec } from "../../library";
import { table } from "../assets/environment";
import { Card, CardFace, CoinSpark, Deck, Market, Player, Root, SUITS, SUIT_IMAGES, ScoreSpark, Table, Tableau } from "./chits";
import { marketAi } from "./ai";
import { marketTutorials } from "./tutorial";

export class PassButton extends GameButton {
  public label = "Pass";
}

/** Opens the market as a gallery: the cards up close, and the place to buy them on a phone */
export class MarketButton extends ToggleGalleryButton {
  public label = "Market";
  public icon = Storefront as any;
  override toggleSmallSize = 140;
  override autoShow = false;
}

const theme = GameTheme.withDefaults("#1f3a4d", "#ffcc66", "#fff4e0");
theme.chitHighlightColor = "#ffffff";
theme.chitOutlineStrength = 0.9;
theme.galleryItemWidth = 90;
theme.galleryItemHeight = 126;

/**
 * Petty Market: a small, complete card game that exists to exercise the engine's tutorial system.
 * Each turn: buy a market card (pay its value in coins), play a card from your hand to your tableau
 * (score its value; coin cards also earn a coin), or pass to earn 2 coins. Most points after the
 * last round wins.
 */
export class MarketGame implements Game<Player, Root> {
  metadata: GameMetaData = {
    name: "Petty Market",
    description: "A tiny buy-and-play card game, with scripted tutorials",
    boxArt: "",
    screenshot: "",
  };

  chitLibrary = { Root, Player, Table, Market, Tableau, Deck, Card, CoinSpark, ScoreSpark };
  canvasLibrary = { CardFace };
  buttonLibrary = { PassButton, MarketButton };
  theme = theme;
  ai = marketAi;
  tutorials = marketTutorials;

  tokenMap = {
    coin: { label: "Coin", color: "#d9a53a", image: SUIT_IMAGES.coin },
    gem: { label: "Gem", color: "#2fb3a6", image: SUIT_IMAGES.gem },
    star: { label: "Star", color: "#d14f9a", image: SUIT_IMAGES.star },
  };

  async run(setup: Turn<any, Player, Root>, root: Root) {
    const players = root.players.copy();
    const colors = ["#e07a5f", "#3d9bd1", "#81b29a", "#f2cc8f"];
    players.forEach((p, i) => (p.color = colors[i % colors.length]));

    // Build the deck in a fixed order; randomness comes from the draws (see tutorial.ts for how a
    // tutorial pins them).
    const deck = root.table.deck;
    const cards: Card[] = [];
    SUITS.forEach((suit) => {
      for (let value = 1; value <= 5; value++) {
        for (let copy = 0; copy < 2; copy++) {
          const card = new Card();
          card.suit = suit;
          card.value = value;
          cards.push(card);
        }
      }
    });
    deck.discard(cards);
    deck.shuffle();

    for (const p of players) {
      p.coins.value = 3;
      p.score.value = 0;
      for (let i = 0; i < 2; i++) {
        const card = await deck.draw();
        if (card) p.hand.add(card);
      }
    }
    for (let i = 0; i < 4; i++) {
      const card = await deck.draw();
      if (card) root.table.market.cards.add(card);
    }
    setup.flush();
    setup.log("The market is open! Everyone starts with 2 cards and 3 :coin:.");

    const rounds = parseInt(root.rounds, 10);
    for (let round = 1; round <= rounds; round++) {
      setup.log(`Round ${round} of ${rounds}`);
      for (const me of players) {
        await setup.createTurn([root], me, async (turn) => {
          await this.takeTurn(turn, root, me);
        });
      }
    }

    const best = Math.max(...players.map((p) => p.score.value));
    setup.log(`Game over! Best score: ${best}`);
    return { winners: players.filter((p) => p.score.value === best) };
  }

  private async takeTurn(turn: Turn<any, Player, Root>, root: Root, me: Player) {
    const market = root.table.market;
    const affordable = market.cards.filter((c) => c.cost <= me.coins.value);

    await turn.pick([
      Chit.pick(affordable, async (card: Card) => {
        me.coins.value -= card.cost;
        me.hand.add(card);
        turn.log(`${me.logKey} buys :${card.suit}: ${card.value} for ${card.cost} :coin:`);
        const refill = await root.table.deck.draw();
        if (refill) {
          market.cards.add(refill);
          turn.log(`A new card joins the market: :${refill.suit}: ${refill.value}`);
        }
      })
        .message("buy a card from the market")
        .help("Tap a market card you can afford. Its cost is its value in coins.")
        .focus()
        .toggleButton(new MarketButton().setParentChit(market))
        .ai("market.buy"),

      Chit.dragPick(
        me.hand.copy(),
        DragTarget.from([me.tableau], async (card: Card, tableau: Tableau) => {
          tableau.cards.add(card);
          me.score.value += card.value;
          if (card.suit === "coin") {
            me.coins.value += 1;
          }
          turn.log(
            `${me.logKey} plays :${card.suit}: ${card.value} and scores ${card.value}${card.suit === "coin" ? " (+1 :coin:)" : ""}`,
          );
        }),
      )
        .message("play a card from your hand")
        .help("Drag a card from your hand onto your tableau to score its value.")
        .focus()
        .ai("hand.play"),

      new PassButton(() => {
        me.coins.value += 2;
        turn.log(`${me.logKey} passes and earns 2 :coin:`);
      })
        .pick()
        .message("pass to earn 2 coins")
        .ai("turn.pass"),
    ]);
  }

  renderDefaultRootChit(spec: ChitRenderSpec): void {
    const m = new Mesh(
      new PlaneGeometry(100, 100),
      new MeshPhongMaterial({ map: StaticImage.texture(table, { rx: 25, ry: 25 }) }),
    );
    m.position.z = -0.02;
    m.receiveShadow = true;
    spec.ornaments.push(m);

    spec.camera = new CameraSpec();
    spec.camera.targetFov = 40;
    spec.camera.paddingLeft = 10;
    spec.camera.paddingRight = 10;
    spec.camera.paddingTop = 10;
    spec.camera.paddingBottom = 10;
    spec.lightSpec = LightSpec.realistic();
  }
}
