import {
  Box3,
  BoxGeometry,
  Euler,
  FrontSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  Plane,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  Shape,
  Vector2,
  Vector3,
} from "three";
import { Chit } from "../game/Chit";
import { ChitRenderSpec, OwnerOriginPosition } from "./ChitRenderSpec";
import { Easing, Tween, Group as TweenGroup } from "@tweenjs/tween.js";
import { RootChitRenderInstance } from "./RootChitRenderInstance";
import { OutlineCanvas } from "../utilities/OutlineCanvas";
import { outlineGeometry } from "../utilities/OutlineGeometry";
import { fixBbox } from "../utilities/BboxUtils";
import { ChitGalleryItemInstance } from "./ChitGalleryItemInstance";

const LINE_COLOR = new MeshBasicMaterial({ color: 0xff0000, wireframe: true, wireframeLinewidth: 2 });
const CLICK_LINE_COLOR = new MeshBasicMaterial({ color: 0xffff00, wireframe: true, wireframeLinewidth: 2 });
const BOX_GEO = new BoxGeometry(1, 1, 1);

interface Point2d {
  x: number;
  y: number;
}
interface Point3d {
  x: number;
  y: number;
  z: number;
}
interface PointZ {
  z: number;
}

class DestroyedError extends Error {}

export class ChitRenderInstance {
  private static ID_COUNTER = 0;
  protected id: string;

  // rendering info
  protected renderSpec: ChitRenderSpec | null = null;

  // threejs info
  public group = new Group(); // group storing the visible meshes.  Will tween
  protected anchorPoints = new Map<OwnerOriginPosition | string, Group>();

  protected sizeX = 0;
  protected sizeY = 0;
  protected sizeZ = 0;

  protected centerX = 0;
  protected centerY = 0;
  protected centerZ = 0;

  protected innateObjectZ = 0;
  protected innateOrnamentZs: number[] = [];

  protected bboxGroup = new Group(); // group storing bounding boxes.  Will not tween.  Usually not visible.
  protected bboxAnchorPoints = new Map<OwnerOriginPosition | string, Group>();
  public bbox = new Mesh(BOX_GEO, LINE_COLOR);
  public clickbox = new Mesh(BOX_GEO, CLICK_LINE_COLOR);
  protected isUsingSyntheticBbox = false;

  protected parentRenderInstance?: ChitRenderInstance;
  protected childrenRenderInstances: ChitRenderInstance[] = [];

  // tween info
  protected rotationTween = new Tween<Point3d>({ x: 0, y: 0, z: 0 });
  protected offsetTween = new Tween<Point2d>({ x: 0, y: 0 });
  protected zOffsetTween = new Tween<PointZ>({ z: 0 });

  private unsubscribeToOnChange = () => {};

  constructor(public chit: Chit) {
    this.id = `cri${++ChitRenderInstance.ID_COUNTER}`;
    this.group.visible = false;

    this.log("Render instance on owning chit is attached");
    chit.renderInstance = this;

    // handle refreshes.
    const cb1 = chit.onChange("deserialized parent", () => {
      try {
        this.refresh();
        this.rootRenderInstance.markHasPendingChange();
      } catch (e) {
        if (e instanceof DestroyedError) {
          // eat it
        } else {
          throw e;
        }
      }
    });

    const cb2 = chit.onChange("onClick", () => {
      this.refresh();
    });
    this.unsubscribeToOnChange = () => {
      cb1();
      cb2();
    };

    this.handleHierarchy();

    // start it from where it should be - be it a spark chit or a bag or an old parent chit
    const positionEntranceChit = chit.lastParent ?? chit.parentFallback;
    if (this.rootRenderInstance) {
      const oldParent = this.group.parent;
      const intersection = this.attemptToFindPlaneZ0(this.rootRenderInstance, positionEntranceChit);
      if (intersection && oldParent) {
        this.group.removeFromParent();
        this.group.position.set(intersection.x, intersection.y, intersection.z);
        oldParent.attach(this.group);
      }
    }

    this.bboxGroup.add(this.bbox);
    this.bboxGroup.add(this.clickbox);
  }

  public get effectiveParent() {
    return this.chit.parent ?? this.chit.parentFallback;
  }

