/**
 * Static property holding a class's serialized type name (`__chitType` / `__buttonType`).
 *
 * Bundlers may rename classes (minification, or `Card` → `Card2` to avoid collisions), so
 * `constructor.name` is not stable across builds. Setting this on a class pins the name that
 * gets written to saved state, and it must match that class's key in `chitLibrary` / `buttonLibrary`.
 */
export const TYPE_NAME_KEY = "__typeName";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClass = abstract new (...args: any[]) => unknown;

/**
 * Pin the serialized type name for a chit or button class.
 *
 * ```ts
 * setTypeName(Card, "Card");
 * ```
 */
export function setTypeName(ctor: AnyClass, name: string) {
  Object.defineProperty(ctor, TYPE_NAME_KEY, { value: name, writable: true, configurable: true, enumerable: false });
}

/**
 * The serialized type name for a class: its own pinned `__typeName`, else `constructor.name`.
 *
 * Only an *own* property counts. Statics are inherited, so a subclass that wasn't stamped
 * must not report its parent's name.
 */
export function typeNameOf(ctor: AnyClass): string {
  if (Object.prototype.hasOwnProperty.call(ctor, TYPE_NAME_KEY)) {
    return (ctor as any)[TYPE_NAME_KEY];
  }
  return ctor.name;
}

/** `typeNameOf` for an instance. */
export function typeNameOfInstance(instance: object): string {
  return typeNameOf(Object.getPrototypeOf(instance).constructor);
}
