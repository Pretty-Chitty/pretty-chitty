import { Box3, Group, Vector3 } from "three";
import { Easing, Tween } from "@tweenjs/tween.js";
import { BuiltItem, GalleryItem } from "./types";
import { SceneWrapper } from "../../rendering/outline";
import { TextureReferenaceCounter } from "../../rendering/TextureReferenceCounter";
import { SCALE_FACTOR, DEFAULT_TWEEN_DURATION } from "./constants";

export class ItemManager {
  private items: BuiltItem[] = [];
  private leavingItems: BuiltItem[] = [];
  private itemLookup: { [key: string]: BuiltItem } = {};

  public tweenDuration = DEFAULT_TWEEN_DURATION;

  constructor(
    private sceneWrapper: SceneWrapper,
    private itemWidth: number,
    private itemHeight: number,
  ) {}

  getItems(): BuiltItem[] {
    return this.items;
  }

  getLeavingItems(): BuiltItem[] {
    return this.leavingItems;
  }

  setDimensions(itemWidth: number, itemHeight: number) {
    this.itemWidth = itemWidth;
    this.itemHeight = itemHeight;
  }

  scaleItem(item: BuiltItem, maximumWidth?: number, maximumHeight?: number) {
    item.mesh.removeFromParent();
    item.mesh = item.item.createMesh(this.sceneWrapper);

    const box3 = new Box3();
    box3.expandByObject(item.mesh);

    if (!box3.isEmpty()) {
      const size = box3.getSize(new Vector3());
      const center = box3.getCenter(new Vector3());

      const xScale = Math.min(this.itemWidth, (maximumWidth ?? Number.MAX_SAFE_INTEGER) / SCALE_FACTOR) / size.x;
      const yScale = Math.min(this.itemHeight, (maximumHeight ?? Number.MAX_SAFE_INTEGER) / SCALE_FACTOR) / size.y;
      const scale = Math.min(xScale, yScale);

      item.mesh.scale.set(scale, scale, scale);
      item.mesh.updateMatrix();

      item.center = center.multiplyScalar(scale).negate();
      item.center.z = 0;
      item.height = size.y * scale;
      item.depth = size.z * scale;
    }

    item.group.add(item.mesh);
  }

  addNewItem(
    item: GalleryItem,
    index: number,
    onUpdate: (builtItem: BuiltItem) => void,
    onPosition: (builtItem: BuiltItem) => void,
    onUpdateHelpText: (builtItem: BuiltItem) => void,
  ): BuiltItem {
    const builtItem: BuiltItem = {
      item,
      enteredAmount: 0,
      mesh: item.createMesh(this.sceneWrapper),
      group: new Group(),
      index,
      center: new Vector3(),
      height: 0,
      depth: 0,
      summaryHeight: 0,
      targetIndex: index,
      unsubscribe: item.registerUpdateHandler(() => onUpdate(builtItem)),
    };

    this.itemLookup[item.id] = builtItem;
    this.scaleItem(builtItem, item.maximumWidth, item.maximumHeight);

    builtItem.mesh.removeFromParent();
    builtItem.group.removeFromParent();
    builtItem.group.add(builtItem.mesh);
    this.sceneWrapper.scene.add(builtItem.group);

    onPosition(builtItem);
    onUpdateHelpText(builtItem);
    this.animateItemEntry(builtItem, onPosition);

    return builtItem;
  }

  updateExistingItem(itemId: string, onPosition: (builtItem: BuiltItem) => void) {
    const item = this.itemLookup[itemId];
    if (!item) return;

    this.scaleItem(item, item.item.maximumWidth, item.item.maximumHeight);
    onPosition(item);
  }

  private animateItemEntry(builtItem: BuiltItem, onPosition: (builtItem: BuiltItem) => void) {
    builtItem.enteredTween = new Tween({ x: 0 })
      .to({ x: 1 }, this.tweenDuration)
      .easing(Easing.Quadratic.Out)
      .onUpdate((obj) => {
        builtItem.enteredAmount = obj.x;
        onPosition(builtItem);
      })
      .onComplete(() => {
        onPosition(builtItem);
        builtItem.enteredTween = undefined;
      })
      .start();
  }

  removeItems(itemIds: Set<string>, onPosition: (builtItem: BuiltItem) => void) {
    itemIds.forEach((id) => {
      const item = this.itemLookup[id];
      if (!item) return;

      item.unsubscribe();
      delete this.itemLookup[id];
      this.leavingItems.push(item);

      item.enteredTween?.stop();

      item.enteredTween = new Tween({ x: item.enteredAmount })
        .to({ x: 0 }, this.tweenDuration)
        .easing(Easing.Quadratic.In)
        .onUpdate((obj) => {
          item.enteredAmount = obj.x;
          onPosition(item);
        })
        .onComplete(() => {
          item.enteredTween = undefined;
          item.mesh.parent?.remove(item.mesh);
          this.leavingItems = this.leavingItems.filter((i) => i !== item);
        })
        .start();
    });
  }

  updateItemIndices(items: GalleryItem[], itemIndexOffset: number, onPosition: (builtItem: BuiltItem) => void) {
    this.items = items.map((item) => this.itemLookup[item.id]);

    this.items.forEach((item, index) => {
      if (!item) return;

      item.tween?.stop();

      if (item.index !== index + itemIndexOffset) {
        item.targetIndex = index + itemIndexOffset;
        this.animateItemIndexChange(item, onPosition);
      }
    });
  }

  private animateItemIndexChange(item: BuiltItem, onPosition: (builtItem: BuiltItem) => void) {
    item.tween = new Tween({ x: item.index })
      .to({ x: item.targetIndex }, this.tweenDuration)
      .easing(Easing.Quadratic.InOut)
      .onUpdate((obj) => {
        item.index = obj.x;
        onPosition(item);
      })
      .onComplete(() => {
        item.tween = undefined;
      })
      .start();
  }

  getItem(itemId: string): BuiltItem | undefined {
    return this.itemLookup[itemId];
  }

  clear() {
    Object.values(this.itemLookup).forEach((item) => {
      item.unsubscribe();
      item.mesh.removeFromParent();
      item.group.removeFromParent();
    });
    this.items = [];
    this.leavingItems = [];
    this.itemLookup = {};
  }
}
