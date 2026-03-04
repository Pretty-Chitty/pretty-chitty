import { Box3, Camera, Group, Mesh, Object3D, PlaneGeometry, Raycaster, Vector3 } from "three";
import { SceneWrapper } from "../../rendering/outline";
import { GalleryItem } from "../GalleryViewer";
import { Easing, Tween } from "@tweenjs/tween.js";
import { UpdateCallback } from "./types";
import { LayoutManager } from "./LayoutManager";
import { AnimationController } from "./AnimationController";
import { ROTATION_DIVISOR } from "./constants";
import { TextureReferenceCounter } from "../../rendering/TextureReferenceCounter";
import { RichTextRenderOptionsParameters } from "../../utilities/CanvasStack/RichTextRenderer";
import { GameTheme } from "../../game/GameTheme";
import {
  ColorCanvasOperation,
  LayeredCanvasOperation,
  MarkdownCanvasOperation,
  PadCanvasOperation,
} from "../../utilities/CanvasStack/CanvasOperations";
import { CanvasStack } from "../../utilities/CanvasStack/CanvasStack";

export class BuiltItem {
  private removing = false;

  public id: string;
  public dirty = true;
  private enteredAmount: number;
  public group: Group;
  private mesh: Object3D;

  // to be implemented soon
  private summaryMesh?: Object3D;
  private summaryHeight: number;

  private center: Vector3;
  private _baseOffsetX: number;
  private offsetAngle = 0;

  private tween?: Tween<{ x: number }>;
  private enterLeaveTween?: Tween<{ y: number }>;

  private unsubscribe: UpdateCallback;

  constructor(
    private layoutManager: LayoutManager,
    private animationController: AnimationController,
    private item: GalleryItem,
    private sceneWrapper: SceneWrapper,
    private index: number,
    private theme: GameTheme,
  ) {
    this.group = new Group();

    this.item = item;
    this.id = item.id;
    this.mesh = new Group();
    this.enteredAmount = 0;
    this.index = index;
    this.center = new Vector3();
    this.summaryHeight = 0;
    this._baseOffsetX = this.animationController.getOffsetX();
    this.unsubscribe = item.registerUpdateHandler(() => this.rebuildMesh());

    this.rebuildMesh();
    this.sceneWrapper.scene.add(this.group);
    this.enter();
  }

  getGalleryItem() {
    return this.item;
  }

  getIndex() {
    return this.index;
  }

  getSummaryHeight() {
    return this.summaryHeight;
  }

  public raycastHitsItem(camera: Camera, x: number, y: number): boolean {
    const { w, h } = this.layoutManager.getDimensions();
    const ndc = new Vector3((x / w) * 2 - 1, -(y / h) * 2 + 1, 0.5);
    ndc.unproject(camera);
    const raycaster = new Raycaster(camera.position, ndc.sub(camera.position).normalize());

    const combinedBox = new Box3().setFromObject(this.mesh);
    if (this.summaryMesh) {
      const summaryBox = new Box3().setFromObject(this.summaryMesh);
      combinedBox.union(summaryBox);
    }

    const hit = raycaster.ray.intersectBox(combinedBox, new Vector3());
    return !!hit;
  }

  setIndex(newIndex: number) {
    if (this.tween) {
      this.tween.stop();
    }
    this.tween = new Tween({ x: this.index })
      .to({ x: newIndex }, this.animationController.changeIndexTweenDuration)
      .easing(Easing.Quadratic.InOut)
      .onUpdate((obj) => {
        this.index = obj.x;
        this.dirty = true;
      })
      .onComplete(() => {
        this.tween = undefined;
      })
      .start();
  }

  _meshSize = new Vector3(1, 1, 1);
  _meshCenter = new Vector3(0, 0, 0);

  rebuildMesh() {
    this.group.remove(this.mesh);

    this.mesh = this.item.createMesh(this.sceneWrapper);
    const box3 = new Box3();
    box3.expandByObject(this.mesh);
    if (!box3.isEmpty()) {
      this._meshSize = box3.getSize(new Vector3());
      this._meshCenter = box3.getCenter(new Vector3());
    }

    this.group.add(this.mesh);
    this.scaleMesh();

    this.checkRecreateSummaryMesh();

    TextureReferenceCounter.update();
    this.sceneWrapper.markDirty();
  }

