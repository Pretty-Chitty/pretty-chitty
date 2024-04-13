import QuickLRU from "quick-lru";

export class ParameterizedMemoized<T> {
  lru: QuickLRU<string, T>;

  constructor() {
    this.lru = new QuickLRU<string, T>({ maxSize: 25 });
  }

  get(key: string, cb: () => T): T {
    let result = this.lru.get(key);
    if (result === undefined) {
      result = cb();
      this.lru.set(key, result);
    }
    return result;
  }
}
