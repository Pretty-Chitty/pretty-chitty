import { NonEditable } from "../utilities/Annotations";
import { Chit } from "./Chit";

export abstract class GameBag<T extends Chit> extends Chit {
  @NonEditable $internal_type = "bag";

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
