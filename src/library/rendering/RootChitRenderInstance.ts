import { Tween, Group as TweenGroup } from "@tweenjs/tween.js";
import { ChitRenderInstance } from "./ChitRenderInstance";
import { Chit } from "../game/Chit";
import { Box3, Group, Object3D, Plane, Raycaster, Vector2, Vector3 } from "three";
import { CameraWrapperPerspective } from "./CameraWrapperPerspective";
import { LightWrapper } from "./LightWrapper";
import { ModalState } from "../game/ModalState";
import { GalleryItemSource } from "../components/GalleryViewer";
import { chitsToGalleryItems } from "../utilities/GalleryItemConversion";
import { GalleryItemRawSource } from "../game/GalleryItemRawSource";
import { CameraSpec } from "./CameraSpec";
import { SceneWrapper } from "./outline";
import { TextureReferenceCounter, TextureReferenceCounterRootGroup } from "./TextureReferenceCounter";

export type AnimationState = "leaving" | "entering" | "pending" | "inactive";

//
// Like a ChitRenderInstance, but only useful at the root
// contains threejs high level stuff like lights, cameras and tween controls
//
export class RootChitRenderInstance extends ChitRenderInstance implements TextureReferenceCounterRootGroup {
  private _sceneWrapper = new SceneWrapper();
  public _rootGroup = new Group();
  public _lightGroup = new Group();
  private _tweenGroup = new TweenGroup();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public convertCameraSpaceToScreenSpace = (x: number, y: number): Vector2 | undefined => {
    return;
  };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public convertScreenSpaceToCameraSpace = (x: number, y: number): Vector2 | undefined => {
    return;
  };

  private _width: number = 1;
  private _height: number = 1;

  public get width() {
    return this._width;
  }
  public get height() {
    return this._height;
  }

  /** @internal */
  public get sceneWrapper() {
    return this._sceneWrapper;
  }

  /** @internal */
  public playerId?: string;

  public cameraWrapper = new CameraWrapperPerspective(this);
  public lightWrapper = new LightWrapper();

  constructor(chit: Chit) {
    super(chit);
    TextureReferenceCounter.registerInstance(this);
    this._sceneWrapper.scene.add(this.rootGroup);
    this.id = chit.id ?? `${Date.now()}_${Math.random()}`;
    this.bboxGroup.visible = false;
    this._tweenGroup.update(0); // make it so initial tweens finish right away?
    this.handleHierarchy();
    this.group.position.y = 0;
  }

  private _notifyTimeout?: NodeJS.Timeout;
  protected override notifyBoundingBoxChanged(): void {
    if (this._notifyTimeout) {
      return;
    }

    this._notifyTimeout = setTimeout(() => {
      this._notifyTimeout = undefined;
      // find our bounds
      const bbox = new Box3();
      this.bboxGroup.updateWorldMatrix(false, true);

      const recurse = (obj: Object3D) => {
        if (obj.children.length > 0) {
          obj.children.forEach(recurse);
        } else if (obj.scale.length() > 0) {
          bbox.expandByObject(obj);
        }
      };
      recurse(this.bboxGroup);

      if (Number.isFinite(bbox.max.x)) {
        this.cameraWrapper.adjust(bbox);
        this.lightWrapper.adjust(bbox);
        this.markDirty();
      }
    }, 0);
  }

  public dirty = false;
  markDirty() {
    this.dirty = true;
  }

  resetDirty() {
    if (this.dirty) {
      TextureReferenceCounter.update();
      this.dirty = false;
    }
  }

  private modalState?: ModalState;
  public setup(modalState: ModalState) {
    this.init();
    this.modalState = modalState;
  }

  public override checkPreDestroy() {
    // nothing to do.
    return false;
  }

  public get camera() {
    return this.cameraWrapper.camera;
  }

  public setSize(w: number, h: number) {
    if (this._width !== w || this._height !== h) {
      this._width = w;
      this._height = h;
      this.cameraWrapper.setSize(w, h);
      this.lightWrapper.setSize(w, h);
      this.dirty = true;
    }
  }

