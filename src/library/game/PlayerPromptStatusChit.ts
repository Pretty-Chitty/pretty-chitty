import { NonEditable } from "../utilities/Annotations";
import { EventChannel } from "../utilities/EventChannel";
import { Chit } from "./Chit";
import { Prompt } from "./Prompt";
import StaticChitTypeRegistry from "./StaticChitTypeRegistry";

export class PlayerPromptStatusChit extends Chit {
  /** @internal */
  public latestPromptMessage?: string;
  /** @internal */
  @NonEditable public latestPrompt = new EventChannel<Prompt | undefined>(undefined, 50);
  /** @internal */
  @NonEditable public latestPromptResponseTime = 0;

  public canRender(): boolean {
    return false;
  }
}

StaticChitTypeRegistry["PlayerPromptStatusChit"] = PlayerPromptStatusChit;
