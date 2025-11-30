import { RefObject } from "react";
import { Chit } from "./Chit";
import { Vector2 } from "three";
import { NonEditable } from "../utilities/Annotations";
import { PlayerChit } from "./PlayerChit";
import StaticChitTypeRegistry from "./StaticChitTypeRegistry";
import { IUpdatingCanvas } from "../utilities/IUpdatingCanvas";

export class SparkChit extends Chit {
  @NonEditable $internal_type = "spark";

  public get endGameLabel() {
    return "Score";
  }

  private _color: string = "#ffffff";
  public get color() {
    if (this._boundPlayer) {
      return this._boundPlayer.color ?? "#ffffff";
    }
    return this._color;
  }
  public set color(newColor: string) {
    this._color = newColor;
  }

  public get icon(): IUpdatingCanvas | undefined {
    if (this._boundPlayer) {
      return this._boundPlayer.icon;
    }
    return undefined;
  }

  public get headerIcon(): IUpdatingCanvas | undefined {
    if (this._boundPlayer) {
      return undefined;
    }
    return this.icon;
  }

  @NonEditable public $internal_element: RefObject<HTMLElement> | undefined;

  private _value: number = 0;
  public get value() {
    return this._value;
  }
  public set value(newValue: number) {
    this._value = newValue;
    if (this._boundPlayer) {
      this._boundPlayer.$internal_matchScoreNumber = newValue;
    }
  }

  private _boundPlayer?: PlayerChit;
  public bindToPlayer(p: PlayerChit) {
    this._boundPlayer = p;
    p.$internal_matchScoreNumber = this.value;
  }

  public get width() {
    return 40;
  }

  public override $internal_screenCoordinates() {
    const rect = this.$internal_element?.current?.getBoundingClientRect();
    return new Vector2(rect?.left, rect?.top);
  }

  public $internal_canRender() {
    return false;
  }
}

StaticChitTypeRegistry["SparkChit"] = SparkChit;

export abstract class BagSparkChit<T extends Chit> extends SparkChit {
  override get value() {
    return this.orderedChildren.length;
  }
  override set value(newValue: number) {
    // do nothing?
  }

  public pop() {
    if (this.orderedChildren.length) {
      const result = this.orderedChildren.pop();
      return result as T;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override shouldRenderChild(childChit: Chit): boolean {
    return false;
  }
}
