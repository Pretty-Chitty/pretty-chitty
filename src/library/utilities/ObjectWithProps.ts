import "reflect-metadata";
import nextTick from "next-tick";
import { checkAnnotation, NonEditable } from "./Annotations";

const CATCH_ALL = "[[null]]";
export class ObjectWithProps {
  public get $internal_props(): string[] {
    return Object.keys(this).filter((key) => !checkAnnotation(this, key, NonEditable));
  }
  @NonEditable private $internal__cbs: { [key: string]: Array<() => void> } = {};

  @NonEditable private $internal__keysThatChanged = new Set<string>();

  public set(cb: (chit: this) => void): this {
    cb(this);
    return this;
  }

  public $internal_notifyChange(key: string): void {
    if (this.$internal__keysThatChanged.size === 0) {
      nextTick(() => {
        this.$internal__keysThatChanged.forEach((key) => this.$internal__cbs[key]?.forEach((cb) => cb()));
        this.$internal__cbs[CATCH_ALL]?.forEach((cb) => cb());
        this.$internal__keysThatChanged.clear();
      });
    }
    this.$internal__keysThatChanged.add(key);
  }

  public $internal_onChange(key: string | null, cb: () => void): () => void {
    const keysToUse = (key ?? CATCH_ALL).split(/\s/g);

    keysToUse.forEach((keyToUse) => {
      let arr = this.$internal__cbs[keyToUse];
      if (arr === undefined) {
        this.$internal__cbs[keyToUse] = arr = [];
      }
      arr.push(cb);
    });

    return () => {
      keysToUse.forEach((keyToUse) => {
        this.$internal__cbs[keyToUse] = this.$internal__cbs[keyToUse].filter((c) => c !== cb);
      });
    };
  }
}
