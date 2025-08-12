import { ChitRenderInstance } from "../rendering/ChitRenderInstance";
import { ChitRenderSpec } from "../rendering/ChitRenderSpec";
import { Turn } from "./Turn";
import { FixChildOutlets, NonEditable, Ordered } from "../utilities/Annotations";
import { ObjectWithProps } from "../utilities/ObjectWithProps";
import { ChitPick } from "./Pick";
import { Vector2 } from "three";
import { OrderedOutlet } from "./OrderedOutlet";
import { SparkChit } from "./SparkChit";
import StaticChitTypeRegistry from "./StaticChitTypeRegistry";
import type { Game } from "./Game";

export const ORDERED_CHILDREN = "orderedChildren";

export type ChitClick = () => void;

let CHIT_CREATED_ORDER = 0;
export class Chit extends ObjectWithProps {
  /** @internal */
  @NonEditable public type: string = "chit";

  @NonEditable public id?: string;

  constructor() {
    super();
    FixChildOutlets(this);
  }

  @Ordered
  public orderedChildren = new OrderedOutlet<Chit>();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public render(spec: ChitRenderSpec) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public shouldRenderChild(childChit: Chit): boolean {
    return true;
  }

  // used if this chit is the root of a panel
  // maybe should be forced to be on PanelChit?
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getSparks(context: "panel" | "dropdown" | "endgame"): SparkChit[] {
    return [];
  }

  public add<T extends Chit>(chit: T, outlet?: string): T {
    if (!outlet) {
      this.orderedChildren.add(chit);
    } else {
      chit.setParent(this, outlet);
    }
    return chit;
  }

  public remove(chit: Chit) {
    if (chit.parent !== this) {
      throw new Error("Cannot remove child that isnt mine");
    }
    chit.setParent();
  }

  public removeFromParent() {
    this.setParent();
  }

  @NonEditable private _parentOutletIndex?: number;
  public get parentOutletIndex(): number | undefined {
    return this._parentOutletIndex;
  }

  @NonEditable private _parentOutlet?: string;
  public get parentOutlet(): string | undefined {
    return this._parentOutlet;
  }

  @NonEditable private _parent?: Chit;
  public get parent(): Chit | undefined {
    return this._parent;
  }

  @NonEditable private _lastParent?: Chit;

  /** @internal */
  public get lastParent(): Chit | undefined {
    return this._lastParent;
  }

  /** @internal */
  toJSON() {
    if (!this.id) {
      throw new Error("Attempting toJSON on a chit without an ID");
    }
    return {
      __chit_id: this.id,
    };
  }

  /** @internal */
  toString() {
    return `${Object.getPrototypeOf(this).constructor.name} ${this.id}`;
  }

  //
  //
  // Private or "protected"
  // I can't safely mark stuff as "protected" and make it visible to other parts of the system and not visible to games that extend Chit
  // so anything that should not be used by a game is prefixed with "" which should put it at the bottom of the autocomplete list
  // and make it clear that it shouldn't be touched
  //
  //

  /** @internal */
  @NonEditable public renderInstance?: ChitRenderInstance;
  @NonEditable private _version = 0;
  @NonEditable private _createdOrder = ++CHIT_CREATED_ORDER;

  /** @internal */
  public get version() {
    return this._version;
  }

  /** @internal */
  public get createdOrder() {
    return this._createdOrder;
  }

  @NonEditable private _game?: Game<any, any>;

  /** @internal */
  public get game(): Game<any, any> | undefined {
    if (!this._game) {
      this._game = this.parent?.game;
    }
    return this._game;
  }

  /** @internal */
  public set game(newGame: Game<any, any>) {
    this._game = newGame;
  }

  @NonEditable
  /** @internal */
  private _onClick?: ChitClick;

  /** @internal */
  public get onClick(): undefined | ChitClick {
    return this._onClick;
  }

  /** @internal */
  public set onClick(newValue: undefined | ChitClick) {
    this._onClick = newValue;
    this.notifyChange("onClick");
  }

  @NonEditable private _lockedBy?: Turn<any, any, any>;

  public get currentTurn(): Turn<any, any, any> {
    if (this._lockedBy) {
      return this._lockedBy;
    }
    if (this.parent) {
      return this.parent.currentTurn;
    }
    throw "No current turn";
  }

