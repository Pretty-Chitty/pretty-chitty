import { MismatchError } from "./Turn";

export type DecisionType = "prompt" | "rng" | "turn";

export type PromptResponse = {
  readonly type: "prompt";
  response?: any;
  timestamp: Date;
};

export type RngResponse = { readonly type: "rng"; value: number[] };

export type Decision = PromptResponse | RngResponse | TurnState;

/**
 * Where a match's random numbers come from. Called once per `rng()` / `takeRng(count)` draw with the
 * number of values wanted; return that many numbers in [0, 1), or `undefined` to fall back to
 * `Math.random`. Draws are persisted in the turn state as always, so a source only matters for a
 * draw that has not been made yet (never on replay, reload or undo).
 */
export type RngSource = (count: number) => number[] | undefined;

export class TurnState {
  readonly type = "turn";
  id = "root";
  playerId?: string;
  createdDate = Date.now();

  decisions: Decision[] = [];

  /**
   * AI players' plan memory, keyed by player id. Only the root turn state carries it. It rides
   * along with the decisions so a bot that is re-seated after a reload (or in another process)
   * picks up where it left off. Absent when no bot has committed a plan.
   */
  ai?: { [playerId: string]: unknown };

  private parentTurnState: TurnState | undefined;
  private parentTurnIndex = 0;

  /** Set on the root turn state (see `Match`); sub-turns inherit it. Not serialized. */
  public rngSource?: RngSource;

  private get rng(): RngSource | undefined {
    return this.rngSource ?? this.parentTurnState?.rng;
  }

  private draw(count: number): number[] {
    const scripted = this.rng?.(count);
    if (scripted && scripted.length === count) {
      return scripted;
    }
    return Array.from({ length: count }, () => Math.random());
  }

  toJSON() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { parentTurnIndex, parentTurnState, rngSource, ...rest } = this;
    return rest;
  }

  public getOrCreatePromptResponse(index: number): PromptResponse {
    if (index < this.decisions.length) {
      const result = this.decisions[index];
      if (result.type !== "prompt") {
        throw new MismatchError();
      }
      return result as PromptResponse;
    } else if (index === this.decisions.length) {
      this.decisions.push({
        type: "prompt",
        timestamp: new Date(),
      });
      return this.decisions[this.decisions.length - 1] as PromptResponse;
    } else {
      throw new MismatchError();
    }
  }
  public setOrCreatePromptResponse(index: number, response: PromptResponse): void {
    if (index < this.decisions.length) {
      const result = this.decisions[index];
      if (result.type !== "prompt") {
        throw new MismatchError();
      }
      this.decisions[index] = response;
    } else if (index === this.decisions.length) {
      this.decisions.push(response);
    } else {
      throw new MismatchError();
    }
  }

  public getOrCreateRng(index: number): number {
    if (index < this.decisions.length) {
      const result = this.decisions[index];
      if (result.type !== "rng") {
        throw new MismatchError();
      }
      return (result as RngResponse).value[0];
    } else if (index === this.decisions.length) {
      const rng = this.draw(1)[0];
      this.decisions.push({
        type: "rng",
        value: [rng],
      });
      return rng;
    } else {
      throw new MismatchError();
    }
  }

  public getOrCreateMultipleRng(index: number, count: number): number[] {
    if (index < this.decisions.length) {
      const result = this.decisions[index];
      if (result.type !== "rng" || result.value.length !== count) {
        throw new MismatchError();
      }
      return (result as RngResponse).value;
    } else if (index === this.decisions.length) {
      const rngs = this.draw(count);
      this.decisions.push({
        type: "rng",
        value: rngs,
      });
      return rngs;
    } else {
      throw new MismatchError();
    }
  }

  public getOrCreateTurnState(index: number): TurnState {
    if (index < this.decisions.length) {
      const result = this.decisions[index];
      if (result.type !== "turn") {
        throw new MismatchError();
      }
      return result as TurnState;
    } else if (index === this.decisions.length) {
      const result = new TurnState();
      result.parentTurnState = this;
      result.parentTurnIndex = index;
      this.decisions.push(result);
      return result;
    } else {
      throw new MismatchError();
    }
  }

  public deserialize(serialized: any) {
    this.playerId = serialized.playerId;
    this.id = serialized.id;
    this.createdDate = serialized.createdDate ?? Date.now();
    this.ai = serialized.ai;
    this.decisions = (serialized.decisions ?? []).map((d: Decision, i: number) => {
      if (d.type === "turn") {
        const existing = this.decisions[i];
        if (existing?.type === "turn") {
          existing.deserialize(d);
        } else {
          const r = new TurnState();
          r.parentTurnState = this;
          r.parentTurnIndex = i;
          r.deserialize(d);
          return r;
        }
      }
      return d;
    });
  }

  public hasUserMadeChoiceSinceUserContextChangedOrRng(index: number): boolean {
    if (index < 0 && this.parentTurnState && this.parentTurnState.playerId === this.playerId) {
      return this.parentTurnState.hasUserMadeChoiceSinceUserContextChangedOrRng(this.parentTurnIndex);
    }

    for (let i = index; i >= 0; i--) {
      const lastDecision = this.decisions[i];
      if (!lastDecision) {
        continue;
      } else if (lastDecision.type === "rng") {
        return false;
      } else if (lastDecision.type === "prompt") {
        return true;
      } else if (lastDecision.type === "turn") {
        const subTurn = lastDecision as TurnState;
        if (subTurn.decisions.length === 0) {
          continue;
        }

        if (subTurn.playerId === this.playerId) {
          return subTurn.hasUserMadeChoiceSinceUserContextChangedOrRng(subTurn.decisions.length - 1);
        }
        return false;
      }
    }
    return false;
  }

  public stepBack() {
    if (!this.hasUserMadeChoiceSinceUserContextChangedOrRng(this.decisions.length)) {
      // should be -1? does it matter?
      throw new Error("Cannot step back");
    }

    const lastDecision = this.decisions[this.decisions.length - 1];
    if (!lastDecision) {
      throw new Error("Cannot step back - no decisions");
    }

    if (lastDecision.type === "turn") {
      lastDecision.stepBack();
      if (lastDecision.decisions.length > 0) {
        return;
      }
    }

    this.decisions.pop();
  }

  public fullStepBack() {
    while (this.hasUserMadeChoiceSinceUserContextChangedOrRng(this.decisions.length)) {
      const lastDecision = this.decisions[this.decisions.length - 1];
      if (!lastDecision) {
        throw new Error("Cannot step back - no decisions");
      }

      if (lastDecision.type === "turn") {
        lastDecision.stepBack();
        if (lastDecision.decisions.length > 0) {
          return;
        }
      }

      this.decisions.pop();
    }
  }
}