  scaleMesh() {
    const size = this._meshSize;
    const center = this._meshCenter;

    // Scale to fit within the provided dimensions (already in scaled/scene units)
    const { w, h } = this.layoutManager.getItemDimensions();
    const xScale = w / size.x;
    const yScale = h / size.y;
    const scale = Math.min(xScale, yScale);

    this.mesh.scale.set(scale, scale, scale);
    this.mesh.updateMatrix();

    this.center = center.multiplyScalar(scale).negate();
    this.center.z = 0;
  }

  remove(whenDone: () => void) {
    if (this.removing) {
      whenDone();
      return;
    }

    this.unsubscribe();
    this.removing = true;

    if (this.enterLeaveTween) {
      this.enterLeaveTween.stop();
    }
    this.enterLeaveTween = new Tween({ y: this.enteredAmount })
      .to({ y: 0 }, this.animationController.exitTweenDuration)
      .easing(Easing.Quadratic.In)
      .onUpdate((obj) => {
        this.enteredAmount = obj.y;
        this.dirty = true;
      })
      .onComplete(() => {
        this.destroy();
        this.enterLeaveTween = undefined;
        whenDone();
      })
      .start();
  }

  private enter() {
    this.enterLeaveTween = new Tween({ y: this.enteredAmount })
      .to({ y: 1 }, this.animationController.enterTweenDuration)
      .easing(Easing.Quadratic.In)
      .onUpdate((obj) => {
        this.enteredAmount = obj.y;
        this.dirty = true;
      })
      .onComplete(() => {
        this.enterLeaveTween = undefined;
        this.enteredAmount = 1;
        this.dirty = true;
      })
      .start();
  }

  public get baseOffsetX() {
    return this._baseOffsetX;
  }

  public set baseOffsetX(value: number) {
    if (this._baseOffsetX !== value) {
      this._baseOffsetX = value;
      this.dirty = true;
    }
  }

  public update() {
    if (this.tween) {
      this.tween.update();
    }
    if (this.enterLeaveTween) {
      this.enterLeaveTween.update();
    }
    if (this.dirty) {
      this.positionGroup();
      this.dirty = false;
      return true;
    }
    return false;
  }

  public markDirty() {
    this.dirty = true;
  }

  public layoutDirty() {
    this.dirty = true;
    this.scaleMesh();
    this.checkRecreateSummaryMesh();
  }

  private positionGroup() {
    const { frontStageWidth, itemsPerPage, itemSpacing } = this.layoutManager.getStageDimensions();
    const { w: itemWidth, summaryMaxHeight } = this.layoutManager.getItemDimensions();
    const { h } = this.layoutManager.getDimensions();
    const initialOffset = -(frontStageWidth / 2 - itemWidth / 2);
    const targetX = initialOffset + this.index * (itemWidth + itemSpacing) + this._baseOffsetX;

    this.group.position.y =
      (1 - this.enteredAmount) * -h + summaryMaxHeight / 2 + (this.summaryHeight > 0 ? this.theme.spacing / 2 : 0);

    this.group.position.x = targetX;

    const largestX = initialOffset + (itemsPerPage - 1) * (itemWidth + itemSpacing);
    if (targetX > largestX) {
      this.applyOvershootEffect(targetX - largestX, largestX, initialOffset);
      this.repositionSummary(targetX - largestX);
    } else if (targetX < initialOffset) {
      this.applyOvershootEffect(-(initialOffset - targetX), largestX, initialOffset);
      this.repositionSummary(-(initialOffset - targetX));
    } else {
      this.group.position.z = 0;
      this.repositionSummary(0);
    }
  }

  zFactor = 0;
  setZFactor(zFactor: number) {
    if (this.zFactor !== zFactor) {
      this.zFactor = zFactor;
      this.dirty = true;
    }
  }

  private applyOvershootEffect(overshoot: number, largestX: number, initialOffset: number) {
    const absOvershoot = Math.abs(overshoot);
    const sign = Math.sign(overshoot);

    this.group.position.x =
      (overshoot > 0 ? largestX : initialOffset) + sign * Math.pow(absOvershoot, 1 - this.zFactor / 50);
    this.group.position.z = (-absOvershoot / 1.5) * this.zFactor;
    this.group.rotation.y = overshoot / ROTATION_DIVISOR;
    // TODO:
    /// - this.offsetAngle;
  }

