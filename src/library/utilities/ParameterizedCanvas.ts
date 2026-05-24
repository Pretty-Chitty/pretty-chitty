import { ReactNode } from "react";

import { IUpdatingCanvas } from "./IUpdatingCanvas";
import { CanvasStack } from "./CanvasStack/CanvasStack";
import { ObjectWithProps } from "./ObjectWithProps";
import { NonEditable } from "./Annotations";
import { unwrapCanvasNode } from "./CanvasStack/ReactCanvas";
import { LayeredCanvasOperation } from "./CanvasStack/CanvasOperations";

export abstract class ParameterizedCanvas extends ObjectWithProps {
  // only remove items from the lru where there is no texture built on it.

  /** @internal */
  static lu: { [key: string]: IUpdatingCanvas } = {};

  /** @internal */
  static counter = 1;

  @NonEditable width = 100;
  @NonEditable height = 100;

  private signature(): string {
    const proto = Object.getPrototypeOf(this);
    const constructor = proto.constructor;

    // handle hot reloading - or the old class instance will be cached
    if (!proto.counter) {
      proto.counter = ++ParameterizedCanvas.counter;
    }

    const keySpace = constructor.name;
    return `${keySpace}___${proto.counter}___${this.width}___${this.height}___${this.props
      .map((prop) => {
        const v = (this as any)[prop];
        if (v instanceof Object) {
          return JSON.stringify(v);
        }
        return v;
      })
      .join("___")}`;
  }

  protected get mipLevels(): number | undefined {
    return undefined;
  }

  get(): IUpdatingCanvas {
    const signature = this.signature();
    let result = ParameterizedCanvas.lu[signature];
    if (!result) {
      ParameterizedCanvas.resize();
      result = ParameterizedCanvas.lu[signature] = (() => {
        try {
          const ops = this.render();
          return new CanvasStack(this.width, this.height, unwrapCanvasNode(ops), this.mipLevels);
        } catch (e) {
          console.error(e);
          return new CanvasStack(this.width, this.height, new LayeredCanvasOperation([]));
        }
      })();
    }
    return result;
  }

  private static resize() {
    const entries = Object.entries(ParameterizedCanvas.lu);
    if (entries.length % 10 === 0) {
      entries.forEach(([sig, value]) => {
        if (!value.hasBuiltTexture && value.createdAt < Date.now() - 5000) {
          ParameterizedCanvas.lu[sig].dispose();
          delete ParameterizedCanvas.lu[sig];
        }
      });
    }
  }

  get material() {
    return this.get().material;
  }

  protected abstract render(): ReactNode;
}
