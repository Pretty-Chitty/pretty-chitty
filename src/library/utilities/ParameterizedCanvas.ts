import { ReactNode } from "react";

import { IUpdatingCanvas } from "./IUpdatingCanvas";
import { CanvasStack } from "./CanvasStack/CanvasStack";
import { ObjectWithProps } from "./ObjectWithProps";
import { NonEditable } from "./Annotations";
import { unwrapCanvasNode } from "./CanvasStack/ReactCanvas";
import { LayeredCanvasOperation } from "./CanvasStack/CanvasOperations";

export abstract class ParameterizedCanvas extends ObjectWithProps {
  // only remove items from the lru where there is no texture built on it.

  static $internal_lu: { [key: string]: IUpdatingCanvas } = {};

  static $internal_counter = 1;

  @NonEditable width = 100;
  @NonEditable height = 100;

  private signature(): string {
    const proto = Object.getPrototypeOf(this);
    const constructor = proto.constructor;

    // handle hot reloading - or the old class instance will be cached
    if (!proto.counter) {
      proto.counter = ++ParameterizedCanvas.$internal_counter;
    }

    const keySpace = constructor.name;
    return `${keySpace}___${proto.counter}___${this.width}___${this.height}___${this.$internal_props
      .map((prop) => {
        const v = (this as any)[prop];
        if (v instanceof Object) {
          return JSON.stringify(v);
        }
        return v;
      })
      .join("___")}`;
  }

  get(): IUpdatingCanvas {
    const signature = this.signature();
    let result = ParameterizedCanvas.$internal_lu[signature];
    if (!result) {
      ParameterizedCanvas.resize();
      result = ParameterizedCanvas.$internal_lu[signature] = (() => {
        try {
          const ops = this.render();
          return new CanvasStack(this.width, this.height, unwrapCanvasNode(ops));
        } catch (e) {
          console.error(e);
          return new CanvasStack(this.width, this.height, new LayeredCanvasOperation([]));
        }
      })();
    }
    return result;
  }

  private static resize() {
    const entries = Object.entries(ParameterizedCanvas.$internal_lu);
    if (entries.length % 10 === 0) {
      entries.forEach(([sig, value]) => {
        if (!value.hasBuiltTexture && value.createdAt < Date.now() - 5000) {
          ParameterizedCanvas.$internal_lu[sig].dispose();
          delete ParameterizedCanvas.$internal_lu[sig];
        }
      });
    }
  }

  get material() {
    return this.get().material;
  }

  protected abstract render(): ReactNode;
}