  public functionallyIdentical(other: Chit) {
    const compare = (a: any, b: any): boolean => {
      if (a === b) {
        return true;
      }
      if ((a && !b) || (!b && a)) {
        return false;
      }

      const aIsArray = Array.isArray(a);
      const bIsArray = Array.isArray(b);
      if (aIsArray && bIsArray) {
        if (a.length !== b.length) {
          return false;
        }
        return !a.find((item, index) => !compare(item, b[index]));
      }

      const aIsChit = a instanceof Chit;
      const bIsChit = b instanceof Chit;
      if (aIsChit && bIsChit) {
        return a.functionallyIdentical(b);
      }

      const aIsOrderedOutlet = a instanceof OrderedOutlet;
      const bIsOrderedOutlet = b instanceof OrderedOutlet;
      if (aIsOrderedOutlet && bIsOrderedOutlet) {
        return compare(a.copy(), b.copy());
      }

      const aIsObject = a instanceof Object;
      const bIsObject = b instanceof Object;
      if (aIsObject && bIsObject) {
        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);
        if (aKeys.length !== bKeys.length) {
          return false;
        }
        return !aKeys.find((key) => !compare(a[key], b[key]));
      }

      return a === b;
    };

    const myProps = this.serializationProps;
    const otherProps = other.serializationProps;
    if (myProps.length !== otherProps.length || JSON.stringify(myProps) !== JSON.stringify(otherProps)) {
      return false;
    }

