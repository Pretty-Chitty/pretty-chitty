import { Vector3 } from "three";
import { Chit } from "../game/Chit";
import { OrderedOutlet } from "../game/OrderedOutlet";

const NON_EDITABLE = "NonEditable";
const SELECTABLE_KEY = "__selectableProperties";

/**
 * Represents a single choice option for a Selectable property.
 */
export interface SelectableChoice {
  /** Unique identifier for this choice */
  id: string;
  /** Optional user-friendly label for this choice. If not provided, the id will be used. */
  label?: string;
}

/**
 * Configuration for a Selectable property.
 */
export interface SelectableConfig {
  /** User-friendly label for the property */
  label: string;
  /** List of possible choices for this property */
  choices: SelectableChoice[];
}

/**
 * Information about a Selectable property including its field name and configuration.
 */
export interface SelectablePropertyInfo {
  /** The name of the property/field */
  fieldName: string;
  /** The configuration for this selectable property */
  config: SelectableConfig;
  /** The current value of the property */
  currentValue: any;
}

function annotationToPropName(key: string, category: string) {
  return `__${key}__${category}`;
}

function Annotation(category: string) {
  const result = function (cls: any, key: string) {
    Object.defineProperty(cls, annotationToPropName(key, category), { value: true, enumerable: false });
  };
  result.__name = category;
  return result;
}

export function checkAnnotation(obj: any, key: string, annotation: any): boolean {
  return obj[annotationToPropName(key, annotation.__name)] === true;
}

export const NonEditable = Annotation(NON_EDITABLE);

function addOutletDefinition(outletKey: string, cls: any, key: string, prop: any) {
  if (!Object.hasOwn(cls, outletKey)) {
    Object.defineProperty(cls, outletKey, {
      enumerable: false,
      value: {},
    });
  }
  cls[outletKey][key] = prop;
  return {
    writable: true,
    configurable: true,
    enumerable: true,
  };
}
function addOutletPosition(cls: any, key: string, vector: Vector3) {
  const OUTLET_POSITION = "__outletPosition";
  if (!Object.hasOwn(cls, OUTLET_POSITION)) {
    const parentOutletPosition = Object.getPrototypeOf(cls)?.[OUTLET_POSITION];
    Object.defineProperty(cls, OUTLET_POSITION, {
      enumerable: false,
      value: parentOutletPosition ? { ...parentOutletPosition } : {},
    });
  }
  cls[OUTLET_POSITION][key] = vector;
}

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
 * The optional parameter here is a Vector3 that indicates the position offset for the outlet.
 *
 * @group Chit Annotations
 */
export function Ordered(...args: any): any {
  if (args.length === 1) {
    const v3 = args[0] as Vector3;
    return function (...args: any): any {
      const [cls, key, prop] = args;
      addOutletPosition(cls, key, v3);
      return addOutletDefinition("__orderedOutlets", cls, key, prop);
    };
  }

  const [cls, key, prop] = args;
  return addOutletDefinition("__orderedOutlets", cls, key, prop);
}

/**
 * Defines an "outlet" on a chit.  This can have an initializer
 * which will automatically set that chit's parent to this object.
 * This will create a property that will automatically assign ownership
 * of the chit to the parent if it's assigned (and remove it from any outlet
 * that it was previously assigned to).
 *
 * Sample syntax:
 * ```
 * class MyChit extends Chit {
 *
 *   @ChildOutlet(new Vector3(1,2,-3))
 *   public token1?: Token;
 *
 *   @ChildOutlet
 *   public token2 = new Token().set(t => t.color = "red");
 *
 *   public token3?: Token;
 * }
 * ```
 *
 * Note that token3 is not a ChildOutlet, so assigning it will not update parent/child
 * relationships.  It can still be referenced and used, but it will not affect any parent
 * or child linkages.
 *
 * The optional parameter here is a Vector3 that indicates the position offset for the outlet.
 *
 * @group Chit Annotations
 */
