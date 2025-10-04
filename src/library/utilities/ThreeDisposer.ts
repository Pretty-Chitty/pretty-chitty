type References<V> = {
  uuid: string;
  inUse: boolean;
  unusedSince: number;
  ref: V;
};

export class ThreeDisposer<V> {
  constructor(private cleanup: (v: V) => void) {}

  private references: { [uuid: string]: References<V> } = {};
  private changeCallback?: () => void;

  public notifyChange(_uuid: string) {
    if (this.changeCallback) {
      this.changeCallback();
    }
  }

  public register(uuid: string, ref: V) {
    this.references[uuid] = {
      uuid,
      inUse: false,
      unusedSince: Date.now(),
      ref,
    };
  }

  public markUsedMap(uuidMap: Map<string, V>, cb: () => void) {
    uuidMap.forEach((ref, uuid) => {
      if (!this.references[uuid]) {
        this.register(uuid, ref);
      }
    });
    this.markUsed(new Set(uuidMap.keys()), cb);
  }

  public markUsed(uuids: Set<string>, cb: () => void) {
    const now = Date.now();
    this.changeCallback = cb;

    // Mark all references as unused first
    Object.values(this.references).forEach((ref) => {
      if (ref.inUse) {
        ref.inUse = false;
        ref.unusedSince = now;
      }
    });

    // Mark currently used references as used
    uuids.forEach((uuid) => {
      const ref = this.references[uuid];
      if (ref) {
        ref.inUse = true;
      }
    });

    // Clean up unused references after 5 seconds
    Object.values(this.references).forEach((ref) => {
      if (!ref.inUse && ref.unusedSince < now - 5000) {
        this.cleanup(ref.ref);
        delete this.references[ref.uuid];
      }
    });
  }
}
