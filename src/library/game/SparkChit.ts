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

  public get endGameLabel() {
    return "Score";
  }

  private myColor: string = "#ffffff";
  public get color() {
    if (this.boundPlayer) {
      return this.boundPlayer.color ?? "#ffffff";
    }
    return this.myColor;
  }
  public set color(newColor: string) {
    this.myColor = newColor;
  }

  public get icon(): IUpdatingCanvas | undefined {
    if (this.boundPlayer) {
      return this.boundPlayer.icon;
    }
    return undefined;
  }

  public get headerIcon(): IUpdatingCanvas | undefined {
    if (this.boundPlayer) {
      return undefined;
    }
    return this.icon;
  }

  /** @internal */
  @NonEditable public element: RefObject<HTMLElement> | undefined;

  private myValue: number = 0;
  public get value() {
    return this.myValue;
  }
  public set value(newValue: number) {
    this.myValue = newValue;
    if (this.boundPlayer) {
      this.boundPlayer.matchScoreNumber = newValue;
    }
  }

  private boundPlayer?: PlayerChit;
  public bindToPlayer(p: PlayerChit) {
    this.boundPlayer = p;
    p.matchScoreNumber = this.value;
  }

  public get width() {
    return 40;
  }

  public override screenCoordinates() {
    const rect = this.element?.current?.getBoundingClientRect();
    return new Vector2(rect?.left, rect?.top);
  }

  public canRender() {
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
