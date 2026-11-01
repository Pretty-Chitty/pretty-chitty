import { defineAi } from "../../library";
import { Card, Player, Root } from "./chits";

/** Bots for Petty Market: buy cheap value, play what scores, pass when broke. */
export const marketAi = defineAi<Player, Root>({
  rules: {
    "market.buy": (opt, { me }) => {
      if (opt.kind !== "chit") return 0;
      const card = opt.chit as Card;
      if (card.cost > me.coins.value) return -Infinity;
      return card.value - card.cost * 0.4 + (card.suit === "coin" ? 0.5 : 0);
    },
    "hand.play": (opt) => {
      if (opt.kind !== "drag") return 0;
      const card = opt.chit as Card;
      return card.value * 0.8 + (card.suit === "coin" ? 0.5 : 0);
    },
    "turn.pass": (_opt, { me, options }) => {
      const canBuy = options.some((o) => o.key === "market.buy");
      const canPlay = options.some((o) => o.key === "hand.play");
      if (!canBuy && !canPlay) return 10;
      return me.coins.value < 2 ? 2.5 : 0.5;
    },
  },
});
