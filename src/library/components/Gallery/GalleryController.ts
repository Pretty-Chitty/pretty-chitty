import { Box3, Object3D, Raycaster, Vector3 } from "three";
import { GameTheme } from "../../game/GameTheme";
import { SceneWrapper } from "../../rendering/outline";
import { TextureReferenaceCounter, TextureReferenceCounterRootGroup } from "../../rendering/TextureReferenceCounter";
import { BuiltItem, GalleryItem, GallerySizeConfig, SummaryMode } from "./types";
import { CameraManager } from "./CameraManager";
import { ItemManager } from "./ItemManager";
import { LayoutManager } from "./LayoutManager";
import { SummaryRenderer } from "./SummaryRenderer";
import { AnimationController } from "./AnimationController";
import { SCALE_FACTOR } from "./constants";

export class GalleryController implements TextureReferenceCounterRootGroup {
  private cameraManager: CameraManager;
  private itemManager: ItemManager;
  private layoutManager: LayoutManager;
  private summaryRenderer: SummaryRenderer;
  private animationController: AnimationController;

  private effectiveItemHeight = 0;
  private maxSummaryHeight = 0;
  private changed = false;
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
    this.itemManager = new ItemManager(sceneWrapper, this.layoutManager.getItemWidth(), this.layoutManager.getItemHeight());
    this.summaryRenderer = new SummaryRenderer(theme);
    this.animationController = new AnimationController();
  }

  get camera() {
    return this.cameraManager.camera;
  }

  get tweenDuration() {
    return this.itemManager.tweenDuration;
  }

  set tweenDuration(value: number) {
    this.itemManager.tweenDuration = value;
  }

  get showSummary(): SummaryMode {
    return this.summaryRenderer.showSummary;
  }

  set showSummary(value: SummaryMode) {
    this.summaryRenderer.showSummary = value;
  }

  getRootGroup(): Object3D {
    return this.sceneWrapper.scene;
  }

  markHasChange(): void {
    this.changed = true;
  }

  setSize(config: GallerySizeConfig) {
    this.zFactor = config.zFactor;
    // Step 1: Calculate basic layout without summary
    this.layoutManager.setSize(config.w, config.h, config.itemWidth, config.itemHeight, config.itemSpacing);
    this.itemManager.setDimensions(this.layoutManager.getItemWidth(), this.layoutManager.getItemHeight());

    this.cameraManager.setAspect(config.w, config.h);
    this.cameraManager.updateCameraZDistance(config.w);
    this.cameraManager.setupFogAndClipping(config.w);

    this.changed = true;

    const itemsToSet = config.items ?? this.itemManager.getItems().map((item) => item.item);
    this.setItems(itemsToSet);
    this.pan(0, true);
  }

  getItemAtPosition(x: number, y: number): GalleryItem | null {
    const paddingX = (this.layoutManager.getW() - this.layoutManager.getFrontStageWidth()) / 2;
    const index =
      (-this.animationController.getOffsetX() + x / SCALE_FACTOR - paddingX) /
      (this.layoutManager.getItemWidth() + this.layoutManager.getItemSpacing());

    const item = this.itemManager.getItems().find((item) => index > item.index && Math.abs(index - item.index) < 1);
    if (!item) {
      return null;
    }

    if (
      index - item.index >
      1 - this.layoutManager.getItemSpacing() / (this.layoutManager.getItemWidth() + this.layoutManager.getItemSpacing())
    ) {
      return null;
    }

    if (!this.raycastHitsItem(x, y, item)) {
      return null;
    }

    return item.item;
  }

  private raycastHitsItem(x: number, y: number, item: BuiltItem): boolean {
    const ndc = new Vector3(
      (x / SCALE_FACTOR / this.layoutManager.getW()) * 2 - 1,
      -(y / SCALE_FACTOR / this.layoutManager.getH()) * 2 + 1,
      0.5,
    );
    ndc.unproject(this.camera);
    const raycaster = new Raycaster(this.camera.position, ndc.sub(this.camera.position).normalize());

    const combinedBox = new Box3().setFromObject(item.mesh);
    if (item.summaryMesh) {
      const summaryBox = new Box3().setFromObject(item.summaryMesh);
      combinedBox.union(summaryBox);
    }

    const hit = raycaster.ray.intersectBox(combinedBox, new Vector3());
    return !!hit;
  }

  render(): boolean {
    let changed = this.changed;

    changed = this.animationController.update() || changed;

    this.itemManager.getItems().forEach((item) => {
      if (item.tween || item.enteredTween) {
        item.tween?.update();
        item.enteredTween?.update();
        changed = true;
      }
    });

    this.itemManager.getLeavingItems().forEach((item) => {
      if (item.enteredTween) {
        item.enteredTween.update();
        changed = true;
      }
    });

    this.changed = false;
    return changed;
  }

  isAnimating(): boolean {
    return this.animationController.isAnimating();
  }

  stop() {
    this.animationController.stop();
  }

  pan(deltaX: number, animate = false) {
    this.changed = true;
    this.animationController.pan(
      deltaX,
      animate,
      this.itemManager.getItems(),
      this.layoutManager.getItemsPerPage(),
      this.layoutManager.getItemWidth(),
      this.layoutManager.getItemSpacing(),
      this.layoutManager.getW(),
      (item) => this.positionItem(item),
    );
  }

  private positionItem(item: BuiltItem) {
    this.animationController.positionItem(
      item,
      this.layoutManager.getFrontStageWidth(),
      this.layoutManager.getItemWidth(),
      this.layoutManager.getItemSpacing(),
      this.layoutManager.getItemsPerPage(),
      this.layoutManager.getH(),
      this.zFactor,
      this.cameraManager.offsetAngle,
    );
  }

  setItems(items: GalleryItem[]) {
    if (!items || items.length === 0) {
      this.itemManager.clear();
      this.updateEffectiveItemHeightAndCamera();
      return;
    }

    this.changed = true;

    const itemIndexOffset = this.layoutManager.calculateItemIndexOffset(items.length);
    const seenIds = new Set<string>(this.itemManager.getItems().map((item) => item.item.id));

    items.forEach((item, i) => {
      seenIds.delete(item.id);

      const existingItem = this.itemManager.getItem(item.id);
      if (!existingItem) {
        this.itemManager.addNewItem(
          item,
          i + itemIndexOffset,
          (builtItem) => this.handleItemUpdate(builtItem),
          (builtItem) => this.positionItem(builtItem),
          (builtItem) => this.updateHelpText(builtItem),
        );
      } else {
        this.itemManager.updateExistingItem(item.id, (builtItem) => this.positionItem(builtItem));
      }
    });

    this.itemManager.removeItems(seenIds, (item) => this.positionItem(item));
    this.itemManager.updateItemIndices(items, itemIndexOffset, (item) => this.positionItem(item));

    const currentItemCount = this.itemManager.getItems().length;
    if (currentItemCount !== items.length && !this.animationController.isAnimating()) {
      this.pan(0, true);
    }

    this.updateEffectiveItemHeightAndCamera();
    this.sceneWrapper.markDirty();
    TextureReferenaceCounter.update();
  }

  private handleItemUpdate(builtItem: BuiltItem) {
    builtItem.group.removeFromParent();
    builtItem.mesh.removeFromParent();
    this.changed = true;

    builtItem.group = new (builtItem.group.constructor as any)();
    this.sceneWrapper.scene.add(builtItem.group);

    this.itemManager.scaleItem(builtItem, builtItem.item.maximumWidth, builtItem.item.maximumHeight);
    this.positionItem(builtItem);
    this.updateHelpText(builtItem);
    this.updateEffectiveItemHeightAndCamera();

    TextureReferenaceCounter.update();
  }

  private updateHelpText(item: BuiltItem) {
    this.summaryRenderer.updateHelpText(
      item,
      this.layoutManager.getItemWidth(),
      this.layoutManager.getItemHeight(),
      this.layoutManager.getH(),
      this.effectiveItemHeight,
    );
  }

  private updateEffectiveItemHeightAndCamera() {
    const items = this.itemManager.getItems();
    const tallestMeshHeight = items.length > 0 ? Math.max(...items.map((item) => item.height)) : 0;
    const newEffectiveItemHeight = Math.min(tallestMeshHeight, this.layoutManager.getItemHeight());

    const heightChanged = Math.abs(newEffectiveItemHeight - this.effectiveItemHeight) > 0.001;
    this.effectiveItemHeight = newEffectiveItemHeight;

    if (heightChanged) {
      items.forEach((item) => this.summaryRenderer.repositionSummary(item, this.effectiveItemHeight));
    }

    // Check if item width changed (requires summary regeneration)
    const currentItemWidth = this.layoutManager.getItemWidth();
    // Only check for changes if lastItemWidth was already set (not on first call)
    const itemWidthChanged = this.lastItemWidth > 0 && Math.abs(currentItemWidth - this.lastItemWidth) > 0.001;
    if (itemWidthChanged && items.length > 0) {
      // Regenerate all summaries with new width
      items.forEach((item) => this.updateHelpText(item));
    }
    // Always update lastItemWidth to track for next time
    this.lastItemWidth = currentItemWidth;

    const tallestSummaryHeight = items.length > 0 ? Math.max(...items.map((item) => item.summaryHeight)) : 0;
    const summaryHeightChanged = Math.abs(tallestSummaryHeight - this.maxSummaryHeight) > 0.001;
    this.maxSummaryHeight = tallestSummaryHeight;

    if (summaryHeightChanged) {
      // maxSummaryHeight is stored in scaled units, convert to unscaled for layoutManager
      const { heightChanged, widthChanged } = this.layoutManager.recalculateItemDimensions(this.maxSummaryHeight * SCALE_FACTOR);
      if (heightChanged || widthChanged) {
        this.itemManager.setDimensions(this.layoutManager.getItemWidth(), this.layoutManager.getItemHeight());
        items.forEach((item) => {
          this.itemManager.scaleItem(item, item.item.maximumWidth, item.item.maximumHeight);
          this.positionItem(item);
        });
      }
    }

    this.cameraManager.updateCameraPosition(this.maxSummaryHeight);
    this.changed = true;
  }
}
