import nextTick from 'next-tick';

export class EventChannel<T> {
  private cbs: ((t: T) => void)[] = [];
  public on(cb: (t: T) => void, notifyImmediate = true) {
    this.cbs.push(cb);

    // it's important to stash the original value otherwise we might the same value 2x in a row to the channel
    const valueToPush = this._value;
    if (notifyImmediate) {
      nextTick(() => cb(valueToPush));
    }

    return () => {
      this.cbs = this.cbs.filter((c) => c !== cb);
    };
  }

  private _triggerTimeout = setTimeout(() => {}, 0);
  public trigger(force = false) {
    clearTimeout(this._triggerTimeout);
    if (force || this.latency === 0) {
      nextTick(() => {
        this.cbs.forEach((cb) => cb(this._value));
      });
    } else {
      this._triggerTimeout = setTimeout(() => {
        this.cbs.forEach((cb) => cb(this._value));
      });
    }
  }

  public force(newValue: T) {
    this._value = newValue;
    this.trigger(true);
  }

  public get value(): T {
    return this._value;
  }
  public set value(newValue: T) {
    if (this._value !== newValue) {
      this._value = newValue;
      this.trigger();
    }
  }

  constructor(
    private _value: T,
    private latency = 0,
  ) {}
}