  private log(message: string) {
    if (localStorage.verbose) {
      console.log(`${new Date().getTime()} [ChitRenderInstance] ${this.chit} ${this.id} ${message}`);
    }
  }

  public init() {
    this.log("init");
    this.chit.children.forEach((child) => {
      if (child.canRender()) {
        if (!child.renderInstance) {
          this.log(`Found child to init: ${child.id}`);
          const c = new ChitRenderInstance(child);
          c.init();

          // move the new render instance immediately to where it belongs
          this.zeroTween();
        } else {
          child.renderInstance.refresh();
        }
      }
    });

    this.refresh();
  }

  zeroTween() {
    this.offsetTween.duration(0);
    this.zOffsetTween.duration(0);
    this.rotationTween.duration(0);
  }

  public galleryRotation() {
    if (this.renderSpec) {
      return new Vector3(
        this.renderSpec.galleryRotateX,
        this.renderSpec.galleryRotateY,
        this.renderSpec.galleryRotateZ,
      );
    }
    return new Vector3(0, 0, 0);
  }

  public childAdded(chit: Chit, existingRenderInstance?: ChitRenderInstance) {
    if (existingRenderInstance?.rootRenderInstance === this.rootRenderInstance) {
      return;
    }

    if (!chit.canRender()) {
      return;
    }

    const c = new ChitRenderInstance(chit);
    this.rootRenderInstance.markHasChitsEntering();

    if (existingRenderInstance) {
      const refreshParent = (chitRenderInstance: ChitRenderInstance) => {
        if (chitRenderInstance.parentRenderInstance) {
          refreshParent(chitRenderInstance.parentRenderInstance);
        }
        chitRenderInstance.refresh();
      };
      refreshParent(existingRenderInstance);
    }

    // initializing before the existing renderer has a chance to remove itself will possibly cause weird behavior
    // for attached children chits
    c.init();
  }

  public get absorbsClickEventsForChildren() {
    return this.renderSpec?.isShowingChildrenAsGallery ?? false;
  }

  public get tweenGroup(): TweenGroup | undefined {
    return this.parentRenderInstance?.tweenGroup;
  }
  public get rootGroup(): Group | undefined {
    return this.parentRenderInstance?.rootGroup;
  }

  public invalidateRootRenderInstance() {
    this._rootRenderInstance = undefined;
    this.childrenRenderInstances.forEach((child) => child.invalidateRootRenderInstance());
  }

  private _rootRenderInstance?: RootChitRenderInstance;
  public get rootRenderInstance(): RootChitRenderInstance {
    if (this._rootRenderInstance) {
      return this._rootRenderInstance;
    }
    if (!this.parentRenderInstance) {
      this.destroy();
      throw new DestroyedError("Must have parent");
    }
    return (this._rootRenderInstance = this.parentRenderInstance?.rootRenderInstance);
  }

  public get parentGroup(): Group | undefined {
    return this.parentRenderInstance?.group ?? this.rootGroup;
  }
  public get parentBboxGroup(): Group | undefined {
    return this.parentRenderInstance?.bboxGroup ?? this.rootGroup;
  }

  public get animationSpeedMultiplier(): number {
    return this.parentRenderInstance?.animationSpeedMultiplier ?? 1;
  }

  public anchor(ownerPosition: OwnerOriginPosition | string): Group {
    let result = this.anchorPoints.get(ownerPosition);
    if (!result) {
      result = new Group();
      this.updateGroupPosition(result, ownerPosition);
      this.group.add(result);
      this.anchorPoints.set(ownerPosition, result);
    }
    return result;
  }

  public bboxAnchor(ownerPosition: OwnerOriginPosition | string): Group {
    let result = this.bboxAnchorPoints.get(ownerPosition);
    if (!result) {
      result = new Group();
      this.updateGroupPosition(result, ownerPosition);
      this.bboxGroup.add(result);
      this.bboxAnchorPoints.set(ownerPosition, result);
    }
    return result;
  }

  protected setOutletPosition(positionKey: string, position: Vector3) {
    this.anchor(positionKey).position.set(position.x, position.y, position.z);
    this.bboxAnchor(positionKey).position.set(position.x, position.y, position.z);
  }

