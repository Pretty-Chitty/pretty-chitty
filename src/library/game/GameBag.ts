import { NonEditable } from "../utilities/Annotations";
import { Chit } from "./Chit";
import { Turn } from "./Turn";

const OUTLET_NAME = "bag";

export class GameBag<T extends Chit> extends Chit {
  /** @internal */
  @NonEditable type = "bag";

  public chitGenerator?: () => T;

  /** @internal */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override shouldRenderChild(childChit: Chit): boolean {
    return false;
  }

  draw(): T {
    if (!this.chitGenerator) {
      throw "No chit generator defined";
    }

    const chit = this.chitGenerator();
    chit.parentFallback = this;
    // chit.setParent(this, OUTLET_NAME);
    // turn.flush();
    return chit;
  }

  drawMultiple(count: number, turn: Turn<any, any, any>): T[] {
    if (!this.chitGenerator) {
      throw "No chit generator defined";
    }
    const generator = this.chitGenerator;

    const chits = [...new Array(count)].map(() => generator().set((c) => c.setParent(this, OUTLET_NAME)));
    // turn.flush();
    return chits;
  }

  discard(chit: T | T[], turn: Turn<any, any, any>): void {
    if (Array.isArray(chit)) {
      chit.forEach((c) => c.setParent(this, OUTLET_NAME));
    } else {
      chit.setParent(this, OUTLET_NAME);
    }
    turn.flush();
  }
}
