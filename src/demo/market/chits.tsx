import React from "react";
import { BoxGeometry, Mesh, MeshPhongMaterial, PlaneGeometry, Vector3 } from "three";
import {
  CameraSpec,
  ChildOutlet,
  Chit,
  ChitRenderSpec,
  GameDeckChit,
  OrderedOutlet,
  Ordered,
  PlayerChit,
  RootChit,
  Selectable,
  SparkChit,
  CardMesh,
  ParameterizedCanvas,
  IconCanvas,
} from "../../library";
import type { LayoutNode } from "../../library";
import { Color, Image, Layered, Pad, RoundedRect, Text, Vertical } from "../../library/utilities/CanvasStack/ReactCanvas";
import { cityscape, metropolis, serverroom } from "../assets/network_overload";
import { tunnel, walk } from "../assets/icons";

export type Suit = "coin" | "gem" | "star";
export const SUITS: Suit[] = ["coin", "gem", "star"];
export const SUIT_COLORS: Record<Suit, string> = { coin: "#d9a53a", gem: "#2fb3a6", star: "#d14f9a" };
export const SUIT_LABELS: Record<Suit, string> = { coin: "Coin", gem: "Gem", star: "Star" };
export const SUIT_IMAGES = { coin: cityscape, gem: tunnel, star: walk };

/** The painted front of a card: suit colour, big value, suit art, cost. */
export class CardFace extends ParameterizedCanvas {
  suit: Suit = "coin";
  value = 1;
  width = 200;
  height = 280;

  render() {
    const color = SUIT_COLORS[this.suit];
    return (
      <RoundedRect radius={24}>
        <Layered>
          <Color hex={color} />
          <Pad amount={12}>
            <RoundedRect radius={16}>
              <Layered>
                <Color hex="#fff8ee" />
                <Vertical>
                  <Text size={96} fill={color} fontSize={84} fontWeight="bold" align="center">
                    {String(this.value)}
                  </Text>
                  <Pad left={50} right={50}>
                    <Image size={76} image={SUIT_IMAGES[this.suit]} />
                  </Pad>
                  <Text size={34} fill={color} fontSize={26} fontWeight="bold" align="center">
                    {SUIT_LABELS[this.suit]}
                  </Text>
                  <Text size={30} fill="#777" fontSize={18} align="center">
                    {`cost ${this.value}`}
                  </Text>
                </Vertical>
              </Layered>
            </RoundedRect>
          </Pad>
        </Layered>
      </RoundedRect>
    );
  }
}

const CARD_BACK = new MeshPhongMaterial({ color: 0x334455 });

export class Card extends Chit {
  public suit: Suit = "coin";
  public value = 1;
  /** Shows the card's back. The game never sets it; the tutorial poses it to flip cards over. */
  public faceDown = false;

  get cost() {
    return this.value;
  }

  public override render(spec: ChitRenderSpec): void {
    const face = new CardFace();
    face.suit = this.suit;
    face.value = this.value;
    spec.object = new CardMesh(1, 1.4, face.material, CARD_BACK, { castShadow: true });
    spec.highlight.color = "#ffffff";
    spec.showDetailsOnLongPress = true;
    spec.summary = `:${this.suit}: ${SUIT_LABELS[this.suit]} ${this.value} (cost ${this.cost})`;
    spec.summaryIconMap = SUIT_IMAGES;
    spec.galleryPreferredWidth = 200;
    spec.galleryPreferredHeight = 280;
    spec.offsetSpeed = 300;
    if (this.faceDown) spec.rotateY = Math.PI;

    if (this.parent instanceof Market) {
      spec.splay.enabled = true;
      spec.splay.rows = 1;
      spec.splay.columns = 6;
      spec.splay.columnOrientation = "center";
      spec.splay.spacingMultiplier = 1.15;
    } else if (this.parent instanceof Tableau) {
      spec.splay.enabled = true;
      spec.splay.rows = 2;
      spec.splay.columns = 6;
      spec.splay.columnOrientation = "increasing";
      spec.splay.rowOrientation = "decreasing";
      spec.splay.spacingMultiplier = 0.75;
      spec.offsetZ = 0.02;
    } else if (this.parent instanceof Player) {
      spec.splay.enabled = true;
      spec.splay.rows = 1;
      spec.splay.columns = 8;
      spec.splay.columnOrientation = "center";
      spec.splay.itemWidth = 0.7;
      spec.splay.zPerIndexMultiplier = 0.01;
    }
    if (this.isDropTarget) {
      spec.highlight.clickColor = "#ffee88";
    }
  }
}

