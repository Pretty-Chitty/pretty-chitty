import { MismatchError } from "./Turn";

export type DecisionType = "prompt" | "rng" | "turn";

export type PromptResponse = {
  readonly type: "prompt";
  response?: any;
  timestamp: Date;
};

export type RngResponse = { readonly type: "rng"; value: number };

export type Decision = PromptResponse | RngResponse | TurnState;

export class TurnState {
  readonly type = "turn";
  id = "root";
  playerId?: string;
  createdDate = Date.now();

  decisions: Decision[] = [];

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

  public getOrCreateRng(index: number): number {
    if (index < this.decisions.length) {
      const result = this.decisions[index];
      if (result.type !== "rng") {
        throw new MismatchError();
      }
      return (result as RngResponse).value;
    } else if (index === this.decisions.length) {
      const rng = Math.random();
      this.decisions.push({
        type: "rng",
        value: rng,
      });
      return rng;
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
      this.decisions.push(result);
      return result;
    } else {
      throw new MismatchError();
    }
  }

  public deserialize(serialized: any) {
    this.createdDate = serialized.createdDate ?? Date.now();
    this.decisions = (serialized.decisions ?? []).map((d: Decision, i: number) => {
      if (d.type === "turn") {
        const existing = this.decisions[i];
        if (existing?.type === "turn") {
          existing.deserialize(d);
        } else {
          const r = new TurnState();
          r.deserialize(d);
          return r;
        }
      }
      return d;
    });
  }

  public hasUserMadeChoiceSinceUserContextChangedOrRng(index: number): boolean {
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
