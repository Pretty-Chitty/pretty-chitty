import { Chit } from "./Chit";

export class OrderedOutlet<C extends Chit> {
  public $internal_parent?: Chit;

  public $internal_outletName: string;

  private chits: C[] = [];

  constructor(outletName?: string, parent?: Chit) {
    this.$internal_outletName = outletName ?? "no_name_set";
    this.$internal_parent = parent;
  }

  public toJSON() {
    return {
      ___orderedOutlet: this.chits.map((c) => c.toJSON()),
    };
  }

  public $internal_deserialize(chits: C[]) {
    this.chits = chits;
  }

  public last(): C | undefined {
    return this.chits[this.chits.length - 1];
  }

  public add(c: C) {
    if (this.$internal_parent?.$internal_isDeserializing) {
      return;
    }

    this.chits.push(c);
    this.$internal_fixSort();
    this.$internal_fixOrder();
  }

  public addAll(c: OrderedOutlet<C> | C[]) {
    if (this.$internal_parent?.$internal_isDeserializing) {
      return;
    }

    if (c instanceof OrderedOutlet) {
      c.chits.forEach((c) => this.chits.push(c));
    } else {
      c.forEach((c) => this.chits.push(c));
    }
    this.$internal_fixSort();
    this.$internal_fixOrder();
  }

  public async shuffle() {
    if (this.$internal_parent) {
      const from = await this.$internal_parent.currentTurn.takeRng(this.length);
      const to = await this.$internal_parent.currentTurn.takeRng(this.length);
      for (let i = 0; i < this.chits.length; i++) {
        const j = Math.floor(from() * this.chits.length);
        const k = Math.floor(to() * this.chits.length);
        const temp = this.chits[j];
        this.chits[j] = this.chits[k];
        this.chits[k] = temp;
      }
    }
  }

  // public on(cb: (c: C[]) => void) {
  //   return () => {};
  // }

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
    if (this.$internal_parent?.$internal_isDeserializing) {
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
      this.$internal_fixOrder();
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

  private $internal_fixOrder() {
    this.chits.forEach((c, i) => {
      c.setParent(this.$internal_parent, this.$internal_outletName, i);
    });
  }

  private $internal_fixSort() {
    // do nothing by default?
  }
}