export function ChildOutlet(...args: any): any {
  if (args.length === 1) {
    const v3 = args[0] as Vector3;
    return function (...args: any): any {
      const [cls, key, prop] = args;
      addOutletPosition(cls, key, v3);
      return addOutletDefinition("__childOutlets", cls, key, prop);
    };
  }

  const [cls, key, prop] = args;
  return addOutletDefinition("__childOutlets", cls, key, prop);
}

export function isChildOutlet(obj: any, key: string) {
  if (obj.__childOutlets && obj.__childOutlets[key]) {
    return true;
  }
  return false;
}

export function FixChildOutlets(instance: Chit) {
  const seenKeys = new Set();
  let obj: any = instance;
  while (obj) {
    obj = Object.getPrototypeOf(obj);
    if (obj?.__childOutlets) {
      Object.entries(obj.__childOutlets).forEach(([key, prop]: [key: any, prop: any]) => {
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          let v: Chit | undefined;
          const set = (newValue: Chit) => {
            if (newValue !== v) {
              if (v) {
                v.removeFromParent();
              }
              v = newValue;
              if (newValue) {
                newValue.setParent(instance, key);
              }
            }
          };
          const get = () => v;

          if (prop?.initializer) {
            set(prop?.initializer.apply(instance, []));
          }

          Object.defineProperty(instance, key, {
            enumerable: true,
            get,
            set,
          });
        }
      });
    }

    if (obj?.__orderedOutlets) {
      Object.entries(obj.__orderedOutlets).forEach(([key, prop]: [key: any, prop: any]) => {
        const existingValue = (instance as any)[key];
        const v = existingValue || prop?.initializer?.apply(instance, []);
        if (v) {
          v.outletName = key;
          v.parent = instance;
        }
        Object.defineProperty(instance, key, {
          enumerable: true,
          writable: true,
          configurable: true,
          value: v,
        });
      });
    }
  }
}

/**
 * Decorator that marks a property as selectable with a user-friendly label and a list of choices.
 *
 * @param config - Configuration object containing the label and choices for this property
 *
 * @example
 * ```typescript
 * class MyChit extends Chit {
 *   @Selectable({
 *     label: "Difficulty Level",
 *     choices: [
 *       { id: "easy", label: "Easy Mode" },
 *       { id: "medium", label: "Medium Mode" },
 *       { id: "hard", label: "Hard Mode" }
 *     ]
 *   })
 *   public difficulty: string = "medium";
 * }
 * ```
 *
 * @group Chit Annotations
 */
export function Selectable(config: SelectableConfig) {
  return function (cls: any, key: string) {
    if (!Object.hasOwn(cls, SELECTABLE_KEY)) {
      const parentSelectables = Object.getPrototypeOf(cls)?.[SELECTABLE_KEY];
      Object.defineProperty(cls, SELECTABLE_KEY, {
        enumerable: false,
        value: parentSelectables ? { ...parentSelectables } : {},
      });
    }
    cls[SELECTABLE_KEY][key] = config;
  };
}

/**
 * Gets all selectable properties from an object instance.
 *
 * @param obj - The object to get selectable properties from
 * @returns An array of SelectablePropertyInfo objects
 */
export function getSelectableProperties(obj: any): SelectablePropertyInfo[] {
  const result: SelectablePropertyInfo[] = [];
  const seenKeys = new Set<string>();

  let proto = Object.getPrototypeOf(obj);
  while (proto) {
    const selectables = proto[SELECTABLE_KEY];
    if (selectables) {
      for (const [fieldName, config] of Object.entries(selectables)) {
        if (!seenKeys.has(fieldName)) {
          seenKeys.add(fieldName);
          result.push({
            fieldName,
            config: config as SelectableConfig,
            currentValue: obj[fieldName],
          });
        }
      }
    }
    proto = Object.getPrototypeOf(proto);
  }

  return result;
}
