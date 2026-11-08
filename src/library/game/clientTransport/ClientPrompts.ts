import { EventChannel } from "../../utilities/EventChannel";
import { ClockDetails, samePasses } from "../ClockDetails";
import { Connection } from "../Connection";
import { ConnectionObject } from "../ConnectionObject";
import { PlayerChit } from "../PlayerChit";
import { PickPrompt, Prompt, PromptAction, PromptSerialization } from "../Prompt";
import type { Chit } from "../Chit";
import type { FindChit } from "../Pick";
import { RootChit } from "../RootChit";
import { ServerPrompts } from "../serverTransport/ServerPrompts";
import { ClientTime } from "./ClientTime";

export class ClientPrompts<P extends PlayerChit, R extends RootChit<P>> extends ConnectionObject {
  private waitingPrompts: { [playerId: string]: EventChannel<PromptSerialization | undefined> } = {};
  private serverPrompts: ServerPrompts<P, R>;
  public currentPrompt = new EventChannel<Prompt | undefined>(undefined);

  /**
   * Vets the player's answers before they are sent. Undefined (the default) lets everything through.
   * A tutorial sets this so only the moves its current step asks for go through; everything else
   * is dropped and `blocked` fires so the UI can say so.
   */
  public guard?: (prompt: PickPrompt, action: PromptAction) => boolean | "handled";
  /**
   * Replaces what Undo does while set (a tutorial maps it to its Back). Whether Undo is offered does
   * not change: it still shows only when the current prompt can be undone.
   */
  public undoOverride = new EventChannel<{ undo: () => void } | undefined>(undefined);
  /** Fires with the attempted action each time the guard drops one */
  public blocked = new EventChannel<{ prompt: PickPrompt; action: PromptAction; at: number } | undefined>(undefined);

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

  /** The staged prompt was inflated without some of its chits (staged in early): it is staged in again on time */
  private _provisional = false;

  private stageInPrompt(promptSpec: PromptSerialization, early = false) {
    // A chit the prompt names that the client has not got. Staged in early (a pick asked for it, so the piece is
    // still animating in), the board is a clock behind the prompt and a chit made in the prompt's own flush (a
    // fresh drop target) is not here yet: it is left out, and the prompt is staged in again, whole, once the
    // board catches up. On time, a missing chit is a bug to report, never an exception: this runs inside the
    // client's state update (a clock listener), and an exception here left the board half-updated with the
    // previous prompt still up, which swallowed every later move ("it gets stuck on me dragging my dealer").
    const missing: string[] = [];
    const find: FindChit = (id) => {
      const chit = this.clientTime.findChitUnsafe(id);
      if (!chit) missing.push(id);
      return chit as Chit; // every pick drops a falsy chit (`.filter((d) => d)`)
    };
    let prompt: Prompt;
    try {
      prompt = Prompt.deserialize(promptSpec, find, this.clientTime.game.buttonLibrary);
    } catch (e) {
      console.error(`[prompt] could not inflate "${promptSpec.id}" at clock ${JSON.stringify(this.clientTime.currentClock.value)}:`, e);
      this._currentPromptSpec = undefined;
      return;
    }
    if (missing.length && !early) {
      console.error(
        `[prompt] "${promptSpec.id}" names chits the client has not got at clock ${JSON.stringify(this.clientTime.currentClock.value)} (latest ${JSON.stringify(this.clientTime.maxClock.value)}): ${missing.join(", ")}`,
      );
    }
    this._provisional = missing.length > 0;
    this._currentPromptSpec = this._provisional ? undefined : promptSpec;
    if (prompt instanceof PickPrompt) {
      prompt.guard = (action) => {
        if (!this.guard) {
          return true;
        }
        const verdict = this.guard(prompt, action);
        if (verdict === true) {
          return true;
        }
        if (verdict === false) {
          this.blocked.value = { prompt, action, at: Date.now() };
        }
        // "handled": the guard did something else with it (a tutorial's Undo is its Back)
        return false;
      };
    }
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
      // Staged in early and whole: it is the prompt
      if (this.currentPrompt.value && !this._provisional && this.currentPrompt.value.isSameSerialization(promptSpec)) {
        this._currentPromptSpec = promptSpec;
        return;
      }
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
      this.stageInPrompt(promptSpec, true);
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