  private _cbs: (() => void)[] = [];
  private _totalPauseDuration = 0;
  private _pausedAt = 0;
  private _isPaused = false;
  private _hasPendingChanges = true;
  private _hasChitsLeaving = false;
  private _hasChitsEntering = true;

  public onPanelStatusChange(cb: () => void) {
    this._cbs.push(cb);
    return () => (this._cbs = this._cbs.filter((c) => c !== cb));
  }
  private notifyPanelStatusChange() {
    this._cbs.forEach((cb) => cb());
  }

  public get paused() {
    return this._isPaused;
  }

  public get animationState(): AnimationState {
    if (this._hasChitsLeaving) {
      return "leaving";
    }
    if (this._hasChitsEntering) {
      return "entering";
    }
    if (this._hasPendingChanges) {
      return "pending";
    }
    return "inactive";
  }

  public pause() {
    if (!this._isPaused) {
      this._isPaused = true;
      this._pausedAt = performance.now();
      this.notifyPanelStatusChange();
    }
  }

  public resume() {
    if (this._isPaused) {
      this._isPaused = false;
      this._totalPauseDuration += performance.now() - this._pausedAt;
      this.notifyPanelStatusChange();
    }
  }

  public resetMarks() {
    if (this._hasChitsEntering || this._hasChitsLeaving || this._hasPendingChanges) {
      this._hasPendingChanges = false;
      this._hasChitsEntering = false;
      this._hasChitsLeaving = false;
      this.notifyPanelStatusChange();
    }
  }

  public markHasPendingChange() {
    if (!this._hasPendingChanges) {
      this._hasPendingChanges = true;
      this.notifyPanelStatusChange();
      this.sceneWrapper.markDirty();
    }
  }

  public markHasChitsLeaving() {
    if (!this._hasChitsLeaving) {
      this._hasChitsLeaving = true;
      this.notifyPanelStatusChange();
      this.sceneWrapper.markDirty();
    }
  }

  public markHasChitsEntering() {
    if (!this._hasChitsEntering) {
      this._hasChitsEntering = true;
      this.notifyPanelStatusChange();
      this.sceneWrapper.markDirty();
    }
  }

  public markHasChange() {
    this.sceneWrapper.markDirty();
  }

  getRootGroup(): Object3D {
    return this.rootGroup;
  }

  protected get now() {
    const n = performance.now();
    return n - this._totalPauseDuration - (this._isPaused ? n - this._pausedAt : 0);
  }

  public update(background = false) {
    if (this._isPaused) {
      return false;
    }
    if (this._tweenGroup) {
      const hasChange = this._tweenGroup.update(this.now);
      if (!background && !hasChange && (this._hasPendingChanges || this._hasChitsEntering || this._hasChitsLeaving)) {
        this._hasPendingChanges = false;
        this._hasChitsEntering = false;
        this._hasChitsLeaving = false;
        this.notifyPanelStatusChange();
      }

      if (this._sceneWrapper.isDirty()) {
        return true;
      }

      return hasChange;
    }
    return false;
  }

  public override destroy() {
    TextureReferenceCounter.unregisterInstance(this);
    this.lightWrapper.destroy();
    this.cameraWrapper.destroy();
    clearTimeout(this._notifyTimeout);
    this._sceneWrapper.dispose();
    super.destroy();
  }

  public set wireframes(newValue: boolean) {
    this.bboxGroup.visible = newValue;
  }

  private _animationSpeedMultiplier = 0.0001;
  public get animationSpeedMultiplier(): number {
    return this._animationSpeedMultiplier;
  }
  public set animationSpeedMultiplier(newValue: number) {
    this._animationSpeedMultiplier = newValue;
    this.zeroTween();
  }

  protected override handleHierarchy() {
    // if called from superclass constructor...
    if (!this._rootGroup) {
      return;
    }

    this._rootGroup.add(this.group);
    this._rootGroup.add(this.bboxGroup);
    this._rootGroup.add(this.lightWrapper.group);

    let camera = this.renderSpec?.camera;
    if (!camera) {
      camera = new CameraSpec();
    }
    camera.extraPaddingTop = this.paddingTop;

    this.cameraWrapper.setCameraSpec(camera);
    this.lightWrapper.setLightSpec(this.renderSpec?.lightSpec);
  }

