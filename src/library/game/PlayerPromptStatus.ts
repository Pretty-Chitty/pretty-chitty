import { NonEditable } from "../utilities/Annotations";
import { EventChannel } from "../utilities/EventChannel";
import { Chit } from "./Chit";
import { Prompt } from "./Prompt";
import StaticChitTypeRegistry from "./StaticChitTypeRegistry";

export class PlayerPromptStatus extends Chit {
  /** @internal */
  public latestPromptMessage?: string;
  /** @internal */
  @NonEditable public latestPrompt = new EventChannel<Prompt | undefined>(undefined, 50);
  /** @internal */
  @NonEditable public latestPromptResponseTime = 0; // TODO: this is maybe not useful?  we want the latest time ignoring sibling turns

  public canRender(): boolean {
    return false;
  }
}

StaticChitTypeRegistry["PlayerPromptStatus"] = PlayerPromptStatus;