    // find a prop that isn't the same
    return !this.serializationProps.find((prop) => {
      // indexes will of course be different... no need to stress on these
      if (prop.startsWith("_") || prop === "id") {
        return false;
      }

      const myValue = (this as any)[prop];
      const otherValue = (other as any)[prop];
      return !compare(myValue, otherValue);
    });
  }

  /** @internal */
  public get lockedBy() {
    return this._lockedBy;
  }

  /** @internal */
  public lock(turn: Turn<any, any, any>): void {
    if (this._lockedBy && this._lockedBy !== turn) {
      throw new Error("Chit is already locked");
    }
    this._lockedBy = turn;
  }

  /** @internal */
  public confirmLock(turn: Turn<any, any, any>): void {
    if (this._lockedBy && this._lockedBy !== turn) {
      throw new Error("Chit is already locked");
    }
  }

  /** @internal */
  public unlock(turn: Turn<any, any, any>): void {
    if (this._lockedBy && this._lockedBy !== turn) {
      throw new Error("Chit is locked by someone else?");
    }
    this._lockedBy = undefined;
  }

  /** @internal */
  public removeChild(child: Chit, parentOutlet?: string) {
    if (parentOutlet) {
      const existingParentOutletValue = (this as unknown as any)[parentOutlet];
      if (existingParentOutletValue === this) {
        (this as unknown as any)[parentOutlet] = undefined;
      } else if (existingParentOutletValue instanceof OrderedOutlet) {
        existingParentOutletValue.remove(this);
      } else {
        this.children = this.children.filter((c) => c !== child);
      }
    } else {
      this.children = this.children.filter((c) => c !== child);
    }
  }

  /** @internal */
  public setParent(newValue?: Chit, parentOutlet?: string, parentOutletIndex?: number) {
    if (this._parent === newValue && this._parentOutlet === parentOutlet) {
      this._parentOutletIndex = parentOutletIndex;
      return;
    }

    if (this._parent !== newValue) {
      this._lastParent = this._parent;
    }

    if (this._parent) {
      if (!this._parentOutlet) {
        throw new Error("Cannot have a parent without a parent outlet");
      }

      const oldParent = this._parent as unknown as any,
        oldOutlet = this._parentOutlet;

      this._parent = undefined;
      this._parentOutlet = undefined;
      this._parentOutletIndex = undefined;

      oldParent.children = oldParent.children.filter((c: Chit) => c !== this);

      const existingParentOutletValue = oldParent[oldOutlet];
      if (existingParentOutletValue === this) {
        oldParent[oldOutlet] = undefined;
      } else if (existingParentOutletValue instanceof OrderedOutlet) {
        existingParentOutletValue.remove(this);
      }
    }

    if (newValue) {
      this._parent = newValue;
      this._parentOutlet = parentOutlet;
      this._parentOutletIndex = parentOutletIndex;
      newValue.children.push(this);

      if (newValue.renderInstance) {
        newValue.renderInstance.childAdded(this, this.renderInstance);
      } else {
        this.renderInstance = undefined;
      }
    }

    this.notifyChange("parent");
  }

  /** @internal */
  @NonEditable public children: Chit[] = [];

  /** @internal */
  public walk(fn: (c: Chit) => boolean | void) {
    if (fn(this) === false) {
      return;
    }
    this.children.forEach((child) => child.walk(fn));
  }

  private get serializationProps() {
    return [...this.props, "id", "_parent", "_parentOutlet", "_parentOutletIndex"];
  }

  /** @internal */
  public screenCoordinates(): Vector2 | undefined {
    return this.renderInstance?.screenCoordinates() ?? this.parent?.screenCoordinates();
  }

  /** @internal */
  public canRender() {
    return true;
  }

  /** @internal */
  @NonEditable public isDeserializing = false;

  /** @internal */
  public doneDeserializing() {
    if (this.isDeserializing) {
      this.isDeserializing = false;
      this.notifyChange("deserialized");
    }
  }

  /** @internal */
  public beginDeserializing() {
    this.isDeserializing = true;
  }

  /** @internal */
  public deserialize(serialized: string, findChit: (id: string) => Chit) {
    this._version++;
    const j = JSON.parse(serialized);
    if (j.____deleted) {
      this.removeFromParent();
      return;
    }

    const inflateValue = (value: any): any => {
      if (!value) {
        return value;
      }
      if (Array.isArray(value)) {
        return value.map(inflateValue);
      } else if (Object.getPrototypeOf(value).constructor.name === "Object") {
        // only want to do this for vanilla objects
        if (value.__chit_id) {
          return findChit(value.__chit_id);
        }

        return Object.entries(value).reduce((acc, [key, value]) => {
          (acc as any)[key] = inflateValue(value);
          return acc;
        }, {});
      } else {
        return value;
      }
    };

    this.props.forEach((key) => {
      const value = j[key];

      if (value?.___orderedOutlet) {
        (this as any)[key].deserialize(value.___orderedOutlet.map(inflateValue));
      } else {
        (this as any)[key] = inflateValue(value);
      }
    });

    this.id = j.id;
    this.setParent(inflateValue(j._parent), j._parentOutlet, j._parentOutletIndex);
  }

  /** @internal */
  public serialize(): string {
    return JSON.stringify(
      this.serializationProps.reduce(
        (acc, key) => {
          const value = (this as any)[key];
          acc[key] = value;
          return acc;
        },
        {
          __chitType: Object.getPrototypeOf(this).constructor.name,
        } as { [key: string]: any },
      ),
    );
  }

  //
  //
  // Static methods
  //
  //

  /*
   * Creates a new chit from the serialized spec.
   */
  /** @internal */
  public static deflate(serialized: string, game: Game<any, any>) {
    const { __chitType, ____deleted } = JSON.parse(serialized);
    if (____deleted) {
      return undefined;
    }
    const ChitType = game.chitLibrary[__chitType] ?? StaticChitTypeRegistry[__chitType];
    if (!ChitType) {
      throw new Error(`Chit Type ${__chitType} not found`);
    }
    const result = new ChitType();
    result.game = game;
    return result;
  }

  /** @internal */
  public static walk(chits: Chit[], fn: (c: Chit) => boolean | void) {
    const seenIds = new Set();
    chits.forEach((chit) =>
      chit.walk((chit) => {
        if (chit.id) {
          if (seenIds.has(chit.id)) {
            return false;
          }
          seenIds.add(chit.id);
        }
        return fn(chit);
      }),
    );
  }

  public static pick<T extends Chit>(
    chit: T | (T | undefined | null | false)[] | OrderedOutlet<T>,
    cb: (chit: T) => void | Promise<void>,
  ) {
    const result = new ChitPick<T>();
    result.chits =
      chit instanceof OrderedOutlet ? chit.copy() : Array.isArray(chit) ? (chit.filter((c) => c) as T[]) : [chit];
    result.cb = cb;
    return result;
  }

  /** @internal */
  public static deletedIfSerialized(): string {
    return JSON.stringify({
      ____deleted: true,
    });
  }
}
