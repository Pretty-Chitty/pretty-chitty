import React from "react";
import { DropdownChit } from "../library";
import { Box } from "@mui/material";

export class PlayerAid extends DropdownChit {
  public turnCount = 0;

  renderLabel() {
    return `Current turn: ${this.turnCount}`;
  }
  renderBody() {
    return <Box>This is a box</Box>;
  }
}