  protected updateGroupPosition(group: Group, position: OwnerOriginPosition | string) {
    const z = this.sizeZ + (this.renderSpec?.childrenOffsetZ ?? 0);
    switch (position) {
      case OwnerOriginPosition.TopLeft: {
        group.position.set(-this.sizeX / 2, this.sizeY / 2, z);
        break;
      }
      case OwnerOriginPosition.TopCenter: {
        group.position.set(0, this.sizeY / 2, z);
        break;
      }
      case OwnerOriginPosition.TopRight: {
        group.position.set(this.sizeX / 2, this.sizeY / 2, z);
        break;
      }
      case OwnerOriginPosition.MiddleLeft: {
        group.position.set(-this.sizeX / 2, 0, z);
        break;
      }
      case OwnerOriginPosition.MiddleCenter: {
        group.position.set(0, 0, z);
        break;
      }
      case OwnerOriginPosition.MiddleRight: {
        group.position.set(this.sizeX / 2, 0, z);
        break;
      }
      case OwnerOriginPosition.BottomLeft: {
        group.position.set(-this.sizeX / 2, -this.sizeY / 2, z);
        break;
      }
      case OwnerOriginPosition.BottomCenter: {
        group.position.set(0, -this.sizeY / 2, z);
        break;
      }
      case OwnerOriginPosition.BottomRight: {
        group.position.set(this.sizeX / 2, -this.sizeY / 2, z);
        break;
      }
      // named strings --- they will reset the position correctly later (or not if they aren't set and then this will be correct)
      default: {
        group.position.set(0, 0, z);
        break;
      }
    }
  }

  private _galleryItem?: ChitGalleryItemInstance;
  public createGalleryItem(item: ChitGalleryItemInstance) {
    if (this._galleryItem === item) {
      return;
    }

    this.destroyGalleryItem();
    this._galleryItem = item;
  }

  get currentGalleryItem() {
    return this._galleryItem;
  }

  public destroyGalleryItem() {
    if (this._galleryItem) {
      this._galleryItem.destroy();
      this._galleryItem = undefined;
    }
  }

  public destroy() {
    this.log("destroy");
    this.invalidateRootRenderInstance();
    this.unsubscribeToOnChange();
    this.rotationTween.stop();
    this.offsetTween.stop();
    this.zOffsetTween.stop();
    this.group.removeFromParent();
    this.bboxGroup.removeFromParent();
    this.parentRenderInstance?.removeChild(this);
    this.childrenRenderInstances.forEach((child) => {
      if (child.chit.parent === this.chit) {
        child.destroy();
      }
    });
    if (this.chit.renderInstance === this) {
      this.chit.renderInstance = undefined;
    }
  }

  private shouldMoveToNewViewer() {
    if (this.chit.renderInstance !== this) {
      return true;
    }

    const rootRenderInstance = this.rootRenderInstance;
    const targetParentRenderInstance = this.effectiveParent?.renderInstance;
    if (
      rootRenderInstance &&
      targetParentRenderInstance?.rootRenderInstance &&
      rootRenderInstance !== targetParentRenderInstance?.rootRenderInstance
    ) {
      return true;
    }
    return false;
  }

  protected refresh() {
    if (this.checkPreDestroy()) {
      return;
    }

    if (this.shouldMoveToNewViewer()) {
      this.moveToNewViewer();
      return;
    }

    this.rootRenderInstance.markDirty();

    const visibilityBefore = this.group.visible;
    this.fixVisibility();

    if (this.renderSpec) {
      this.group.remove(this.renderSpec.object);
      this.renderSpec.ornaments.forEach((ornament) => this.group.remove(ornament));
    }

    // execute the render
    const renderSpec = this.createRenderSpec();
    this.chit.render(renderSpec);
    this.renderSpec = renderSpec;
    this.innateObjectZ = this.renderSpec.object?.position?.z ?? 0;
    this.innateOrnamentZs = this.renderSpec.ornaments.map((o) => o.position?.z ?? 0);

    // no need to animate anything invisible...
    if (!visibilityBefore && !this.group.visible && !this.chit.lastParent) {
      renderSpec.offsetSpeed = 0;
      renderSpec.rotationSpeed = 0;
    }

    this.handleHierarchy();

    this.updateBoundingBox();

    // update position and rotation
    this.handlePositionAndRotation();

    if (this.chit.onClick) {
      this.createHighlight();
    }

    // now update ourselves
    this.group.add(this.renderSpec.object);
    this.renderSpec.ornaments.forEach((ornament) => this.group.add(ornament));

    this.fixObjectPosition();
    this._galleryItem?.update();
  }

