import { EventChannel } from "../../utilities/EventChannel";
import { ClockDetails } from "../ClockDetails";
import { Connection } from "../Connection";
import { ConnectionObject } from "../ConnectionObject";
import { PlayerChit } from "../PlayerChit";
import { Prompt, PromptSerialization } from "../Prompt";
import { RootChit } from "../RootChit";
import { ServerPrompts } from "../serverTransport/ServerPrompts";
import { ClientTime } from "./ClientTime";

export class ClientPrompts<P extends PlayerChit, R extends RootChit<P>> extends ConnectionObject {
  private waitingPrompts: { [playerId: string]: EventChannel<PromptSerialization | undefined> } = {};
  private serverPrompts: ServerPrompts<P, R>;
  public currentPrompt = new EventChannel<Prompt | undefined>(undefined);

  private _currentPromptSpec?: PromptSerialization;

  constructor(
    private playerId: string,
    private connection: Connection,
    private clientTime: ClientTime,
  ) {
    super();

    this.serverPrompts = connection.get<ServerPrompts<P, R>>("ServerPrompts");
    this.register(this.clientTime.currentClock.on(this.checkIfPromptCanBeInflated.bind(this)));
    this.register(this.clientTime.maxClock.on(this.checkIfPromptCanBeInflated.bind(this)));
    this.register(this.clientTime.clientTimeState.live.on(this.checkIfPromptCanBeInflated.bind(this)));
    this.register(this.clientTime.clientTimeState.isWaitingOnAnimations.on(this.checkIfPromptCanBeInflated.bind(this)));
    this.register(this.getPromptEventChannelForPlayer(this.playerId).on(this.checkIfPromptCanBeInflated.bind(this)));
  }

  private checkIfPromptCanBeInflated() {
    const isLive = this.clientTime.clientTimeState.live.value;
    const currentTime = this.clientTime.currentClock.value.clock;
    const maxTime = this.clientTime.maxClock.value.clock;
    const isWaitingOnAnimations = this.clientTime.clientTimeState.isWaitingOnAnimations.value;
    const promptSpec = this.getPromptEventChannelForPlayer(this.playerId).value;

    if (isLive && promptSpec && promptSpec == this._currentPromptSpec) {
      // do nothing - we have already inflated our prompt and it is still the correct prompt.  as long as we are "live" there is no
      // need to deflate it
    } else if (isLive && promptSpec && currentTime === maxTime && currentTime > 0 && !isWaitingOnAnimations) {
      if (this.currentPrompt.value) {
        this.currentPrompt.value.stageOut();
      }

      this._currentPromptSpec = promptSpec;
      const prompt = Prompt.deserialize(promptSpec, this.clientTime.findChit, this.clientTime.game.buttonLibrary);
      prompt.onResolve(async (success) => {
        if (success) {
          const newPromptSpec = await this.serverPrompts.resolvePrompt(prompt.response);
          this.getPromptEventChannelForPlayer(this.playerId).value = newPromptSpec ?? undefined;
        } else if (prompt.shouldStepBack) {
          this.getPromptEventChannelForPlayer(this.playerId).value = undefined;
          this.serverPrompts.stepBackPrompt(prompt.shouldReset ?? false);
        }
      });
      prompt.stageIn();

      this.currentPrompt.value = prompt;
    } else {
      this._currentPromptSpec = undefined;
      if (this.currentPrompt.value) {
        this.currentPrompt.value.stageOut();
      }
      this.currentPrompt.value = undefined;
    }
  }

  public async setPromptForPlayer(playerId: string, prompt?: PromptSerialization, clockDetails?: ClockDetails) {
    if (clockDetails) {
      this.clientTime.newMaxClock(clockDetails);
    }
    this.getPromptEventChannelForPlayer(playerId).value = prompt;
  }

  public getPromptEventChannelForPlayer(playerId: string) {
    let p = this.waitingPrompts[playerId];
    if (!p) {
      p = this.waitingPrompts[playerId] = new EventChannel<PromptSerialization | undefined>(undefined);
    }
    return p;
  }
}
