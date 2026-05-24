import React from "react";
import { PlayerChit } from "../../game/PlayerChit";
import { ParameterizedCanvas } from "../ParameterizedCanvas";
import { Player } from "./ReactCanvas";

export class PlayerCanvas extends ParameterizedCanvas {
  width = 50;
  height = 50;

  constructor(
    private player: PlayerChit,
    private colorBlend?: number,
  ) {
    super();
  }

  protected render() {
    return <Player player={this.player} colorBlend={this.colorBlend} />;
  }
}
