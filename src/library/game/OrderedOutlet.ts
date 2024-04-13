import { Chit } from "./Chit";

export class OrderedOutlet<C extends Chit> {
  /** @internal */
  public parent: Chit;

  /** @internal */
  public outletName: string;

  private chits: C[] = [];

  constructor(outletName?: string, parent?: Chit) {
    this.outletName = outletName ?? "no_name_set";
    this.parent = parent ?? new Chit();
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

  public push(c: C) {
    this.chits.push(c);
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

  public remove(c: C) {
    this.chits = this.chits.filter((chit) => chit !== c);
    c.setParent();
    this.fixOrder();
  }

  public get length() {
    return this.chits.length;
  }

  public pop() {
    const result = this.chits.pop();
    this.fixOrder();
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
