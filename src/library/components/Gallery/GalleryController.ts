import { Object3D } from "three";
import { GameTheme } from "../../game/GameTheme";
import { SceneWrapper } from "../../rendering/outline";
import { TextureReferenceCounterRootGroup } from "../../rendering/TextureReferenceCounter";
import { GalleryItem, GallerySizeConfig, SummaryMode } from "./types";
import { CameraManager } from "./CameraManager";
import { LayoutManager } from "./LayoutManager";
import { AnimationController } from "./AnimationController";
import { BuiltItem } from "./BuiltItem";

export class GalleryController implements TextureReferenceCounterRootGroup {
  private cameraManager: CameraManager;

  private items: BuiltItem[] = [];
  private leavingItems: BuiltItem[] = [];

  private layoutManager: LayoutManager;
  private animationController: AnimationController;

  private zFactor = 3;

  constructor(
    public sceneWrapper: SceneWrapper,
    private theme: GameTheme,
    offsetAngle: number,
    fov: number,
  ) {
    this.cameraManager = new CameraManager(sceneWrapper.scene, offsetAngle, fov);
    this.layoutManager = new LayoutManager(theme);
    this.animationController = new AnimationController();
  }

  dirty = false;
  markHasChange(): void {
    this.dirty = true;
  }

  get camera() {
    return this.cameraManager.camera;
  }

  get showSummary(): SummaryMode {
    return this.layoutManager.getSummaryMode();
  }

  set showSummary(value: SummaryMode) {
    this.layoutManager.setSummaryMode(value);
  }

  setTweenDuration(duration: number) {
    this.animationController.setTweenDuration(duration);
  }

  getRootGroup(): Object3D {
    return this.sceneWrapper.scene;
  }

  setSize(config: GallerySizeConfig) {
    this.zFactor = config.zFactor;
    this.items.forEach((item) => item.setZFactor(this.zFactor));

    this.layoutManager.setDimensions(config.w, config.h);
    this.layoutManager.setBaseItemDimensions(config.itemWidth, config.itemHeight, config.itemSpacing);

    this.cameraManager.setAspect(config.w, config.h);
    this.cameraManager.updateCameraZDistance(config.w);
    this.cameraManager.setupFogAndClipping(config.w);
    this.cameraManager.updateCameraPosition(0);

    this.pan(0, true);
  }

  isAnimating() {
    return this.animationController.isAnimating();
  }

  getItemAtPosition(x: number, y: number): GalleryItem | null {
    const { w } = this.layoutManager.getDimensions();
    const { w: itemWidth } = this.layoutManager.getItemDimensions();
    const { frontStageWidth, itemSpacing } = this.layoutManager.getStageDimensions();
    const paddingX = (w - frontStageWidth) / 2;
    const index = (-this.animationController.getOffsetX() + x - paddingX) / (itemWidth + itemSpacing);

    const item = this.items.find((item) => index > item.getIndex() && Math.abs(index - item.getIndex()) < 1);
    if (!item) {
      return null;
    }

    if (index - item.getIndex() > 1 - itemSpacing / (itemWidth + itemSpacing)) {
      return null;
    }

    if (!item.raycastHitsItem(this.cameraManager.camera, x, y)) {
      return null;
    }

    return item.getGalleryItem();
  }

  render(): boolean {
    let changed = this.dirty;

    while (this.layoutManager.dirty) {
      changed = true;
      this.items.forEach((item) => item.layoutDirty());
      this.layoutManager.dirty = false;

      const newMaxHeight =
        this.items.length === 0
          ? this.layoutManager.getSummaryMaxHeight()
          : Math.max(...this.items.map((item) => item.getSummaryHeight()));

      this.layoutManager.setSummaryMaxHeight(newMaxHeight);
    }

    changed = this.animationController.update() || changed;

    this.items.forEach((item) => {
      changed = item.update() || changed;
    });

    this.leavingItems.forEach((item) => {
      changed = true;
      item.update();
    });

    this.dirty = false;
    return changed;
  }

  pan(deltaX: number, animate = false) {
    const { w } = this.layoutManager.getDimensions();
    const { itemsPerPage, itemSpacing } = this.layoutManager.getStageDimensions();
    const { w: itemWidth } = this.layoutManager.getItemDimensions();
    this.animationController.pan(deltaX, animate, this.items, itemsPerPage, itemWidth, itemSpacing, w);
  }

  setItems(items: GalleryItem[]) {
    const prevItemCount = this.items.length;
    if (items.length > 0) {
      this.layoutManager.setItemDimensions(items);
      this.layoutManager.setItemCount(items.length);
    }

    const itemLookup = this.items.reduce(
      (acc, item) => {
        acc[item.id] = item;
        return acc;
      },
      {} as { [id: string]: BuiltItem },
    );
    const seenIds = new Set<string>(this.items.map((item) => item.id));

    const newItems: BuiltItem[] = [];
    const reorderedItems: BuiltItem[] = [];
    items.forEach((item, i) => {
      seenIds.delete(item.id);

      const existingItem = itemLookup[item.id];
      if (existingItem) {
        reorderedItems.push(existingItem);
      } else {
        const newItem = new BuiltItem(
          this.layoutManager,
          this.animationController,
          item,
          this.sceneWrapper,
          i,
          this.theme,
        );
        newItem.setZFactor(this.zFactor);
        reorderedItems.push(newItem);
        newItems.push(newItem);
      }
    });

    const itemsToDelete = this.items.filter((item) => seenIds.has(item.id));
    itemsToDelete.forEach((item) => {
      this.leavingItems.push(item);
      item.remove(() => {
        this.leavingItems.splice(this.leavingItems.indexOf(item), 1);
      });
    });

    this.items = reorderedItems;
    this.items.forEach((item, i) => {
      item.setIndex(i);
    });

    // TODO: this is wrong-ish
    this.cameraManager.updateCameraPosition(0);

    const currentItemCount = this.items.length;
    if (currentItemCount !== prevItemCount && !this.animationController.isAnimating()) {
      this.pan(0, true);
    }
  }

  destroy() {
    [...this.items, ...this.leavingItems].forEach((item) => item.destroy());
    this.items = [];
    this.leavingItems = [];
  }
}
