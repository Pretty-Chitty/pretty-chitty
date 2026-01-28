import "reflect-metadata";
import { checkAnnotation, NonEditable } from "./Annotations";

const CATCH_ALL = "[[null]]";
export class ObjectWithProps {
  /** @internal */
  public get props(): string[] {
    return Object.keys(this).filter((key) => !checkAnnotation(this, key, NonEditable));
  }
  /** @internal */
  @NonEditable private _cbs: { [key: string]: Array<() => void> } = {};

  /** @internal */
  @NonEditable private _keysThatChanged = new Set<string>();

  public set(cb: (chit: this) => void): this {
    cb(this);
    return this;
  }

  /** @internal */
  public notifyChange(key: string): void {
    if (this._keysThatChanged.size === 0) {
      queueMicrotask(() => {
        this._keysThatChanged.forEach((key) => this._cbs[key]?.forEach((cb) => cb()));
        this._cbs[CATCH_ALL]?.forEach((cb) => cb());
        this._keysThatChanged.clear();
      });
    }
    this._keysThatChanged.add(key);
  }

  /** @internal */
  public onChange(key: string | null, cb: () => void): () => void {
    const keysToUse = (key ?? CATCH_ALL).split(/\s/g);

    keysToUse.forEach((keyToUse) => {
      let arr = this._cbs[keyToUse];
      if (arr === undefined) {
        this._cbs[keyToUse] = arr = [];
      }
      arr.push(cb);
    });

    return () => {
      keysToUse.forEach((keyToUse) => {
        this._cbs[keyToUse] = this._cbs[keyToUse].filter((c) => c !== cb);
      });
    };
  }
}
