import { NonEditable } from "../utilities/Annotations";
import { EventChannel } from "../utilities/EventChannel";
import { Chit } from "./Chit";
import { Prompt } from "./Prompt";
import StaticChitTypeRegistry from "./StaticChitTypeRegistry";

export class PlayerPromptStatus extends Chit {
  /** @internal */
  public latestPromptMessage?: string;
  /** @internal */
  public _latestPrompt = new EventChannel<Prompt | undefined>(undefined, 50);
  /** @internal */
  public _latestPromptResponseTime = 0;

  public canRender(): boolean {
    return false;
  }
}

StaticChitTypeRegistry["PlayerPromptStatus"] = PlayerPromptStatus;