  public screenCoordinates(): Vector2 | undefined {
    const vector = this.bbox.localToWorld(new Vector3());
    vector.project(this.rootRenderInstance.camera);
    const screenCoords = this.rootRenderInstance.convertCameraSpaceToScreenSpace(vector.x, vector.y);
    return screenCoords;
  }

  protected attemptToFindPlaneZ0(rootRenderInstance: RootChitRenderInstance, chit?: Chit): Vector3 | undefined {
    if (rootRenderInstance === chit?.renderInstance?.rootRenderInstance) {
      return chit.renderInstance.group.getWorldPosition(new Vector3());
    }

    const screenCoordsOfNewLocation = chit ? chit.screenCoordinates() : new Vector2(0, 0);
    if (rootRenderInstance && rootRenderInstance.rootGroup && screenCoordsOfNewLocation) {
      // find the current screen coordinates of its new home and map it to "camera space"
      const cameraSpace = rootRenderInstance.convertScreenSpaceToCameraSpace(
        screenCoordsOfNewLocation.x,
        screenCoordsOfNewLocation.y,
      );

      if (!cameraSpace) {
        return;
      }

      const scale = Math.max(Math.abs(cameraSpace.x), Math.abs(cameraSpace.y));
      if (!Number.isFinite(scale) || scale === 0) {
        return undefined;
      }

      let multiplier = scale > 1 ? 1 : 1 / scale;

      // figure out what camera space means at Z=0
      for (; multiplier > 0.11; multiplier *= 0.75) {
        const raycaster = new Raycaster();
        raycaster.setFromCamera(
          new Vector2(cameraSpace.x * multiplier, cameraSpace.y * multiplier),
          rootRenderInstance.camera,
        );
        const planeZ = new Plane(new Vector3(0, 0, 1), 0);
        const intersection = new Vector3();
        const intersects = raycaster.ray.intersectPlane(planeZ, intersection);
        if (intersects) {
          return intersects;
        }
      }
      // return intersection;
    }
  }

  private detach() {
    if (this.chit.renderInstance === this) {
      this.log("detaching");
      this.chit.renderInstance = undefined;
      // this.childrenRenderInstances.forEach((child) => child.detach());
    }

    if (!this.chit.renderInstance && this.effectiveParent?.renderInstance) {
      this.effectiveParent.renderInstance.childAdded(this.chit);

      // TODO: this is okay since adding a child has side effects
      (this.chit.renderInstance as unknown as ChitRenderInstance).zeroTween();
    }
  }

  private _isMovingToNewViewer = false;
  protected moveToNewViewer() {
    if (this._isMovingToNewViewer) {
      return;
    }

    this._isMovingToNewViewer = true;

    this.log("needs to move to a new viewer");

    // no matter what, this instance is going to be useless - we don't want to potentially update mid-destroy
    this.unsubscribeToOnChange();
    this.detach();

    const renderSpec = this.createRenderSpec();
    this.chit.render(renderSpec);
    this.renderSpec = renderSpec;

    if (this.parentRenderInstance?._isMovingToNewViewer) {
      return;
    }

    const rootRenderInstance = this.rootRenderInstance;
    rootRenderInstance.markHasChitsLeaving();

    const rootGroup = this.rootGroup;
    if (rootGroup && rootRenderInstance && renderSpec) {
      let intersection = this.attemptToFindPlaneZ0(rootRenderInstance, this.chit);
      if (!intersection) {
        intersection = this.group.localToWorld(new Vector3(0, rootRenderInstance.cameraWrapper.visibleGameHeight, 0));
        renderSpec.splay.enabled = false;
      }

      rootGroup.attach(this.group);
      // now move the chit to the new "location" and then we can kill it.
      renderSpec.offsetY = intersection.y;
      renderSpec.offsetX = intersection.x;
      this.handlePositionAndRotation();
      this.offsetTween.onComplete(() => this.destroy());
      this.offsetTween = new Tween<Point2d>({ x: 0, y: 0 });
    } else {
      this.destroy();
    }
  }

