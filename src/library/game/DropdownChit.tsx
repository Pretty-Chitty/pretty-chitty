import React, { ReactNode } from "react";
import { Chit } from "./Chit";
import TopBarDropdown from "../components/TopBarDropdown";
import { NonEditable } from "../utilities/Annotations";

export abstract class DropdownChit extends Chit {
  /** @internal */
  @NonEditable type = "dropdown";

  abstract renderLabel(playerId: string): string | ReactNode;
  abstract renderBody(playerId: string): string | ReactNode | ReactNode[];

  /** @internal */
  render() {
    return <TopBarDropdown label={this.renderLabel("")}>{this.renderBody("")}</TopBarDropdown>;
  }
}
