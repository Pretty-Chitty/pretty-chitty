import { NonEditable } from "../utilities/Annotations";
import { Chit } from "./Chit";

export type Stage<T> = {
  type: "draw" | "discard";
  chits: T[];
};

/**
 * A GameDeck contains a fixed number of chits.  The deck is broken into "stages", and all draws happen from the top stage.
 * Discards are added to a bottom stage.  If a stage is empty, the stage is removed and all other stages move up in line.
 * If you need to draw a card from the discard stage, it becomes a primary stage and a new discard stage is created.
 *
 * @group Chits
 */
export class GameDeckChit<T extends Chit> extends Chit {
  @NonEditable type = "deck";

  /**
   * If true, the contents of chits are shuffled as they are drawn.  This should only be used if
   * all chits are of the same class type
   */
  public protectSecrets = true;

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
          if (this.protectSecrets) {
            const rngs = await this.currentTurn.takeRng(2, message);
            const resultIndex = Math.floor(stage.chits.length * rngs());
            const swapIndex = Math.floor(stage.chits.length * rngs());
            const selected = stage.chits[resultIndex];
            const swap = stage.chits[swapIndex];

            if (selected.id) {
              const selectedSerialized = selected.serialize();
              const swapSerialized = swap.serialize();

              selected.deserialize(swapSerialized, this.currentTurn.findChit, true);
              swap.deserialize(selectedSerialized, this.currentTurn.findChit, true);
            }

            stage.chits.splice(resultIndex, 1);
            selected.setParent();
            return selected;
          } else {
            const rng = await this.currentTurn.rng();
            const resultIndex = Math.floor(stage.chits.length * rng);
            const selected = stage.chits[resultIndex];
            stage.chits.splice(resultIndex, 1);
            selected.setParent();
            return selected;
          }
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

  public shuffle() {
    this.stages = [{ type: "draw", chits: this.stages.map((stage) => stage.chits).flat() }];
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
