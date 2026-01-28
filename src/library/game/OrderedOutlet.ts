import { Chit } from "./Chit";

/**
 * OrderedOutlets are ways to maintain a list of ordered chits on another (parent) chit.  Adding
 * or removing chits from the outlet will automatically update the parent/child relationships.
 *
 * This should only be used in conjunction with the `@Ordered` annotation.
 *
 * Preferred syntax:
 * ```
 * class MyChit extends Chit {
 *
 *   @Ordered(new Vector3(1,2,-3))
 *   public tokens = new OrderedOutlet<Token>();
 *
 * }
 * ```
 *
 * @group Chit Annotations
 */
export class OrderedOutlet<C extends Chit> {
  /** @internal */
  public parent?: Chit;

  /** @internal */
  public outletName: string;

  private chits: C[] = [];

  constructor(outletName?: string, parent?: Chit) {
    this.outletName = outletName ?? "no_name_set";
    this.parent = parent;
  }

  public toJSON() {
    return {
      ___orderedOutlet: this.chits.map((c) => c.toJSON()),
    };
  }

  /** @internal */
  public deserialize(chits: C[]) {
    this.chits = chits;
  }

  public last(): C | undefined {
    return this.chits[this.chits.length - 1];
  }

  public add(c: C) {
    if (this.parent?.isDeserializing) {
      return;
    }
    c.setParent();

    this.chits.push(c);
    this.fixSort();
    this.fixOrder();
  }

  public addAll(c: OrderedOutlet<C> | C[]) {
    if (this.parent?.isDeserializing) {
      return;
    }

    if (c instanceof OrderedOutlet) {
      const chits = c.chits;
      chits.forEach((c) => c.setParent());
      chits.forEach((c) => this.chits.push(c));
    } else {
      c.forEach((c) => c.setParent());
      c.forEach((c) => this.chits.push(c));
    }
    this.fixSort();
    this.fixOrder();
  }

  public async shuffle() {
    if (this.parent) {
      const from = await this.parent.currentTurn.takeRng(this.length);
      const to = await this.parent.currentTurn.takeRng(this.length);
      for (let i = 0; i < this.chits.length; i++) {
        const j = Math.floor(from() * this.chits.length);
        const k = Math.floor(to() * this.chits.length);
        const temp = this.chits[j];
        this.chits[j] = this.chits[k];
        this.chits[k] = temp;
      }
    }
    this.fixOrder();
  }

  public copy(): C[] {
    return this.chits.concat();
  }

  public find(cb: (c: C) => boolean) {
    return this.chits.find(cb);
  }

  public map<D>(cb: (c: C) => D): D[] {
    return this.chits.map(cb);
  }

  public some(cb: (c: C) => boolean): boolean {
    return this.chits.some(cb);
  }

  public every(cb: (c: C) => boolean): boolean {
    return this.chits.every(cb);
  }

  public reduce<D>(cb: (acc: D, c: C) => D, initial: D): D {
    return this.chits.reduce(cb, initial);
  }

  public findIndex(cb: (c: C) => boolean): number {
    return this.chits.findIndex(cb);
  }

  public flatMap<D>(cb: (c: C) => D[]): D[] {
    return this.chits.flatMap(cb);
  }

  public filter(cb: (c: C) => boolean): C[] {
    return this.chits.filter(cb);
  }

  public forEach(cb: (c: C) => void) {
    this.chits.forEach(cb);
  }

  public get(i: number): C {
    const result = this.chits[i];
    if (!result) {
      throw new Error("Index out of bounds");
    }
    return result;
  }

  public tryGet(i: number): C | undefined {
    return this.chits[i];
  }

  public remove(c: C | C[]) {
    if (this.parent?.isDeserializing) {
      return;
    }

    const removedChits: C[] = [];
    if (Array.isArray(c)) {
      const s = new Set(c);
      this.chits = this.chits.filter((chit) => {
        const found = s.has(chit);
        if (found) {
          removedChits.push(chit);
        }
        return !found;
      });
    } else {
      this.chits = this.chits.filter((chit) => {
        if (chit !== c) {
          return true;
        }
        removedChits.push(chit);
        return false;
      });
    }

    if (removedChits.length > 0) {
      removedChits.forEach((c) => c.setParent());

      // TODO: depending on order of deserialization this might be misbehaving
      this.fixOrder();
    }
  }

  public get length() {
    return this.chits.length;
  }

  public pop() {
    const result = this.chits.pop();
    if (result) {
      this.remove(result);
    }
    return result;
  }

  private fixOrder() {
    this.chits.forEach((c, i) => {
      c.setParent(this.parent, this.outletName, i);
    });
  }

  private fixSort() {
    // do nothing by default?
  }
}
