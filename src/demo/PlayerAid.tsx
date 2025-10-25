import React from "react";
import { DropdownChit } from "../library";
import { Box } from "@mui/material";

export class PlayerAid extends DropdownChit {
  public turnCount = 0;

  renderLabel() {
    return `Current turn: ${this.turnCount} And a thing that is long`;
  }
  renderBody() {
    return <Box>This is a box</Box>;
  }
}