  protected createHighlight() {
    const highlight = this.renderSpec?.highlight;
    if (!highlight || !this.renderSpec || !highlight.visible) {
      return;
    }

    const group = new Group();
    group.renderOrder = 10;

    const USE_TEXTURE = true;
    if (USE_TEXTURE) {
      const w = highlight.width + this.clickbox.scale.x;
      const h = highlight.width + this.clickbox.scale.y;
      const planeGeometry = new PlaneGeometry(w, h);

      const outline = new OutlineCanvas().set((obj) => {
        const DPI = 250;
        obj.width = w * DPI;
        obj.height = h * DPI;
        obj.lineWidth = highlight.width * DPI;
        obj.innerLineWidth = highlight.innerWidth * DPI;
        obj.outerColor = highlight.color;
        obj.innerColor = highlight.innerColor;
      });

      const face = new MeshBasicMaterial({
        map: outline.get().texture,
        transparent: true,
        depthWrite: true,
        side: FrontSide,
      });

      const m1 = new Mesh(planeGeometry, face);
      m1.position.z = this.clickbox.scale.z + highlight.zOffset;
      m1.position.y = this.clickbox.position.y;
      m1.position.x = this.clickbox.position.x;
      group.add(m1);

      const m2 = new Mesh(planeGeometry, face);
      m2.position.z = -highlight.zOffset;
      m2.position.y = this.clickbox.position.y;
      m2.position.x = this.clickbox.position.x;
      m2.rotateY(Math.PI);
      group.add(m2);
    } else {
      const w = this.clickbox.scale.x / 2;
      const h = this.clickbox.scale.y / 2;

      const mat = new MeshPhongMaterial({ color: highlight.color, side: FrontSide });

      const shape = new Shape();
      shape.moveTo(w, h);
      shape.lineTo(w, -h);
      shape.lineTo(-w, -h);
      shape.lineTo(-w, h);
      const geo = outlineGeometry(shape, this.clickbox.scale.z);
      const m = new Mesh(geo, mat);
      group.add(m);
    }

    this.renderSpec.ornaments.push(group);
  }

  protected createRenderSpec() {
    const renderSpec = new ChitRenderSpec(this.chit);

    // attach theme stuff to the spec as defaults
    renderSpec.highlight.color = this.chit.game?.theme.chitHighlightColor ?? renderSpec.highlight.color;
    renderSpec.highlight.innerColor =
      this.chit.game?.theme.chitInnerHighlightColor ??
      this.chit.game?.theme.chitHighlightColor ??
      renderSpec.highlight.innerColor;

    return renderSpec;
  }

  protected notifyBoundingBoxChanged() {
    this.parentRenderInstance?.notifyBoundingBoxChanged();
    if (this.isUsingSyntheticBbox) {
      this.updateBoundingBox();
    }
  }

  private positionKey(clickBox3: Box3) {
    return [
      !!this.chit.onClick,
      this.parentRenderInstance?.id,
      this.sizeX,
      this.sizeY,
      this.sizeZ,
      this.centerX,
      this.centerY,
      this.centerZ,
      this.renderSpec?.ownerOrigin,
      this.chit.parentOutlet,
      this.chit.parentOutletIndex,
      this.renderSpec?.childrenOffsetZ,
      this.renderSpec?.offsetX,
      this.renderSpec?.offsetY,
      this.renderSpec?.offsetZ,
      this.renderSpec?.rotateX,
      this.renderSpec?.rotateY,
      this.renderSpec?.rotateZ,
      ...clickBox3.min.toArray(),
      ...clickBox3.max.toArray(),
      this.renderSpec?.splay.toString(),
    ].join("___");
  }

