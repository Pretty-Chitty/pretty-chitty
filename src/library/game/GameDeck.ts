import { NonEditable } from "../utilities/Annotations";
import { Chit } from "./Chit";

export type Stage<T> = {
  type: "draw" | "discard";
  chits: T[];
};

export class GameDeck<T extends Chit> extends Chit {
  @NonEditable type = "deck";

  public chitGenerator?: () => T;
  public stages: Stage<T>[] = [];

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override shouldRenderChild(childChit: Chit): boolean {
    return false;
  }

  async draw(message?: string): Promise<T | undefined> {
    while (this.isEmpty(this.stages[0])) {
      this.stages.shift();
    }

    const stage = this.stages[0];
    if (stage) {
      switch (stage.type) {
        case "draw": {
          const index = Math.floor(stage.chits.length * (await this.currentTurn.rng(message)));
          const selected = stage.chits[index];
          stage.chits.splice(index, 1);
          selected.setParent();
          return selected;
        }
        case "discard": {
          stage.type = "draw";
          return this.draw(message);
        }
      }
    }

    if (this.chitGenerator) {
      return this.chitGenerator();
    }
  }

  private isEmpty(stage?: Stage<T>) {
    return stage?.chits.length === 0;
  }

  private findDiscardStage() {
    if (!(this.stages[this.stages.length - 1]?.type === "discard")) {
      this.stages.push({ type: "discard", chits: [] });
    }
    return this.stages[this.stages.length - 1];
  }

  discard(chit: T | T[]) {
    if (Array.isArray(chit)) {
      chit.forEach((chit) => this.orderedChildren.add(chit));
      const stage = this.findDiscardStage();
      stage.chits = stage.chits.concat(chit);
    } else {
      this.orderedChildren.add(chit);
      this.findDiscardStage().chits.push(chit);
    }
  }

  // TODO: add functions stackTop(shuffled), stackBottom(shuffled),
}
