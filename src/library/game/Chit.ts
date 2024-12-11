import { Vector2 } from "three";

import { ChitRenderInstance } from "../rendering/ChitRenderInstance";
import { ChitRenderSpec } from "../rendering/ChitRenderSpec";
import { Turn } from "./Turn";
import { ObjectWithProps } from "../utilities/ObjectWithProps";
import { Match } from "./Match";
import { ChitPick } from "./Pick";
import { OrderedOutlet } from "./OrderedOutlet";
import { SparkChit } from "./SparkChit";
import StaticChitTypeRegistry from "./StaticChitTypeRegistry";

export const ORDERED_CHILDREN = "orderedChildren";

export class Chit extends ObjectWithProps {
  /** @internal */
  public _type: string = "chit";

  public _id?: string;

  constructor() {
    super();

    const result = new Proxy(this, {
      get(target, property, receiver) {
        return Reflect.get(target, property, receiver);
      },
      set(target, property, value, receiver) {
        const currentValue = Reflect.get(target, property, receiver);

        if (value === currentValue) {
          return true;
        }

        if (
          !property.toString().startsWith("ZZZ") &&
          property !== "_parent" &&
          property !== "_lastParent"
        ) {
          if (currentValue instanceof Chit) {
            currentValue.removeFromParent();
          }

          if (value instanceof Chit) {
            value.setParent(receiver, property as string);
          }

          if (value instanceof OrderedOutlet) {
            value.outletName = property as string;
            value.parent = receiver;
          }
        }

        return Reflect.set(target, property, value, receiver);
      },
    });

    result.orderedChildren = new OrderedOutlet<Chit>();

    return result;
    // FixChildOutlets(this);
  }

  // @Ordered
  public orderedChildren: OrderedOutlet<Chit>;

  public render(_spec: ChitRenderSpec) {}

  public renderInvisible(spec: ChitRenderSpec) {
    spec.rotateX = Math.PI;
    spec.zLiftRotationMultiplier = 3;
  }

  public shouldRenderChild(_childChit: Chit): boolean {
    return true;
  }

  // used if this chit is the root of a panel
  // maybe should be forced to be on PanelChit?

  getSparks(_context: "panel" | "dropdown" | "endgame"): SparkChit[] {
    return [];
  }

  public add<T extends Chit>(chit: T): T {
    this.orderedChildren.add(chit);
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

  private _parentOutletIndex?: number;
  public get parentOutletIndex(): number | undefined {
    return this._parentOutletIndex;
  }

  private _parentOutlet?: string;
  public get parentOutlet(): string | undefined {
    return this._parentOutlet;
  }

  private _parent?: Chit;
  public get parent(): Chit | undefined {
    return this._parent;
  }

  private _lastParent?: Chit;

  /** @internal */
  public get lastParent(): Chit | undefined {
    return this._lastParent;
  }

  /** @internal */
  toJSON() {
    if (!this._id) {
      throw new Error("Attempting toJSON on a chit without an ID");
    }
    return {
      __chit_id: this._id,
    };
  }

  /** @internal */
  toString() {
    return `${Object.getPrototypeOf(this).constructor.name} ${this._id}`;
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
  public _renderInstance?: ChitRenderInstance;
  private _version = 0;

  /** @internal */
  public get version() {
    return this._version;
  }

  private _match?: Match<any, any>;

  /** @internal */
  public get match(): Match<any, any> | undefined {
    if (!this._match) {
      this._match = this.parent?.match;
    }
    return this._match;
  }

  /** @internal */
  public set match(newMatch: Match<any, any>) {
    this._match = newMatch;
  }

  private _onClick?: () => void;

  /** @internal */
  public get onClick(): undefined | (() => void) {
    return this._onClick;
  }

  /** @internal */
  public set onClick(newValue: undefined | (() => void)) {
    this._onClick = newValue;
    this.notifyChange("onClick");
  }

  private _lockedBy?: Turn<any, any, any>;

  public get currentTurn(): Turn<any, any, any> {
    if (this._lockedBy) {
      return this._lockedBy;
    }
    if (this.parent) {
      return this.parent.currentTurn;
    }
    throw "No current turn";
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
        this._children = this._children.filter((c) => c !== child);
      }
    } else {
      this._children = this._children.filter((c) => c !== child);
    }
  }

  /** @internal */
  public setParent(
    newValue?: Chit,
    parentOutlet?: string,
    parentOutletIndex?: number
  ) {
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

      oldParent._children = oldParent._children.filter((c: Chit) => c !== this);

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
      newValue._children.push(this);

      if (newValue._renderInstance) {
        newValue._renderInstance?.childAdded(this, this._renderInstance);
      } else {
        this._renderInstance = undefined;
      }
    }

    this.notifyChange("parent");
  }

  /** @internal */
  public _children: Chit[] = [];

  /** @internal */
  public walk(fn: (c: Chit) => boolean | void) {
    if (fn(this) === false) {
      return;
    }
    this._children.forEach((child) => child.walk(fn));
  }

  private get serializationProps() {
    return [
      ...this.props,
      "_id",
      "_parent",
      "_parentOutlet",
      "_parentOutletIndex",
    ];
  }

  /** @internal */
  public screenCoordinates(): Vector2 | undefined {
    return (
      this._renderInstance?.screenCoordinates() ??
      this.parent?.screenCoordinates()
    );
  }

  /** @internal */
  public canRender() {
    return true;
  }

  /** @internal */
  public _isDeserializing = false;

  /** @internal */
  public doneDeserializing() {
    if (this._isDeserializing) {
      this._isDeserializing = false;
      this.notifyChange("deserialized");
    }
  }

  /** @internal */
  public beginDeserializing() {
    this._isDeserializing = true;
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
        (this as any)[key].deserialize(
          value.___orderedOutlet.map(inflateValue)
        );
      } else {
        (this as any)[key] = inflateValue(value);
      }
    });

    this._id = j._id;
    this.setParent(
      inflateValue(j._parent),
      j._parentOutlet,
      j._parentOutletIndex
    );
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
        } as { [key: string]: any }
      )
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
  public static deflate(serialized: string, match: Match<any, any>) {
    const { __chitType } = JSON.parse(serialized);
    const ChitType =
      match.game.chitLibrary[__chitType] ?? StaticChitTypeRegistry[__chitType];
    if (!ChitType) {
      throw new Error(`Chit Type ${__chitType} not found`);
    }
    const result = new ChitType();
    result.match = match;
    return result;
  }

  /** @internal */
  public static walk(chits: Chit[], fn: (c: Chit) => boolean | void) {
    const seenIds = new Set();
    chits.forEach((chit) =>
      chit.walk((chit) => {
        if (chit._id) {
          if (seenIds.has(chit._id)) {
            return false;
          }
          seenIds.add(chit._id);
        }
        return fn(chit);
      })
    );
  }

  public static pick<T extends Chit>(
    chit: T | T[],
    cb: (chit: T) => void | Promise<void>
  ) {
    const result = new ChitPick<T>();
    result.chits = Array.isArray(chit) ? chit : [chit];
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