  private paddingTop = 0;
  public setPaddingTop(paddingTop: number) {
    this.paddingTop = paddingTop;
    this.refresh();
    this.dirty = true;
  }

  public get tweenGroup(): TweenGroup | undefined {
    return this._tweenGroup;
  }
  public get rootGroup(): Group {
    return this._rootGroup;
  }

  public override get rootRenderInstance(): RootChitRenderInstance {
    return this;
  }

  public createRenderSpec() {
    const result = super.createRenderSpec();
    if (this.chit.game?.renderDefaultRootChit) {
      this.chit.game?.renderDefaultRootChit(result);
    }
    return result;
  }

  public createTween<T extends Record<string, any>>(props: T, cb: (tween: Tween<T>) => void): Tween<T> {
    const tween = new Tween<T>(props, this._tweenGroup);
    cb(tween);
    tween.start(this.now);
    return tween;
  }

  private findEligibleRenderInstances(
    filter: (c: Chit) => boolean,
    x: number,
    y: number,
    distance: number,
    precision: number,
  ): Chit[] {
    const result = new Map<Chit, number>();
    const chitRenderInstances: ChitRenderInstance[] = [];
    const threeJsToChitLookup: { [threejsId: number]: Chit } = {};

    this.chit.walk((c) => {
      if (filter(c) && c.renderInstance) {
        chitRenderInstances.push(c.renderInstance);
        threeJsToChitLookup[c.renderInstance.clickbox.id] = c;

        // if this is a "gallery" render instance, no need to check its children for clicks
        if (c.renderInstance?.absorbsClickEventsForChildren) {
          return false;
        }
      }
      return true;
    });

    const PI2 = Math.PI * 2;
    for (let r = 0; r <= distance; r += precision) {
      const circumference = PI2 * r;

      for (let steps = 0; steps <= circumference; steps += precision) {
        const angle = (steps / (circumference + 0.0001)) * PI2;
        let vector = new Vector3(
          ((x + r * Math.cos(angle)) / this._width) * 2 - 1,
          -((y + r * Math.sin(angle)) / this._height) * 2 + 1,
          0.5,
        );
        vector = vector.unproject(this.camera);

        const raycaster = new Raycaster(this.camera.position, vector.sub(this.camera.position).normalize());
        const intersects = raycaster.intersectObjects(
          chitRenderInstances.map((c) => c.clickbox),
          true,
        );

        for (let i = 0; i < intersects.length; i++) {
          const id = intersects[i].object.id;
          const c = threeJsToChitLookup[id];
          if (filter(c)) {
            result.set(c, Math.min(result.get(c) ?? r, r));
          }
        }
      }
    }
    return [...result.keys()];
  }

  public handleClick(x: number, y: number, distance: number, precision: number) {
    const chits = this.findEligibleRenderInstances((c) => !!c.onClick, x, y, distance, precision);

    if (chits.length > 0) {
      if (this.modalState && chits.length >= 2) {
        const items = chitsToGalleryItems(chits);
        if (items.length >= 2) {
          items.forEach((item) => {
            const orig = item.onClick;
            if (orig) {
              item.onClick = () => {
                orig();
                if (this.modalState) {
                  this.modalState.gallerySource.value = undefined;
                  this.modalState.inlineGallerySource.value = undefined;
                }
              };
            }
          });
          this.modalState.gallerySource.value = new GalleryItemRawSource(items);
          return;
        }
      }

      const chit = chits[0];
      if (chit && chit.onClick) {
        chit.onClick();
      }
    }
  }

  public handleBeginDrag(x: number, y: number, distance: number, precision: number) {
    const chits = this.findEligibleRenderInstances((c) => !!c.onDrag, x, y, distance, precision);
    if (chits.length > 0) {
      const chit = chits[0];
      return chit;
    }
  }

