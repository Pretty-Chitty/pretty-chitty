import { EventChannel } from "../../utilities/EventChannel";
import { ClockDetails, samePasses } from "../ClockDetails";
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
    this.register(this.clientTime.activeLog.on(this.fixActiveLog.bind(this)));
    this.register(this.getPromptEventChannelForPlayer(this.playerId).on(this.checkIfPromptCanBeInflated.bind(this)));
  }

  fixActiveLog() {
    if (this.currentPrompt.value && this.clientTime.activeLog.value) {
      this.clientTime.activeLog.value = undefined;
    }
  }

  private stageInPrompt(promptSpec: PromptSerialization) {
    this._currentPromptSpec = promptSpec;
    const prompt = Prompt.deserialize(promptSpec, this.clientTime.findChit, this.clientTime.game.buttonLibrary);
    prompt.onResolve(async (success) => {
      try {
        this.fixActiveLog();
        if (success) {
          const newPromptSpec = await this.serverPrompts.resolvePrompt(prompt.id, prompt.response);
          this.getPromptEventChannelForPlayer(this.playerId).value = newPromptSpec ?? undefined;
        } else if (prompt.shouldStepBack) {
          this.getPromptEventChannelForPlayer(this.playerId).value = undefined;
          await this.serverPrompts.stepBackPrompt(prompt.shouldReset ?? false);
        }
      } catch (e) {
        prompt.stageOut();
        this.currentPrompt.value = undefined;
      }
    });
    prompt.stageIn();

    this.currentPrompt.value = prompt;
    this.fixActiveLog();
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
    } else if (
      isLive &&
      promptSpec &&
      currentTime === maxTime &&
      currentTime > 0 &&
      !isWaitingOnAnimations &&
      samePasses(this.clientTime.currentClock.value, this.clientTime.maxClock.value)
    ) {
      if (this.currentPrompt.value) {
        this.currentPrompt.value.stageOut();
      }

      this.stageInPrompt(promptSpec);
    } else if (
      isLive &&
      promptSpec &&
      currentTime > 0 &&
      promptSpec.canStageInEarly > 0 &&
      currentTime >= maxTime - promptSpec.canStageInEarly &&
      samePasses(this.clientTime.currentClock.value, this.clientTime.maxClock.value)
    ) {
      // if we are live and have a prompt spec, but our current time is greater than our max time, then we should stage in the prompt, but not mark it as the current prompt spec, so that if we go back in time we can stage out the prompt and stage it back in when we return to the current time
      if (this.currentPrompt.value && this.currentPrompt.value.isSameSerialization(promptSpec)) {
        return;
      }
      if (this.currentPrompt.value) {
        this.currentPrompt.value.stageOut();
      }
      this.stageInPrompt(promptSpec);
    } else {
      this._currentPromptSpec = undefined;
      if (this.currentPrompt.value) {
        this.currentPrompt.value.stageOut();
      }
      this.currentPrompt.value = undefined;
      this.fixActiveLog();
    }
  }

  disconnect() {
    this._currentPromptSpec = undefined;
    if (this.currentPrompt.value) {
      this.currentPrompt.value.stageOut();
    }
    this.currentPrompt.value = undefined;
    this.fixActiveLog();
  }

  public async setPromptForPlayer(playerId: string, prompt?: PromptSerialization, clockDetails?: ClockDetails) {
    this.getPromptEventChannelForPlayer(playerId).value = prompt;
    if (clockDetails) {
      this.clientTime.newMaxClock(clockDetails);
    }
  }

  public getPromptEventChannelForPlayer(playerId: string) {
    let p = this.waitingPrompts[playerId];
    if (!p) {
      p = this.waitingPrompts[playerId] = new EventChannel<PromptSerialization | undefined>(undefined);
    }
    return p;
  }
}
