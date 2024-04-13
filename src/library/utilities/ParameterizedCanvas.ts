import { ReactNode } from "react";

import { ParameterizedMemoized } from "./ParameterizedMemoized";
import { IUpdatingCanvas } from "./IUpdatingCanvas";
import { CanvasStack } from "./CanvasStack/CanvasStack";
import { ObjectWithProps } from "./ObjectWithProps";
import { NonEditable } from "./Annotations";
import { unwrapCanvasNode } from "./CanvasStack/ReactCanvas";

export abstract class ParameterizedCanvas extends ObjectWithProps {
  /** @internal */
  static lu = new ParameterizedMemoized<IUpdatingCanvas>();

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
    return `${keySpace}___${proto.counter}___${this.width}___${this.height}___${this.props.map((prop) => (this as any)[prop]).join("___")}`;
  }

  get(): IUpdatingCanvas {
    const signature = this.signature();
    return ParameterizedCanvas.lu.get(signature, () => {
      const ops = this.render();
      return new CanvasStack(this.width, this.height, unwrapCanvasNode(ops));
    });
  }

  protected abstract render(): ReactNode;
}
