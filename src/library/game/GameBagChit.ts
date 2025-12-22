import { NonEditable } from "../utilities/Annotations";
import { Chit } from "./Chit";

/**
 * A GameBag is an infinite supply of a game component available to the game.  It's important that it allows
 * players taking concurrent turns to all oeprate against this same bag without creating a mismatch conflict.
 *
 * @group Chits
 */
export abstract class GameBagChit<T extends Chit> extends Chit {
  @NonEditable type = "bag";

  public abstract chitGenerator(): T;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override shouldRenderChild(childChit: Chit): boolean {
    return false;
  }

  draw(): T {
    const chit = this.chitGenerator();
    chit.parentFallback = this;
    return chit;
  }

  drawMultiple(count: number): T[] {
    const chits = [...new Array(count)].map(() =>
      this.chitGenerator().set((c) => {
        c.parentFallback = this;
      }),
    );
    return chits;
  }

  discard(chit: T | T[]): void {
    if (Array.isArray(chit)) {
      chit.forEach((c) => c.removeFromParent());
    } else {
      chit.removeFromParent();
    }
  }
}
