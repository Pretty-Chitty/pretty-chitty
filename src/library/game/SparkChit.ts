import { RefObject } from "react";
import { Chit } from "./Chit";
import { Vector2 } from "three";
import { NonEditable } from "../utilities/Annotations";
import { PlayerChit } from "./PlayerChit";
import StaticChitTypeRegistry from "./StaticChitTypeRegistry";
import { setTypeName } from "./typeName";
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

  /**
   * Whether a change to this spark, while its panel is out of view, marks the panel as changed (so the layout may
   * slide to it), as `ChitRenderSpec.worthSlidingToPanelToShowChange` does for a chit on the table. Override to
   * return false for a number that changes often during other panels' actions (money earned on every sale).
   */
  public get worthSlidingToPanelToShowChange(): boolean {
    return true;
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

setTypeName(SparkChit, "SparkChit");
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