  public handleLongClick(x: number, y: number, distance: number, precision: number) {
    const chits = this.findEligibleRenderInstances(
      (c) => !!c.renderInstance?.showDetailsOnLongPress(),
      x,
      y,
      distance,
      precision,
    );
    if (this.modalState && chits.length > 0) {
      const items = chitsToGalleryItems(chits);
      this.modalState.gallerySource.value = new GalleryItemRawSource(items);
    }
  }

  public showGallery(source: GalleryItemSource, inline = false) {
    if (this.modalState) {
      const s = inline ? this.modalState.inlineGallerySource : this.modalState.gallerySource;
      s.value = source;
      return () => {
        if (this.modalState!.inlineGallerySource.value === source) {
          this.modalState!.inlineGallerySource.value = undefined;
        }
        if (this.modalState!.gallerySource.value === source) {
          this.modalState!.gallerySource.value = undefined;
        }
      };
    }
    return () => {};
  }
  public hideGallery(source: GalleryItemSource) {
    if (this.modalState && this.modalState.gallerySource.value === source) {
      this.modalState.gallerySource.value = undefined;
    }
    if (this.modalState && this.modalState.inlineGallerySource.value === source) {
      this.modalState.inlineGallerySource.value = undefined;
    }
  }

  public handleZoom(x: number, y: number, dz: number, animate: boolean) {
    this.cameraWrapper.handleZoom(x, y, dz, animate);
    this.markDirty();
  }

  public handlePan(dx: number, dy: number) {
    this.cameraWrapper.handlePan(dx, dy);
    this.markDirty();
  }

  public get cameraZoom() {
    return this.cameraWrapper.zoom;
  }

  public attemptToFindPlaneZ0OfScreenPoints(screenX: number, screenY: number): Vector3 | undefined {
    const screenCoordsOfNewLocation = new Vector2(screenX, screenY);
    if (!this.convertScreenSpaceToCameraSpace) {
      return undefined;
    }

    // find the current screen coordinates of its new home and map it to "camera space"
    const cameraSpace = this.convertScreenSpaceToCameraSpace(screenCoordsOfNewLocation.x, screenCoordsOfNewLocation.y);

    if (!cameraSpace) {
      return;
    }

    const scale = this.camera.zoom;
    if (!Number.isFinite(scale) || scale === 0) {
      return undefined;
    }

    let multiplier = scale > 1 ? 1 : 1 / scale;

    // figure out what camera space means at Z=0
    for (; multiplier > 0.11; multiplier *= 0.75) {
      const raycaster = new Raycaster();
      raycaster.setFromCamera(new Vector2(cameraSpace.x * multiplier, cameraSpace.y * multiplier), this.camera);
      const planeZ = new Plane(new Vector3(0, 0, 1), 0);
      const intersection = new Vector3();
      const intersects = raycaster.ray.intersectPlane(planeZ, intersection);
      if (intersects) {
        return intersects;
      }
    }
  }

  public attemptToFindPlaneZ0OfCanvasPoints(canvasX: number, canvasY: number): Vector3 | undefined {
    const cameraSpace = new Vector2((canvasX / this._width) * 2 - 1, (-canvasY / this._height) * 2 + 1);

    const scale = this.camera.zoom;
    if (!Number.isFinite(scale) || scale === 0) {
      return undefined;
    }

    let multiplier = scale > 1 ? 1 : 1 / scale;

    // figure out what camera space means at Z=0
    for (; multiplier > 0.11; multiplier *= 0.75) {
      const raycaster = new Raycaster();
      raycaster.setFromCamera(new Vector2(cameraSpace.x * multiplier, cameraSpace.y * multiplier), this.camera);
      const planeZ = new Plane(new Vector3(0, 0, 1), 0);
      const intersection = new Vector3();
      const intersects = raycaster.ray.intersectPlane(planeZ, intersection);
      if (intersects) {
        return intersects;
      }
    }
  }

  // override this stuff - we are never going to a new viewer
  protected override moveToNewViewer(): void {}
  protected override detach() {}
  protected override shouldMoveToNewViewer(): boolean {
    return false;
  }
}
