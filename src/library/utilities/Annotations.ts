import { Chit } from "../game/Chit";
import { OrderedOutlet } from "../game/OrderedOutlet";

const NON_EDITABLE = "NonEditable";

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

export function Ordered(...args: any): any {
  const [cls, key] = args;
  if (!cls.__orderedOutlets) {
    Object.defineProperty(cls, "__orderedOutlets", {
      enumerable: false,
      value: {},
    });
  }
  cls.__orderedOutlets[key] = true;
  return {};
}

//
// Defines an "outlet" on a chit.  This can have an initializer
// which will automatically set that chit's parent to this object.
// This will create a property that will automatically assign ownership
// of the chit to the parent if it's assigned (and remove it from any outlet
// that it was previously assigned to)
//
export function ChildOutlet(...args: any): any {
  const [cls, key, prop] = args;
  if (!cls.__childOutlets) {
    Object.defineProperty(cls, "__childOutlets", {
      enumerable: false,
      value: {},
    });
  }
  cls.__childOutlets[key] = prop;
  return {};
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
      Object.keys(obj.__orderedOutlets).forEach((key: string) => {
        if (!(instance as any)[key]) {
          Object.defineProperty(instance, key, {
            enumerable: true,
            value: new OrderedOutlet(key, instance),
          });
        }
      });
    }
  }
}