class DeckLabel extends ParameterizedCanvas {
  count = 0;
  width = 200;
  height = 280;
  render() {
    return (
      <RoundedRect radius={24}>
        <Layered>
          <Image image={serverroom} fill />
          <Color hex="#00000088" />
          <Vertical>
            <Text size={120} fill="#fff" fontSize={72} fontWeight="bold" align="center">
              {String(this.count)}
            </Text>
            <Text size={40} fill="#ddd" fontSize={24} align="center">
              cards left
            </Text>
          </Vertical>
        </Layered>
      </RoundedRect>
    );
  }
}

export class Deck extends GameDeckChit<Card> {
  get remaining() {
    return this.stages.reduce((acc, s) => acc + s.chits.length, 0);
  }

  public override render(spec: ChitRenderSpec): void {
    const label = new DeckLabel();
    label.count = this.remaining;
    const side = new MeshPhongMaterial({ color: 0x223344 });
    const thickness = Math.max(0.05, this.remaining * 0.012);
    const mesh = new Mesh(new BoxGeometry(1, 1.4, thickness), [side, side, side, side, label.material, side]);
    mesh.position.z = thickness / 2;
    mesh.castShadow = true;
    spec.object = mesh;
    spec.summary = `Deck: ${this.remaining} cards`;
    spec.worthSlidingToPanelToShowChange = false;
  }
}

/** The face-up row of cards for sale. */
export class Market extends Chit {
  @Ordered(new Vector3(0, 0, 0))
  public cards = new OrderedOutlet<Card>("cards", this);
}

/** Where a player's played cards go. A visible mat, so it can be dragged onto. */
export class Tableau extends Chit {
  @Ordered(new Vector3(0, 0, 0))
  public cards = new OrderedOutlet<Card>("cards", this);

  public override render(spec: ChitRenderSpec): void {
    const mat = new Mesh(
      new PlaneGeometry(5, 3.2),
      new MeshPhongMaterial({ color: this.isDropTarget ? 0x4a6b5a : 0x2e4a3c, transparent: true, opacity: 0.85 }),
    );
    mat.receiveShadow = true;
    spec.object = mat;
    spec.highlight.color = "#ffee88";
    spec.summary = "Your tableau: played cards score here";
    spec.worthSlidingToPanelToShowChange = false;
  }
}

export class Table extends Chit {
  @ChildOutlet(new Vector3(0.6, 0, 0)) public market = new Market();
  @ChildOutlet(new Vector3(-3.8, 0, 0)) public deck = new Deck();

  public override render(spec: ChitRenderSpec): void {
    spec.worthSlidingToPanelToShowChange = false;
  }
}

export class CoinSpark extends SparkChit {
  override get endGameLabel() {
    return "Coins";
  }
  override get icon() {
    return new IconCanvas(cityscape).get();
  }
}

export class ScoreSpark extends SparkChit {
  override get endGameLabel() {
    return "Score";
  }
}

export class Player extends PlayerChit {
  @ChildOutlet public score = new ScoreSpark().set((s) => s.bindToPlayer(this));
  @ChildOutlet public coins = new CoinSpark().set((c) => (c.color = "#d9a53a"));
  @ChildOutlet(new Vector3(0, 1.3, 0)) public tableau = new Tableau();
  @Ordered(new Vector3(0, -1.2, 0))
  public hand = new OrderedOutlet<Card>("hand", this);

  override getSparks(): SparkChit[] {
    return [this.score, this.coins];
  }

  get colorBlend() {
    return 0.6;
  }

  override render(spec: ChitRenderSpec): void {
    spec.worthSlidingToPanelToShowChange = false;
    spec.camera = new CameraSpec();
  }
}

export class Root extends RootChit<Player> {
  minPlayers = 2;
  maxPlayers = 4;

  @ChildOutlet public table = new Table();

  @Selectable({
    label: "Rounds",
    choices: [
      { label: "3 rounds", id: "3" },
      { label: "5 rounds", id: "5" },
    ],
  })
  public rounds: "3" | "5" = "3";

  override setupDemoGame(): number {
    this.rounds = "3";
    return 3;
  }

  override getLayout(_width: number, _height: number, playerId: string): LayoutNode {
    const others = this.players.filter((p) => p.id !== playerId);
    const me = this.players.find((p) => p.id === playerId);
    return {
      direction: "optimize",
      collapseOrder: 3,
      splits: [
        { chit: this.table, minWidth: 300, minHeight: 180 },
        {
          direction: "optimizePreferVertical",
          collapseOrder: 2,
          splits: [
            {
              direction: "optimizePreferHorizontal",
              collapseOrder: 1,
              splits: others.map((player) => ({ chit: player, minWidth: 220, minHeight: 180 })),
            },
            ...(me ? [{ chit: me, minWidth: 260, minHeight: 200 }] : []),
          ],
        },
      ],
    };
  }
}

export { metropolis as marketBackground };
