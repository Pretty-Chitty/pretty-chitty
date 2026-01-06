import { Easing, Tween } from "@tweenjs/tween.js";
import { BuiltItem } from "./BuiltItem";
import { MAX_SNAP_DURATION, SNAP_DURATION_MULTIPLIER } from "./constants";

export class AnimationController {
  public dirty = false;
  private tween: Tween<{ x: number }> | undefined;
  private offsetX = 0;
  private tweenDuration = 250;

  private min = 0;
  private max = 0;

  // TODO: this should be centering the items
  // setItemCount(w:number,h:number count: number, itemsPerPage: number, itemWidth: number, itemSpacing: number) {
  //   this.max = w/2;
  //   this.min = -(count - Math.min(count, itemsPerPage)) * (itemWidth + itemSpacing) - w/2;

  // }

  getOffsetX(): number {
    return this.offsetX;
  }

  isAnimating(): boolean {
    return this.tween !== undefined;
  }

  get exitTweenDuration() {
    return this.tweenDuration;
  }
  get enterTweenDuration() {
    return this.tweenDuration;
  }
  get changeIndexTweenDuration() {
    return this.tweenDuration;
  }

  setTweenDuration(duration: number) {
    this.tweenDuration = duration;
  }

  stop() {
    this.tween?.stop();
    this.tween = undefined;
  }

  pan(
    deltaX: number,
    animate: boolean,
    items: BuiltItem[],
    itemsPerPage: number,
    itemWidth: number,
    itemSpacing: number,
    w: number,
  ) {
    const max = 0;
    const min = -(items.length - Math.min(items.length, itemsPerPage)) * (itemWidth + itemSpacing);

    this.stop();
    this.dirty = true;

    if (!animate) {
      this.applyPanOffset(deltaX, max, min, w, items);
    } else {
      this.animatePanToNearest(deltaX, max, min, itemWidth, itemSpacing, items);
    }
  }

  private applyPanOffset(delta: number, max: number, min: number, w: number, items: BuiltItem[]) {
    this.offsetX += delta;
    this.offsetX = Math.max(min - w / 2, Math.min(max + w / 2, this.offsetX));
    items.forEach((item) => {
      item.baseOffsetX = this.offsetX;
    });
  }

  private animatePanToNearest(
    delta: number,
    max: number,
    min: number,
    itemWidth: number,
    itemSpacing: number,
    items: BuiltItem[],
  ) {
    let target = this.offsetX + delta;
    const itemIndex = Math.round(target / (itemWidth + itemSpacing));
    target = itemIndex * (itemWidth + itemSpacing);
    target = Math.max(min, Math.min(max, target));

    const duration = 0.0001 + Math.min(MAX_SNAP_DURATION, SNAP_DURATION_MULTIPLIER * Math.abs(target - this.offsetX));

    this.tween = new Tween({ x: this.offsetX })
      .onUpdate(({ x }) => {
        this.dirty = true;
        this.offsetX = x;
        items.forEach((item) => {
          item.baseOffsetX = x;
        });
      })
      .easing(Easing.Quadratic.Out)
      .to({ x: target }, duration)
      .onComplete(() => {
        this.tween = undefined;
      })
      .start();
  }

  update(): boolean {
    let changed = this.dirty;

    if (this.tween) {
      this.tween.update();
      changed = true;
    }
    this.dirty = false;

    return changed;
  }
}
