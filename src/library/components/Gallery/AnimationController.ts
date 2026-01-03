import { Easing, Tween } from "@tweenjs/tween.js";
import { BuiltItem } from "./types";
import { SCALE_FACTOR, MAX_SNAP_DURATION, SNAP_DURATION_MULTIPLIER, ROTATION_DIVISOR } from "./constants";

export class AnimationController {
  private tween: Tween<{ x: number }> | undefined;
  private offsetX = 0;

  getOffsetX(): number {
    return this.offsetX;
  }

  isAnimating(): boolean {
    return this.tween !== undefined;
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
    onPositionItem: (item: BuiltItem) => void,
  ) {
    const max = 0;
    const min = -(items.length - Math.min(items.length, itemsPerPage)) * (itemWidth + itemSpacing);

    this.stop();

    if (!animate) {
      this.applyPanOffset(deltaX / SCALE_FACTOR, max, min, w, items, onPositionItem);
    } else {
      this.animatePanToNearest(deltaX / SCALE_FACTOR, max, min, itemWidth, itemSpacing, items, onPositionItem);
    }
  }

  private applyPanOffset(
    delta: number,
    max: number,
    min: number,
    w: number,
    items: BuiltItem[],
    onPositionItem: (item: BuiltItem) => void,
  ) {
    this.offsetX += delta;
    this.offsetX = Math.max(min - w / 2, Math.min(max + w / 2, this.offsetX));
    items.forEach((item) => onPositionItem(item));
  }

  private animatePanToNearest(
    delta: number,
    max: number,
    min: number,
    itemWidth: number,
    itemSpacing: number,
    items: BuiltItem[],
    onPositionItem: (item: BuiltItem) => void,
  ) {
    let target = this.offsetX + delta;
    const itemIndex = Math.round(target / (itemWidth + itemSpacing));
    target = itemIndex * (itemWidth + itemSpacing);
    target = Math.max(min, Math.min(max, target));

    const duration = 0.0001 + Math.min(MAX_SNAP_DURATION, SNAP_DURATION_MULTIPLIER * Math.abs(target - this.offsetX));

    this.tween = new Tween({ x: this.offsetX })
      .onUpdate(({ x }) => {
        this.offsetX = x;
        items.forEach((item) => onPositionItem(item));
      })
      .easing(Easing.Quadratic.Out)
      .to({ x: target }, duration)
      .onComplete(() => {
        this.tween = undefined;
      })
      .start();
  }

  positionItem(
    item: BuiltItem,
    frontStageWidth: number,
    itemWidth: number,
    itemSpacing: number,
    itemsPerPage: number,
    h: number,
    zFactor: number,
    offsetAngle: number,
  ) {
    const initialOffset = -(frontStageWidth / 2 - itemWidth / 2);
    const targetX = initialOffset + item.index * (itemWidth + itemSpacing) + this.offsetX;

    item.group.position.x = targetX * item.enteredAmount;
    item.group.position.y = (1 - item.enteredAmount) * -(h / 2);

    const largestX = initialOffset + (itemsPerPage - 1) * (itemWidth + itemSpacing);

    if (item.group.position.x > largestX) {
      this.applyOvershootEffect(item, item.group.position.x - largestX, largestX, initialOffset, zFactor, offsetAngle);
    } else if (item.group.position.x < initialOffset) {
      this.applyOvershootEffect(item, -(initialOffset - item.group.position.x), largestX, initialOffset, zFactor, offsetAngle);
    } else {
      this.resetItemPosition(item, offsetAngle);
    }

    item.group.position.add(item.center);
  }

  private applyOvershootEffect(
    item: BuiltItem,
    overshoot: number,
    largestX: number,
    initialOffset: number,
    zFactor: number,
    offsetAngle: number,
  ) {
    const absOvershoot = Math.abs(overshoot);
    const sign = Math.sign(overshoot);

    item.group.position.x =
      (overshoot > 0 ? largestX : initialOffset) + sign * Math.pow(absOvershoot, 1 - zFactor / 50);
    item.group.position.z = -absOvershoot * zFactor;
    item.group.rotation.x = -absOvershoot / (ROTATION_DIVISOR / SCALE_FACTOR) - offsetAngle;

    if (item.summaryMesh) {
      item.summaryMesh.position.x = sign * absOvershoot * zFactor;
      item.summaryMesh.position.z = -absOvershoot * zFactor;
    }
  }

  private resetItemPosition(item: BuiltItem, offsetAngle: number) {
    if (item.summaryMesh) {
      item.summaryMesh.position.x = 0;
      item.summaryMesh.position.z = 0;
    }
    item.group.position.z = 0;
    item.group.rotation.x = -offsetAngle;
  }

  update(): boolean {
    let changed = false;

    if (this.tween) {
      this.tween.update();
      changed = true;
    }

    return changed;
  }
}
