import { NonEditable } from "../utilities/Annotations";
import { EventChannel } from "../utilities/EventChannel";
import { Chit } from "./Chit";
import { Prompt } from "./Prompt";
import StaticChitTypeRegistry from "./StaticChitTypeRegistry";

export class PlayerPromptStatus extends Chit {
  public $internal_latestPromptMessage?: string;
  @NonEditable public $internal_latestPrompt = new EventChannel<Prompt | undefined>(undefined, 50);
  @NonEditable public $internal_latestPromptResponseTime = 0;

  public canRender(): boolean {
    return false;
  }
}

StaticChitTypeRegistry["PlayerPromptStatus"] = PlayerPromptStatus;
