import React from "react";
import { GameDesigner } from "./library";
import { DemoGame } from "./demo/DemoGame";
import { MarketGame } from "./demo/market/MarketGame";

/** `?game=legacy` opens the old feature-showcase demo; the default is Petty Market, which has tutorials. */
export default function Root() {
  const params = new URLSearchParams(window.location.search);
  const game = params.get("game") === "legacy" ? new DemoGame() : new MarketGame();
  return <GameDesigner game={game} />;
}
