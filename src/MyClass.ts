import { Vector3 } from 'three';

import { NonEditable } from './library';

export function Logger() {
  return function (target: any, propertyKey: string) {
    let value = 0;

    const getter = () => {
      console.log(`Getting value of ${String(propertyKey)}: ${value}`);
      return value;
    };

    const setter = (newValue: any) => {
      console.log(`Setting value of ${String(propertyKey)} to: ${newValue}`);
      value = newValue;
    };

    Object.defineProperty(target, `__${propertyKey}`, {
      get: getter,
      set: setter,
      enumerable: true,
      configurable: true,
    });
  };
}

export class MyClass {
  @Logger()
  counter: number;

  @NonEditable
  otherThing = 5;

  constructor() {
    this.counter = 0;
  }

  findYourVector3() {
    return Vector3;
  }
}