  private _lastUpdateBoudingBoxKey: string = "";
  protected updateBoundingBox() {
    if (!this.renderSpec) {
      // bail?
      return;
    }

    const box3 = new Box3();
    box3.expandByObject(this.renderSpec.object);
    const clickBox3 = box3.clone();

    // goofy circumstances where the thing being clicked doesn't have anything to actually highlight - we
    // have to highlight the children (do we care about grandchildren?)
    if (box3.isEmpty() && this.chit.onClick) {
      this.isUsingSyntheticBbox = true;
      this.childrenRenderInstances.forEach((child) => {
        const clone = child.bbox.clone();
        clone.position.add(child.bboxGroup.position); // the child bbox is relative to its own space...
        clickBox3.expandByObject(clone);
      });
    } else {
      this.isUsingSyntheticBbox = false;
    }

    fixBbox(box3);
    fixBbox(clickBox3);

    this.bbox.renderOrder = 5;
    this.sizeX = box3.max.x - box3.min.x;
    this.sizeY = box3.max.y - box3.min.y;
    this.sizeZ = box3.max.z - box3.min.z;

    this.centerX = this.sizeX / 2 + box3.min.x;
    this.centerY = this.sizeY / 2 + box3.min.y;
    this.centerZ = this.sizeZ / 2 + box3.min.z;

    const newKey = this.positionKey(clickBox3);
    const keyChanged = newKey !== this._lastUpdateBoudingBoxKey;
    if (keyChanged) {
      this._lastUpdateBoudingBoxKey = newKey;
      this.bbox.scale.set(this.sizeX, this.sizeY, this.sizeZ);
      this.clickbox.scale.set(
        clickBox3.max.x - clickBox3.min.x,
        clickBox3.max.y - clickBox3.min.y,
        clickBox3.max.z - clickBox3.min.z,
      );

      [...this.anchorPoints.entries()].forEach(([key, value]) => this.updateGroupPosition(value, key));
      [...this.bboxAnchorPoints.entries()].forEach(([key, value]) => this.updateGroupPosition(value, key));

      this.fixObjectPosition();
      this.bbox.position.z = this.centerZ + this.sizeZ / 2;
      this.bbox.position.x = this.centerX;
      this.bbox.position.y = this.centerY;

      this.clickbox.position.z = (clickBox3.max.z - clickBox3.min.z) / 2 + clickBox3.min.z + this.sizeZ / 2;
      this.clickbox.position.x = (clickBox3.max.x - clickBox3.min.x) / 2 + clickBox3.min.x;
      this.clickbox.position.y = (clickBox3.max.y - clickBox3.min.y) / 2 + clickBox3.min.y;

      const targetOffset = { x: this.renderSpec.offsetX, y: this.renderSpec.offsetY, z: this.renderSpec.offsetZ };

      this.handleOffsetForSplay(targetOffset);

      this.bboxGroup.position.set(targetOffset.x, targetOffset.y, targetOffset.z);
      this.bboxGroup.rotation.set(this.renderSpec.rotateX, this.renderSpec.rotateY, this.renderSpec.rotateZ);

      Object.entries(this.renderSpec.outletPositions).forEach(([key, position]) => {
        this.setOutletPosition(key, new Vector3(position.x, position.y, position.z + this.sizeZ));
      });

      if (keyChanged) {
        this.notifyBoundingBoxChanged();
      }
    }
  }

  private fixObjectPosition() {
    if (this.renderSpec?.object) {
      this.renderSpec.object.position.z = this.sizeZ / 2 + this.innateObjectZ;
    }

    // this.renderSpec?.ornaments.forEach(
    //   (ornament, index) =>
    //     (ornament.position.z =
    //       this.sizeZ / 2 + (Number.isFinite(this.innateOrnamentZs[index]) ? this.innateOrnamentZs[index] : 0)),
    // );
  }

  protected addChild(child: ChitRenderInstance) {
    this.log(`Child added: ${child.chit} ${child.id}`);
    this.childrenRenderInstances.push(child);
    if (this._isMovingToNewViewer) {
      this.log("While adding child to myself, I am already moving to a new viewer");
      child.chit.renderInstance = undefined;
      child.detach();
    }
  }

  protected removeChild(child: ChitRenderInstance) {
    this.log("Child removed");
    this.childrenRenderInstances = this.childrenRenderInstances.filter((d) => d !== child);
  }