  destroy() {
    if (this.enterLeaveTween) {
      this.enterLeaveTween.stop();
      this.enterLeaveTween = undefined;
    }

    this.group.parent?.remove(this.group);
    this.unsubscribe();
    this.removing = true;
    TextureReferenceCounter.update();
    this.sceneWrapper.markDirty();
  }

  //
  // summary crap
  //

  repositionSummary(overshootX: number) {
    if (this.summaryMesh) {
      const summaryHeight = this.summaryHeight;
      const { h } = this.layoutManager.getItemDimensions();
      this.summaryMesh.position.y = -summaryHeight / 2 - h / 2 - this.theme.spacing;
      this.summaryMesh.position.x = (overshootX * this.zFactor) / 3;
    }
  }

  private getSummaryText() {
    if (this.layoutManager.getSummaryMode() === "full") {
      return this.item.summary ?? this.item.shortSummary;
    } else if (this.layoutManager.getSummaryMode() === "partial") {
      return this.item.shortSummary;
    }
    return undefined;
  }

  private getSummaryRenderingOptions(): RichTextRenderOptionsParameters {
    const baseOptions =
      this.layoutManager.getSummaryMode() === "full"
        ? (this.item.summaryRenderingOptions ?? this.item.shortSummaryRenderingOptions)
        : (this.item.shortSummaryRenderingOptions ?? this.item.summaryRenderingOptions);
    return {
      align: "center",
      color: this.theme.dialogForegroundColor,
      fontSize: this.theme.dialogFontSize * window.devicePixelRatio,
      fontFamily: this.theme.fontFamily,
      ...baseOptions,
    };
  }

  private _lastSummaryMeshWidth = 0;
  private checkRecreateSummaryMesh() {
    const { w: itemWidth } = this.layoutManager.getItemDimensions();
    if (this._lastSummaryMeshWidth !== itemWidth) {
      this.createHelpText();
      this._lastSummaryMeshWidth = itemWidth;
    }
  }

  private createHelpText() {
    // Remove old summary mesh if it exists
    if (this.summaryMesh) {
      this.summaryMesh.removeFromParent();
      this.summaryMesh = undefined;
    }

    const summary = this.getSummaryText();
    if (!summary) {
      this.summaryHeight = 0;
      return;
    }

    const renderingOptions = this.getSummaryRenderingOptions();
    const summaryMesh = this.createSummaryMesh(summary, renderingOptions);

    this.summaryMesh = summaryMesh;
    this.group.add(summaryMesh);
  }

  private createSummaryMesh(summary: string, specs: RichTextRenderOptionsParameters): Mesh {
    const { w: itemWidth, h: itemHeight } = this.layoutManager.getItemDimensions();
    const pad =
      this.layoutManager.getSummaryMode() === "full"
        ? this.theme.spacing * window.devicePixelRatio
        : this.theme.spacing * 0.5 * window.devicePixelRatio;

    const markdown = new MarkdownCanvasOperation(summary, this.item.summaryIconMap ?? {}, specs);
    const ops = new LayeredCanvasOperation([
      new ColorCanvasOperation(this.theme.gallerySummaryBackgroundColor, this.theme.gallerySummaryBackgroundOpacity),
      new PadCanvasOperation({ top: pad, bottom: pad, left: pad, right: pad }, markdown),
    ]);

    // Calculate the maximum available height for the summary
    const height = itemHeight * 2; // arbitrary large height to allow text to flow

    // First pass: render with full height to let text flow and calculate actual size
    const stack1 = new CanvasStack(itemWidth * window.devicePixelRatio, height * window.devicePixelRatio, ops);
    stack1.render();

    // Second pass: render with actual measured height for final material
    const stack2 = new CanvasStack(itemWidth * window.devicePixelRatio, markdown.height + pad * 2, ops);
    stack2.render();

    const material = stack2.material;
    material.transparent = true;
    material.depthWrite = true;

    const finalHeight = stack2.height / window.devicePixelRatio;
    this.summaryHeight = finalHeight;

    const geometry = new PlaneGeometry(itemWidth, finalHeight);
    const mesh = new Mesh(geometry, material);
    return mesh;
  }
}
