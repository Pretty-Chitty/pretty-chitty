import React from "react";
import { GameDesigner } from "./library";
import { DemoGame } from "./demo/DemoGame";

export default function Root() {
  return <GameDesigner game={new DemoGame()} />;
}