  private isDestroying = false;
  protected checkPreDestroy() {
    if (!this.chit.parent && !this.isDestroying) {
      this.log("about to destroy, will move off screen");
      this.isDestroying = true;
      this.chit.renderInstance = undefined;
      this.rootGroup?.attach(this.group);
      const { position } = this.group;
      if (!this.group.visible) {
        this.destroy();
        return this.isDestroying;
      }

      // where is this going?
      const positionExitChit = this.chit.parent ?? this.chit.parentFallback;
      const target = {
        x: position.x,
        y: position.y + (this.rootRenderInstance?.cameraWrapper.visibleGameHeight ?? 10),
      };
      let duration = 500;
      if (this.rootRenderInstance) {
        const oldParent = this.group.parent;
        const intersection = this.attemptToFindPlaneZ0(this.rootRenderInstance, positionExitChit);
        if (intersection && oldParent) {
          target.x = intersection.x;
          target.y = intersection.y;

          const distance = Math.sqrt(Math.pow(target.x - position.x, 2) + Math.pow(target.y - position.y, 2));

          duration =
            (this.renderSpec ? this.renderSpec.offsetSpeed : 500) *
            Math.min(this.renderSpec ? this.renderSpec.maxDistanceForSpeed : 10, distance);
        }
      }

      this.offsetTween = this.createTween({ x: position.x, y: position.y }, (tween) =>
        tween
          .to(target, duration)
          .onUpdate((obj) => {
            position.x = obj.x;
            position.y = obj.y;
          })
          .onComplete(() => {
            this.destroy();
          })
          .easing(Easing.Quadratic.In),
      );
      this.offsetTween = new Tween({ x: 0, y: 0 }); // make sure this is not cancellable
    }
    return this.isDestroying;
  }

  protected handleHierarchy() {
    const targetParentRenderInstance = this.effectiveParent?.renderInstance;
    if (this.parentRenderInstance !== targetParentRenderInstance) {
      this.parentRenderInstance?.removeChild(this);
      targetParentRenderInstance?.addChild(this);
      this.parentRenderInstance = targetParentRenderInstance;
    }

    let origin: OwnerOriginPosition | string = OwnerOriginPosition.MiddleCenter;
    if (this.renderSpec) {
      origin =
        this.renderSpec.ownerOrigin === OwnerOriginPosition.Default
          ? (this.chit.parentOutlet ?? OwnerOriginPosition.MiddleCenter)
          : this.renderSpec.ownerOrigin;
    }

    const targetParentGroup = (this.renderSpec && this.parentRenderInstance?.anchor(origin)) ?? this.rootGroup;
    const targetParentBboxGroup = (this.renderSpec && this.parentRenderInstance?.bboxAnchor(origin)) ?? this.rootGroup;

    if (targetParentGroup && this.group.parent !== targetParentGroup) {
      targetParentGroup.attach(this.group); // add works for the outlet not drifting but obviously messes up animations...
    }
    if (targetParentBboxGroup && this.group.parent !== targetParentBboxGroup) {
      targetParentBboxGroup.attach(this.bboxGroup);
    }

    if (!this.parentRenderInstance) {
      this.log("no parent render instance, destroying");
      this.destroy();
    }
  }

  private handleOffsetForSplay(p: Point3d) {
    if (!this.renderSpec) {
      return;
    }

    if (this.chit.parentOutlet && this.chit.parentOutletIndex !== undefined && this.renderSpec.splay.enabled) {
      const splay = this.renderSpec.splay.processSplay(
        this.chit.parentOutletIndex,
        this.sizeX,
        this.sizeY,
        this.sizeZ + this.renderSpec.childrenOffsetZ,
      );
      p.x += splay.x;
      p.y += splay.y;
      p.z += splay.z;
    }
  }

