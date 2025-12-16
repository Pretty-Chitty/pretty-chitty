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
import { IUpdatingCanvas } from "../utilities/IUpdatingCanvas";
import { ImageSpec } from "../utilities/CanvasStack/CanvasOperations";

export const ORDERED_CHILDREN = "orderedChildren";

export type ChitClick = () => void;

export type HiddenPropertySerializationRule = {
  fields: "all" | string[];
  playerIds: string[];
};

export type PanelTab = {
  color: string;
  icon: IUpdatingCanvas | ImageSpec;
};

let CHIT_CREATED_ORDER = 0;
export class Chit extends ObjectWithProps {
  @NonEditable public $internal_type: string = "chit";

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getSparks(context: "panel" | "dropdown" | "endgame"): SparkChit[] {
    return [];
  }

  public add<T extends Chit>(chit: T, outlet?: string): T {
    if (!outlet) {
      this.orderedChildren.add(chit);
    } else {
      chit.$internal_setParent(this, outlet);
    }
    return chit;
  }

  public remove(chit: Chit) {
    if (chit.parent !== this) {
      throw new Error("Cannot remove child that isnt mine");
    }
    chit.$internal_setParent();
  }

  public removeFromParent() {
    this.$internal_setParent();
  }

  // Alias for backward compatibility
  public setParent(newValue?: Chit, parentOutlet?: string, parentOutletIndex?: number) {
    this.$internal_setParent(newValue, parentOutlet, parentOutletIndex);
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

  // if a chit comes from a "bag" or something, this will be the "parent" that it should effectively go to or come from
  @NonEditable private $internal__parentFallback?: Chit;
  public get parentFallback(): Chit | undefined {
    return this.$internal__parentFallback;
  }
  public set parentFallback(newValue: Chit | undefined) {
    this.$internal__parentFallback = newValue;
  }

  @NonEditable private _lastParent?: Chit;

  public get $internal_lastParent(): Chit | undefined {
    return this._lastParent;
  }

  public get panelTab(): PanelTab | undefined {
    return undefined;
  }

  toJSON() {
    if (!this.id) {
      throw new Error("Attempting toJSON on a chit without an ID");
    }
    return {
      __chit_id: this.id,
    };
  }

  toString() {
    return `${this.$internal_chitTypeName()} ${this.id}`;
  }

  $internal_chitTypeName() {
    const result = Object.getPrototypeOf(this).constructor.name;
    if (this.parentFallback) {
      return `${result}-${this.parentFallback.id}-`;
    }
    return result;
  }

  //
  //
  // Private or "protected"
  // I can't safely mark stuff as "protected" and make it visible to other parts of the system and not visible to games that extend Chit
  // so anything that should not be used by a game is prefixed with "" which should put it at the bottom of the autocomplete list
  // and make it clear that it shouldn't be touched
  //
  //

  @NonEditable public $internal_renderInstance?: ChitRenderInstance;
  @NonEditable private _version = 0;
  @NonEditable private _createdOrder = ++CHIT_CREATED_ORDER;

  public get $internal_version() {
    return this._version;
  }

  public get $internal_createdOrder() {
    return this._createdOrder;
  }

  @NonEditable private _game?: Game<any, any>;

  public get $internal_game(): Game<any, any> | undefined {
    if (!this._game) {
      this._game = this.parent?.$internal_game;
    }
    return this._game;
  }

  public set $internal_game(newGame: Game<any, any>) {
    this._game = newGame;
  }

  @NonEditable
  private _onClick?: ChitClick;

  public get $internal_onClick(): undefined | ChitClick {
    return this._onClick;
  }

  public set $internal_onClick(newValue: undefined | ChitClick) {
    this._onClick = newValue;
    this.$internal_notifyChange("onClick");
  }

  /**
   * Returns true if the chit is currently clickable
   */
  public get isClickable(): boolean {
    return !!this.$internal_onClick;
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
    const myProto = Object.getPrototypeOf(this);
    const otherProto = Object.getPrototypeOf(other);
    if (myProto !== otherProto) {
      return false;
    }

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

  public get $internal_lockedBy() {
    return this._lockedBy;
  }

  public $internal_lock(turn: Turn<any, any, any>): void {
    if (this._lockedBy && this._lockedBy !== turn) {
      throw new Error("Chit is already locked");
    }
    this._lockedBy = turn;
  }

  public $internal_confirmLock(turn: Turn<any, any, any>): void {
    if (this._lockedBy && this._lockedBy !== turn) {
      throw new Error("Chit is already locked");
    }
  }

  public $internal_unlock(turn: Turn<any, any, any>): void {
    if (this._lockedBy && this._lockedBy !== turn) {
      throw new Error("Chit is locked by someone else?");
    }
    this._lockedBy = undefined;
  }

  public $internal_removeChild(child: Chit, parentOutlet?: string) {
    if (parentOutlet) {
      const existingParentOutletValue = (this as unknown as any)[parentOutlet];
      if (existingParentOutletValue === this) {
        (this as unknown as any)[parentOutlet] = undefined;
      } else if (existingParentOutletValue instanceof OrderedOutlet) {
        existingParentOutletValue.remove(this);
      } else {
        (this as any).$internal_children = (this as any).$internal_children.filter((c: Chit) => c !== child);
      }
    } else {
      (this as any).$internal_children = (this as any).$internal_children.filter((c: Chit) => c !== child);
    }
  }

  public $internal_setParent(newValue?: Chit, parentOutlet?: string, parentOutletIndex?: number) {
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

      oldParent.$internal_children = oldParent.$internal_children.filter((c: Chit) => c !== this);

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
      newValue.$internal_children.push(this);

      if (newValue.$internal_renderInstance) {
        newValue.$internal_renderInstance.childAdded(this, this.$internal_renderInstance);
      } else {
        this.$internal_renderInstance = undefined;
      }
    }

    this.$internal_notifyChange("parent");
  }

  @NonEditable public $internal_children: Chit[] = [];

  public $internal_walk(fn: (c: Chit) => boolean | void) {
    if (fn(this) === false) {
      return;
    }
    this.$internal_children.forEach((child) => child.$internal_walk(fn));
  }

  private get serializationProps() {
    return [
      ...this.$internal_props,
      "id",
      "_parent",
      "_parentOutlet",
      "_parentOutletIndex",
      "$internal__parentFallback",
    ];
  }

  public $internal_screenCoordinates(): Vector2 | undefined {
    return this.$internal_renderInstance?.screenCoordinates() ?? this.parent?.$internal_screenCoordinates();
  }

  public $internal_canRender() {
    return true;
  }

  @NonEditable public $internal_isDeserializing = false;

  public $internal_doneDeserializing() {
    if (this.$internal_isDeserializing) {
      this.$internal_isDeserializing = false;
      this.$internal_notifyChange("deserialized");
    }
  }

  public $internal_beginDeserializing() {
    this.$internal_isDeserializing = true;
  }

  public $internal_deserialize(serialized: string, findChit: (id: string) => Chit) {
    this._version++;
    const j = JSON.parse(serialized);
    if (j.____deleted) {
      this.$internal_setParent();
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

    this.$internal_props.forEach((key) => {
      const value = j[key];

      if (value?.___orderedOutlet) {
        (this as any)[key].$internal_deserialize(value.___orderedOutlet.map(inflateValue));
      } else {
        (this as any)[key] = inflateValue(value);
      }
    });

    this.id = j.id;
    this.$internal__parentFallback = inflateValue(j.$internal__parentFallback);

    if (this._version === 1 && this.$internal__parentFallback) {
      this.$internal_setParent(this.$internal__parentFallback, j._parentOutlet ?? "graveyard");
    }

    this.$internal_setParent(inflateValue(j._parent), j._parentOutlet, j._parentOutletIndex);
  }

  /**
   * Let chits decide who can see what.  (Allow privacy of chits)
   * @param _playerIds
   * @returns
   */
  public hiddenPropertiesForSerialization(_playerIds: string[]): HiddenPropertySerializationRule[] | undefined {
    return undefined;
  }

  public $internal_serialize(playerIds?: string[]): string {
    return JSON.stringify(
      this.serializationProps.reduce(
        (acc, key) => {
          const value = (this as any)[key];
          acc[key] = value;
          return acc;
        },
        {
          __chitType: Object.getPrototypeOf(this).constructor.name,
          __hiddenProps: playerIds ? this.hiddenPropertiesForSerialization(playerIds) : undefined,
        } as { [key: string]: any },
      ),
    );
  }

  //
  //
  // Static methods
  //
  //

  public static $internal_fixVisibility(serialized: string, playerId: string) {
    const data = JSON.parse(serialized);
    if (data.__hiddenProps) {
      const hiddenPropRules = data.__hiddenProps as HiddenPropertySerializationRule[];
      const rule = hiddenPropRules.find((rule) => rule.playerIds.indexOf(playerId) !== -1);
      if (rule) {
        if (rule.fields === "all") {
          Object.keys(data)
            .filter((a) => a !== "id" && !a.startsWith("_") && !data[a].___orderedOutlet)
            .forEach((key) => {
              delete data[key];
            });
        } else {
          rule.fields
            .filter((k) => {
              if (data[k].___orderedOutlet) {
                throw new Error("Cannot mask ordered outlets");
              }
              return true;
            })
            .forEach((key) => {
              delete data[key];
            });
        }
        delete data.__hiddenProps;
        return JSON.stringify(data);
      }
    }
    return serialized;
  }

  /*
   * Creates a new chit from the serialized spec.
   */
  public static $internal_deflate(serialized: string, game: Game<any, any>) {
    const { __chitType, ____deleted } = JSON.parse(serialized);
    if (____deleted) {
      return undefined;
    }
    const ChitType = game.chitLibrary[__chitType] ?? StaticChitTypeRegistry[__chitType];
    if (!ChitType) {
      throw new Error(`Chit Type ${__chitType} not found`);
    }
    const result = new ChitType();
    result.$internal_game = game;
    return result;
  }

  public static $internal_walk(chits: Chit[], fn: (c: Chit) => boolean | void) {
    const seenIds = new Set();
    chits.forEach((chit) =>
      chit.$internal_walk((chit) => {
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
    result.$internal_chits =
      chit instanceof OrderedOutlet ? chit.copy() : Array.isArray(chit) ? (chit.filter((c) => c) as T[]) : [chit];
    result.$internal_cb = cb;
    return result;
  }

  public static $internal_deletedIfSerialized(): string {
    return JSON.stringify({
      ____deleted: true,
    });
  }
}
