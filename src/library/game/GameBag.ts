import { NonEditable } from "../utilities/Annotations";
import { Chit } from "./Chit";

const OUTLET_NAME = "bag";

export abstract class GameBag<T extends Chit> extends Chit {
  /** @internal */
  @NonEditable type = "bag";

  public abstract chitGenerator(): T;

  /** @internal */
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
    const chits = [...new Array(count)].map(() => this.chitGenerator().set((c) => c.setParent(this, OUTLET_NAME)));
    return chits;
  }

  discard(chit: T | T[]): void {
    if (Array.isArray(chit)) {
      chit.forEach((c) => c.setParent(this, OUTLET_NAME));
    } else {
      chit.setParent(this, OUTLET_NAME);
    }
  }
}
