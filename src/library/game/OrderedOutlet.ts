import { Chit } from "./Chit";

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

  /** @internal */
  public toJSON() {
    return {
      ___orderedOutlet: this.chits.map((c) => c.toJSON()),
    };
  }

  /** @internal */
  public deserialize(chits: C[]) {
    this.chits = chits;
  }

  public add(c: C) {
    if (this.parent?.isDeserializing) {
      return;
    }

    this.chits.push(c);
    this.fixSort();
    this.fixOrder();
  }

  public addAll(c: OrderedOutlet<C> | C[]) {
    if (this.parent?.isDeserializing) {
      return;
    }

    if (c instanceof OrderedOutlet) {
      c.chits.forEach((c) => this.chits.push(c));
    } else {
      c.forEach((c) => this.chits.push(c));
    }
    this.fixSort();
    this.fixOrder();
  }

  // public on(cb: (c: C[]) => void) {
  //   return () => {};
  // }

  public copy() {
    return this.chits.concat();
  }

  public find(cb: (c: C) => boolean) {
    return this.chits.find(cb);
  }

  public map<D>(cb: (c: C) => D): D[] {
    return this.chits.map(cb);
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

  /** @internal */
  private fixOrder() {
    this.chits.forEach((c, i) => {
      c.setParent(this.parent, this.outletName, i);
    });
  }

  /** @internal */
  private fixSort() {
    // do nothing by default?
  }
}
