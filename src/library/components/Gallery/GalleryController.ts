import { Box3, Object3D, Raycaster, Vector3 } from "three";
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

  private effectiveItemHeight = 0;
  private maxSummaryHeight = 0;
  private zFactor = 3;
  private lastItemWidth = 0;

  constructor(
    public sceneWrapper: SceneWrapper,
    private theme: GameTheme,
    offsetAngle: number,
    fov: number,
  ) {
    this.cameraManager = new CameraManager(sceneWrapper.scene, offsetAngle, fov);
    this.layoutManager = new LayoutManager();
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
    // return this.summaryRenderer.showSummary;
    return "full";
  }

  set showSummary(value: SummaryMode) {
    // this.summaryRenderer.showSummary = value;
  }

  setTweenDuration(duration: number) {
    this.animationController.setTweenDuration(duration);
  }

  getRootGroup(): Object3D {
    return this.sceneWrapper.scene;
  }

  /**
   * Recalculates all dependent layout properties in the correct order:
   * 1. Rebuild summaries if width changed or summaries don't exist
   * 2. Recalculate maxSummaryHeight from rebuilt summaries
   * 3. Recalculate effective item height (bounded by available space after summaries)
   * 4. Rescale all items if dimensions changed
   * 5. Update camera and effective item height
   */
  // private recalculateLayout(widthChanged: boolean) {
  //   const items = this.itemManager.getItems();
  //   if (items.length === 0) {
  //     return;
  //   }

  //   const currentItemWidth = this.layoutManager.getItemWidth();
  //   const currentItemHeight = this.layoutManager.getItemHeight();

  //   // Step 1: Rebuild summaries if width changed or if any item lacks a summary
  //   const needsSummaryRebuild = widthChanged || items.some((item) => item.summaryHeight === 0 && item.item.summary);
  //   if (needsSummaryRebuild) {
  //     items.forEach((item) => {
  //       this.summaryRenderer.updateHelpText(
  //         item,
  //         currentItemWidth,
  //         currentItemHeight,
  //         this.layoutManager.getH(),
  //         this.effectiveItemHeight,
  //       );
  //     });
  //   }

  //   // Step 2: Calculate max summary height
  //   const tallestSummaryHeight = items.length > 0 ? Math.max(...items.map((item) => item.summaryHeight)) : 0;

  //   // Step 3: Calculate effective item height (bounded by available space)
  //   const availableHeight = this.layoutManager.getH() - tallestSummaryHeight - this.layoutManager.getItemSpacing() * 2;
  //   const newEffectiveItemHeight = Math.min(availableHeight, currentItemHeight);

  //   // Step 4: Rescale all items to fit new dimensions
  //   // Use item's maximumWidth if specified, otherwise use the layout's width
  //   // Values are already in scaled/scene units from LayoutManager
  //   items.forEach((item) => {
  //     const maxWidth = item.item.maximumWidth !== undefined ? item.item.maximumWidth : currentItemWidth;

  //     this.itemManager.scaleItem(item, maxWidth, newEffectiveItemHeight);
  //   });

  //   // Step 5: Update effective item height from actual scaled items
  //   const tallestMeshHeight = items.length > 0 ? Math.max(...items.map((item) => item.height)) : 0;
  //   this.effectiveItemHeight = Math.min(tallestMeshHeight, currentItemHeight);

  //   // Step 6: Reposition summaries with final effective height
  //   items.forEach((item) => this.summaryRenderer.repositionSummary(item, this.effectiveItemHeight));

  //   // Step 7: Update camera position and max summary height
  //   if (Math.abs(tallestSummaryHeight - this.maxSummaryHeight) > 0.001) {
  //     this.maxSummaryHeight = tallestSummaryHeight;
  //     this.cameraManager.updateCameraPosition(this.maxSummaryHeight);
  //   }

  //   this.changed = true;
  // }

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

    if (!item.raycastHitsItem(this.cameraManager.camera, x, y, item)) {
      return null;
    }

    return item.getGalleryItem();
  }

  render(): boolean {
    let changed = this.dirty;

    const layoutManagerDirty = this.layoutManager.dirty;
    this.layoutManager.dirty = false;
    if (layoutManagerDirty) {
      this.items.forEach((item) => item.layoutDirty());
    }

    changed = this.animationController.update() || changed;

    this.items.forEach((item) => {
      changed = item.update() || changed;
    });

    this.leavingItems.forEach((item) => {
      changed = true;
      item.update();
    });

    // this.itemManager.getLeavingItems().forEach((item) => {
    //   if (item.enteredTween) {
    //     item.enteredTween.update();
    //     changed = true;
    //   }
    // });

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
    items.forEach((item, i) => {
      seenIds.delete(item.id);

      const existingItem = itemLookup[item.id];
      if (!existingItem) {
        const newItem = new BuiltItem(this.layoutManager, this.animationController, item, this.sceneWrapper, i);
        newItem.setZFactor(this.zFactor);
        this.items.push(newItem);
        newItems.push(newItem);
      }
    });

    const itemsToDelete = this.items.filter((item) => seenIds.has(item.id));
    itemsToDelete.forEach((item) => {
      item.remove();
      this.leavingItems.push(item);
    });

    this.items = this.items.filter((item) => !seenIds.has(item.id));
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
}
