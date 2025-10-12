import { RefObject } from "react";
import { Chit } from "./Chit";
import { Vector2 } from "three";
import { NonEditable } from "../utilities/Annotations";
import { PlayerChit } from "./PlayerChit";
import StaticChitTypeRegistry from "./StaticChitTypeRegistry";
import { IUpdatingCanvas } from "../utilities/IUpdatingCanvas";

export class SparkChit extends Chit {
  /** @internal */
  @NonEditable type = "spark";

  public get color() {
    if (this._boundPlayer) {
      return this._boundPlayer.color ?? "#ffffff";
    }
    return super.color;
  }
  public set color(newColor: string) {
    super.color = newColor;
  }

  public get icon(): IUpdatingCanvas | undefined {
    if (this._boundPlayer) {
      return this._boundPlayer.icon;
    }
    return undefined;
  }

  public get headerIcon(): IUpdatingCanvas | undefined {
    return this.icon;
  }

  /** @internal */
  @NonEditable public element: RefObject<HTMLElement> | undefined;

  private _value: number = 0;
  public get value() {
    return this._value;
  }
  public set value(newValue: number) {
    this._value = newValue;
    if (this._boundPlayer) {
      this._boundPlayer.matchScoreNumber = newValue;
    }
  }

  private _boundPlayer?: PlayerChit;
  public bindToPlayer(p: PlayerChit) {
    this._boundPlayer = p;
    p.matchScoreNumber = this.value;
  }

  public get width() {
    return 40;
  }

  /** @internal */
  public override screenCoordinates() {
    const rect = this.element?.current?.getBoundingClientRect();
    return new Vector2(rect?.left, rect?.top);
  }

  /** @internal */
  public canRender() {
    return false;
  }
}

StaticChitTypeRegistry["SparkChit"] = SparkChit;

export abstract class BagSparkChit<T extends Chit> extends SparkChit {
  /** @internal */
  override get value() {
    return this.orderedChildren.length;
  }
  /** @internal */
  override set value(newValue: number) {
    // do nothing?
  }

  public pop() {
    if (this.orderedChildren.length) {
      const result = this.orderedChildren.pop();
      return result as T;
    }
  }

  /** @internal */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override shouldRenderChild(childChit: Chit): boolean {
    return false;
  }
}