  protected handlePositionAndRotation() {
    if (!this.renderSpec) {
      this.offsetTween.stop();
      this.zOffsetTween.stop();
      this.rotationTween.stop();
      return;
    }

    const { position, rotation } = this.group;
    const targetOffset = { x: this.renderSpec.offsetX, y: this.renderSpec.offsetY, z: this.renderSpec.offsetZ };
    const targetRotation = { x: this.renderSpec.rotateX, y: this.renderSpec.rotateY, z: this.renderSpec.rotateZ };

    this.handleOffsetForSplay(targetOffset);

    let duration = 0;
    let distanceMoved = 0;
    let nonZRotations = 0;
    let offsetEasing: undefined | ((amount: number) => number);
    let rotationEasing: undefined | ((amount: number) => number);

    this.offsetTween.stop();
    this.zOffsetTween.stop();
    this.rotationTween.stop();

    // offset has to change
    if (position.x !== targetOffset.x || position.y !== targetOffset.y || position.z !== targetOffset.z) {
      offsetEasing = this.offsetTween.isPlaying() ? Easing.Quadratic.Out : Easing.Quadratic.InOut;

      distanceMoved = Math.sqrt(
        Math.pow(position.x - targetOffset.x, 2) +
          Math.pow(position.y - targetOffset.y, 2) +
          Math.pow(position.z - targetOffset.z, 2),
      );

      duration = Math.max(
        duration,
        this.renderSpec.offsetSpeed * Math.min(this.renderSpec.maxDistanceForSpeed, distanceMoved),
      );

      this.log("offset tween: " + distanceMoved + " " + duration);
    }

    // rotation has to change
    if (rotation.x !== targetRotation.x || rotation.y !== targetRotation.y || rotation.z !== targetRotation.z) {
      rotationEasing = this.rotationTween.isPlaying() ? Easing.Quadratic.Out : Easing.Quadratic.InOut;

      const radiansDistance = new Quaternion()
        .setFromEuler(rotation)
        .angleTo(new Quaternion().setFromEuler(new Euler(targetRotation.x, targetRotation.y, targetRotation.z)));
      const rotations = Math.min(radiansDistance / (2 * Math.PI), 2 * Math.PI);

      const nonZRadiansDistance = new Quaternion()
        .setFromEuler(new Euler(rotation.x, rotation.y, 0))
        .angleTo(new Quaternion().setFromEuler(new Euler(targetRotation.x, targetRotation.y, 0)));
      nonZRotations = Math.min(nonZRadiansDistance / (2 * Math.PI), 2 * Math.PI);

      duration = Math.max(duration, this.renderSpec.rotationSpeed * rotations);

      this.log("rotation tween: " + nonZRotations + " " + duration);
    }

    if (offsetEasing) {
      // what the heck is this
      if (duration > 1) {
        this.group.visible = true;
      }
      this.offsetTween = this.createTween({ x: position.x, y: position.y }, (tween) =>
        tween
          .to(targetOffset, duration * this.animationSpeedMultiplier)
          .onUpdate((obj) => {
            position.x = obj.x;
            position.y = obj.y;
          })
          .easing(offsetEasing)
          .onComplete(() => this.fixVisibility()),
      );
    }

    if (rotationEasing) {
      rotation.order = "ZYX";
      this.rotationTween = this.createTween({ x: rotation.x, y: rotation.y, z: rotation.z }, (tween) =>
        tween
          .to(targetRotation, duration * this.animationSpeedMultiplier)
          .onUpdate((obj) => {
            rotation.x = obj.x;
            rotation.y = obj.y;
            rotation.z = obj.z;
          })
          .easing(rotationEasing),
      );
    }

    if (offsetEasing || rotationEasing) {
      // pieces look better when they are "lifted" to their location...
      // so we have to do goofy stuff to "lift" it a bit
      const zLiftRatio = this.renderSpec.zLiftRatio;
      const peak = {
        z:
          Math.max(targetOffset.z, position.z) +
          Math.max(distanceMoved * zLiftRatio, nonZRotations * this.renderSpec.zLiftRotationMultiplier),
      };
      this.zOffsetTween = this.createTween({ z: position.z }, (tween) =>
        tween
          .to(peak, (duration / 2) * this.animationSpeedMultiplier)
          .easing(Easing.Quadratic.Out)
          .onUpdate((obj) => {
            position.z = obj.z;
          })
          .chain(
            new Tween({ z: peak.z }, this.tweenGroup)
              .to({ z: targetOffset.z }, (duration / 2) * this.animationSpeedMultiplier)
              .easing(Easing.Quadratic.In)
              .onUpdate((obj) => {
                position.z = obj.z;
              }),
          ),
      );

      this.log("zOffset tween: " + peak.z + " " + duration);
    }
  }

  protected fixVisibility() {
    this.group.visible = this.chit.parent ? this.chit.parent.shouldRenderChild(this.chit) : true;
  }

  public createTween<T extends Record<string, any>>(props: T, cb: (tween: Tween<T>) => void): Tween<T> {
    return this.rootRenderInstance.createTween(props, cb);
  }
}
