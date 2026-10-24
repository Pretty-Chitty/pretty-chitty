import { NonEditable } from "../utilities/Annotations";
import { EventChannel } from "../utilities/EventChannel";
import { Chit } from "./Chit";
import { Prompt } from "./Prompt";
import StaticChitTypeRegistry from "./StaticChitTypeRegistry";

export class PlayerPromptStatusChit extends Chit {
  /** The prompt the player is currently being asked to answer, with `:token:` markup intact. @internal */
  public latestPromptMessage?: string;
  /** Plain-text form of {@link latestPromptMessage} for storage, match lists and notifications. @internal */
  public latestPromptMessageText?: string;
  /** @internal */
  @NonEditable public latestPrompt = new EventChannel<Prompt | undefined>(undefined, 50);
  /** @internal */
  @NonEditable public latestPromptResponseTime = 0;

  public canRender(): boolean {
    return false;
  }
}

StaticChitTypeRegistry["PlayerPromptStatusChit"] = PlayerPromptStatusChit;
