import {
  AmbientLight,
  Box3,
  DirectionalLight,
  Fog,
  Group,
  Mesh,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  Vector3,
} from "three";
import { Box } from "@mui/material";
import React, { useEffect, useRef, useState } from "react";
import Hammer from "@egjs/hammerjs";
import { useWebGlRenderer } from "../hooks/useWebGlRenderer";
import { Easing, Tween } from "@tweenjs/tween.js";
import { addWheelListener, removeWheelListener } from "wheel";
import { CanvasStack } from "../utilities/CanvasStack/CanvasStack";
import {
  ColorCanvasOperation,
  IconMap,
  LayeredCanvasOperation,
  MarkdownCanvasOperation,
  PadCanvasOperation,
} from "../utilities/CanvasStack/CanvasOperations";
import { useGameTheme } from "../hooks/useGameTheme";
import { GameTheme } from "../game/GameTheme";
import { RichTextRenderOptionsParameters } from "../utilities/CanvasStack/RichTextRenderer";
import { SceneWrapper } from "../rendering/outline";

let ID_COUNTER = 1;

type UpdateCallback = () => void;

export interface GalleryItem {
  id: string;
  createMesh(sceneWrapper: SceneWrapper): Object3D;
  onClick?: () => void;

  maximumWidth?: number;
  maximumHeight?: number;

  summary?: string;
  summaryIconMap?: IconMap;
  summaryRenderingOptions?: RichTextRenderOptionsParameters;

  /**
   * This takes a callback that gets updated any time the gallery item needs to be refreshed (new texture or mesh or whatnot).
   * It returns a callback that can be invoked to unsubscribe this callback
   */
  registerUpdateHandler(cb: UpdateCallback): UpdateCallback;
}

export interface GalleryItemSource {
  backingObject?: any;
  get items(): GalleryItem[];

  /**
   * This takes a callback that gets updated any time the gallery item needs to be refreshed (new texture or mesh or whatnot).
   * It returns a callback that can be invoked to unsubscribe this callback
   */
  registerUpdateHandler(cb: UpdateCallback): UpdateCallback;
  close(): void;
}

type BuiltItem = {
  index: number;
  enteredAmount: number;
  targetIndex: number;
  item: GalleryItem;
  group: Object3D;
  mesh: Object3D;
  meshToShowOrHideIfCentered?: Object3D;
  center: Vector3;
  height: number;
  depth: number;
  tween?: Tween<{ x: number }>;
  enteredTween?: Tween<{ x: number }>;
  unsubscribe: UpdateCallback;
};

class GalleryController {
  constructor(
    public sceneWrapper: SceneWrapper,
    private theme: GameTheme,
  ) {
    this.camera = new PerspectiveCamera(25, 10, 0.1, 20000);
    this.camera.position.z = 500;

    this.light = new DirectionalLight(0xffffff, 1);
    this.light.position.copy(this.camera.position);
    sceneWrapper.scene.add(this.light);
    const ambient = new AmbientLight(0xffffff, 1);
    sceneWrapper.scene.add(ambient);
  }

  public camera: PerspectiveCamera;
  private w = 100;
  private h = 100;
  private itemWidth = 100;
  private itemHeight = 100;

  public tweenDuration = 250;
  private changed = false;
  private itemSpacing = 100;
  private itemsPerPage = 1;
  private frontStageWidth = 1;
  private offsetX = 0;
  private light: DirectionalLight;

  private offsetAngle = Math.PI * 0.1;

  private items: BuiltItem[] = [];
  private leavingItems: BuiltItem[] = [];
  private itemLookup: { [key: string]: BuiltItem } = {};

  public setSize(w: number, h: number, itemWidth: number, itemHeight: number, itemSpacing: number) {
    this.changed = true;
    this.w = w;
    this.h = h;
    this.itemHeight = Math.min(itemHeight, h - itemSpacing);
    this.itemWidth = Math.min(itemWidth, w - itemSpacing);
    this.itemSpacing = itemSpacing;
    this.itemsPerPage = Math.floor((w - itemSpacing * 2) / (this.itemWidth + itemSpacing));
    this.frontStageWidth = this.itemsPerPage * (this.itemWidth + itemSpacing) - itemSpacing;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    const aspect = this.camera.aspect;
    const vFov = (this.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(aspect * Math.tan(vFov / 2));
    this.camera.position.z = w / (2 * Math.tan(hFov / 2));
    this.camera.position.x = 0;

    const z = this.camera.position.z;
    this.camera.position.z = Math.cos(this.offsetAngle) * z;
    this.camera.position.y = Math.sin(this.offsetAngle) * z;
    this.camera.lookAt(new Vector3(this.camera.position.x, 0, 0));
    this.sceneWrapper.scene.fog = new Fog(0x000000, z, z + w);

    this.light.position.copy(this.camera.position);
    this.light.lookAt(0, 0, 0);

    // reset the world
    this.pan(0, true);
  }

  getItemAtPosition(x: any, y: any) {
    const paddingX = (this.w - this.frontStageWidth) / 2;
    const index = (-this.offsetX + x - paddingX) / (this.itemWidth + this.itemSpacing);

    const item = this.items.find((item) => index > item.index && Math.abs(index - item.index) < 1);
    if (!item) {
      return null;
    }

    if (index - item.index > 1 - this.itemSpacing / (this.itemWidth + this.itemSpacing)) {
      return null;
    }

    const ndc = new Vector3((x / this.w) * 2 - 1, -(y / this.h) * 2 + 1, 0.5);
    ndc.unproject(this.camera);
    const raycaster = new Raycaster(this.camera.position, ndc.sub(this.camera.position).normalize());

    // Check main mesh
    const boundingBox = new Box3().setFromObject(item.mesh);
    const hitMain = raycaster.ray.intersectBox(boundingBox, new Vector3());

    // Check helpText/summary mesh if present
    let hitHelpText = false;
    if (item.meshToShowOrHideIfCentered) {
      const helpTextBox = new Box3().setFromObject(item.meshToShowOrHideIfCentered);
      hitHelpText = !!raycaster.ray.intersectBox(helpTextBox, new Vector3());
    }

    if (!hitMain && !hitHelpText) {
      return null;
    }

    return item.item;
  }

  render() {
    let changed = this.changed;
    if (this.tween) {
      this.tween.update();
      changed = true;
    }
    this.items.forEach((item) => {
      if (item.tween) {
        item.tween.update();
        changed = true;
      }
      if (item.enteredTween) {
        item.enteredTween.update();
        changed = true;
      }
    });
    this.leavingItems.forEach((item) => {
      if (item.enteredTween) {
        item.enteredTween.update();
      }
      changed = true;
    });
    this.changed = false;
    return changed;
  }

  isAnimating() {
    return this.tween !== undefined;
  }
  stop() {
    this.tween?.stop();
    this.tween = undefined;
  }

  private tween: Tween<{ x: number }> | undefined;
  pan(deltaX: number, animate = false) {
    const max = 0;
    const min =
      -(this.items.length - Math.min(this.items.length, this.itemsPerPage)) * (this.itemWidth + this.itemSpacing);

    this.changed = true;
    if (this.tween) {
      this.tween.stop();
      this.tween = undefined;
    }

    if (!animate) {
      this.offsetX += deltaX;

      if (this.offsetX > max + this.w / 2) {
        this.offsetX = max + this.w / 2;
      }
      if (this.offsetX < min - this.w / 2) {
        this.offsetX = min - this.w / 2;
      }

      this.items.forEach((item) => this.positionItem(item));
    } else {
      // lock the offset to the nearest item
      let target = this.offsetX + deltaX;
      const itemIndex = Math.round(target / (this.itemWidth + this.itemSpacing));
      target = itemIndex * (this.itemWidth + this.itemSpacing);

      if (target > max) {
        target = max;
      }
      if (target < min) {
        target = min;
      }

      const duration = 0.0001 + Math.min(750, Math.abs(target - this.offsetX));

      this.tween = new Tween({ x: this.offsetX })
        .onUpdate(({ x }) => {
          this.offsetX = x;
          this.items.forEach((item) => this.positionItem(item));
        })
        .easing(Easing.Quadratic.Out)
        .to({ x: target }, duration)
        .onComplete(() => {
          this.tween = undefined;
        })
        .start();
    }
  }

  positionItem(item: BuiltItem) {
    const index = item.index;
    const initialOffset = -(this.frontStageWidth / 2 - this.itemWidth / 2);
    const group = item.group;
    group.position.x = initialOffset + index * (this.itemWidth + this.itemSpacing) + this.offsetX;

    group.position.y = (1 - item.enteredAmount) * -this.h; // 5 is height of display?

    const largestX = initialOffset + (this.itemsPerPage - 1) * (this.itemWidth + this.itemSpacing);
    if (group.position.x > largestX) {
      const overshot = group.position.x - largestX;
      group.position.x = largestX + Math.pow(overshot, 0.94);
      group.position.z = -overshot;
      group.rotation.x = -overshot / 3000 - this.offsetAngle;
      if (item.meshToShowOrHideIfCentered) {
        item.meshToShowOrHideIfCentered.position.x = overshot * 3;
        item.meshToShowOrHideIfCentered.position.z = -overshot * 3;
      }
    } else if (group.position.x < initialOffset) {
      const overshot = Math.abs(initialOffset - group.position.x);
      group.position.x = initialOffset - Math.pow(overshot, 0.94);
      group.position.z = -overshot;
      group.rotation.x = -overshot / 3000 - this.offsetAngle;
      if (item.meshToShowOrHideIfCentered) {
        item.meshToShowOrHideIfCentered.position.x = -overshot * 3;
        item.meshToShowOrHideIfCentered.position.z = -overshot * 3;
      }
    } else {
      if (item.meshToShowOrHideIfCentered) {
        item.meshToShowOrHideIfCentered.position.x = 0;
      }
      group.position.z = 0;
      group.rotation.x = -this.offsetAngle;
    }

    group.rotation.x -= Math.min(1, item.depth / this.w);
    group.position.add(item.center);
  }

  scaleItem(item: BuiltItem, maximumWidth?: number, maximumHeight?: number) {
    const box3 = new Box3();
    box3.expandByObject(item.mesh);
    if (!box3.isEmpty()) {
      const size = box3.getSize(new Vector3());
      const center = box3.getCenter(new Vector3());
      const xScale = Math.min(this.itemWidth, maximumWidth ?? Number.MAX_SAFE_INTEGER) / size.x;
      const yScale = Math.min(this.itemHeight, maximumHeight ?? Number.MAX_SAFE_INTEGER) / size.y;
      const scale = Math.min(xScale, yScale);
      item.mesh.scale.set(scale, scale, scale);
      item.center = center.multiplyScalar(scale).negate();
      item.center.z = 0; // i want to "floor" everything... but that is hard?
      item.height = size.y * scale;
      item.depth = size.z * scale;
    }
  }

  updateHelpText(item: BuiltItem) {
    const summary = item.item.summary;
    if (!summary) {
      return;
    }

    const height = (this.h - this.itemHeight) / 2 - this.theme.spacing * 2;

    const specs: RichTextRenderOptionsParameters = {
      align: "center",
      color: this.theme.dialogForegroundColor,
      ...(item.item.summaryRenderingOptions ?? {}),
    };
    if (!specs.fontSize) {
      specs.fontSize = this.theme.dialogFontSize;
    }
    specs.fontSize *= window.devicePixelRatio;

    const pad = this.theme.spacing * window.devicePixelRatio;
    const markdown = new MarkdownCanvasOperation(summary, item.item.summaryIconMap ?? {}, specs);
    const ops = new LayeredCanvasOperation([
      new ColorCanvasOperation(this.theme.gallerySummaryBackgroundColor, this.theme.gallerySummaryBackgroundOpacity),
      new PadCanvasOperation({ top: pad, bottom: pad, left: pad, right: pad }, markdown),
    ]);

    const stack1 = new CanvasStack(this.itemWidth * window.devicePixelRatio, height * window.devicePixelRatio, ops);
    stack1.render();
    const stack2 = new CanvasStack(
      this.itemWidth * window.devicePixelRatio,
      markdown.height + this.theme.spacing * 2 * window.devicePixelRatio,
      ops,
    );
    stack2.render();

    const material = stack2.material;
    material.transparent = true;
    material.depthWrite = true;

    const finalHeight = stack2.height / window.devicePixelRatio;
    const face = new PlaneGeometry(this.itemWidth, finalHeight);
    const m = new Mesh(face, material);
    m.renderOrder = 2;
    m.position.set(0, -this.itemHeight * 0.5 - finalHeight / 2 - this.theme.spacing, 0);

    item.meshToShowOrHideIfCentered = m;
    item.group.add(m);
  }

  private _rawItems: GalleryItem[] = [];
  public setItems(items: GalleryItem[]) {
    this._rawItems = items;
    this.changed = true;
    const itemIndexOffset = items.length < this.itemsPerPage ? (this.itemsPerPage - items.length) / 2 : 0;

    const seenIds = new Set(Object.keys(this.itemLookup));
    items.forEach((item, i) => {
      seenIds.delete(item.id);
      if (!this.itemLookup[item.id]) {
        const builtItem: BuiltItem = (this.itemLookup[item.id] = {
          item,
          enteredAmount: 0,
          mesh: item.createMesh(this.sceneWrapper),
          group: new Group(),
          index: i + itemIndexOffset,
          center: new Vector3(),
          height: 0,
          depth: 0,
          targetIndex: i + itemIndexOffset,
          unsubscribe: item.registerUpdateHandler(() => {
            builtItem.group.removeFromParent();
            builtItem.mesh.removeFromParent();
            this.changed = true;

            builtItem.group = new Group();
            builtItem.mesh = item.createMesh(this.sceneWrapper);
            builtItem.group.add(builtItem.mesh);

            this.sceneWrapper.scene.add(builtItem.group);

            this.scaleItem(builtItem, item.maximumWidth, item.maximumHeight);
            this.positionItem(builtItem);
            this.updateHelpText(builtItem);
          }),
        });
        this.scaleItem(builtItem, item.maximumWidth, item.maximumHeight);

        // Also add your mesh to the scene:
        builtItem.mesh.removeFromParent();
        builtItem.group.removeFromParent();
        builtItem.group.add(builtItem.mesh);
        this.sceneWrapper.scene.add(builtItem.group);
        this.positionItem(builtItem);
        this.updateHelpText(builtItem);

        builtItem.enteredTween = new Tween({ x: 0 })
          .to({ x: 1 }, this.tweenDuration)
          .easing(Easing.Quadratic.Out)
          .onUpdate((obj) => {
            builtItem.enteredAmount = obj.x;
            this.positionItem(builtItem);
          })
          .onComplete(() => {
            this.positionItem(builtItem);
            builtItem.enteredTween = undefined;
          })
          .start();
      }
    });

    [...seenIds].forEach((id) => {
      const item = this.itemLookup[id];
      item.unsubscribe();
      delete this.itemLookup[id];
      this.leavingItems.push(item);

      if (item.enteredTween) {
        item.enteredTween.stop();
        item.enteredTween = undefined;
      }

      item.enteredTween = new Tween({ x: item.enteredAmount })
        .to({ x: 0 }, this.tweenDuration)
        .easing(Easing.Quadratic.In)
        .onUpdate((obj) => {
          item.enteredAmount = obj.x;
          this.positionItem(item);
        })
        .onComplete(() => {
          item.enteredTween = undefined;
          item.mesh.parent?.remove(item.mesh);
          this.leavingItems = this.leavingItems.filter((i) => i !== item);
        })
        .start();
    });

    const hasChangedLength = this.items.length !== items.length;
    this.items = items.map((item) => this.itemLookup[item.id]);

    this.items.forEach((item, index) => {
      if (item.tween) {
        item.tween.stop();
        item.tween = undefined;
      }
      if (item.index !== index + itemIndexOffset) {
        item.targetIndex = index + itemIndexOffset;

        item.tween = new Tween({ x: item.index })
          .to({ x: item.targetIndex }, this.tweenDuration)
          .easing(Easing.Quadratic.InOut)
          .onUpdate((obj) => {
            item.index = obj.x;
            this.positionItem(item);
          })
          .onComplete(() => {
            item.tween = undefined;
          })
          .start();
      }
    });

    if (hasChangedLength && !this.tween) {
      this.pan(0, true);
    }

    this.sceneWrapper.markDirty();
  }
}

export function GalleryViewer({
  items,
  paused = false,
  galleryItemWidth = 200,
  onClose,
  itemSpacing = 50,
  tweenDuration = 250,
  w = 0,
  h = 0,
  galleryItemHeight = h * 0.7,
}: {
  items: GalleryItem[];
  w: number;
  h: number;
  itemSpacing: number;
  paused?: boolean;
  tweenDuration?: number;
  galleryItemWidth?: number;
  galleryItemHeight?: number;
  onClose?: () => void;
}) {
  const [id] = useState(`GalleryViewer${ID_COUNTER++}`);
  const refContainer = useRef<HTMLCanvasElement>(null);
  const rendererWrapper = useWebGlRenderer(w, h, true); // transparent=true for gallery
  const theme = useGameTheme();
  const [galleryController] = useState(new GalleryController(new SceneWrapper(new Scene()), theme));
  const [itemWidth, setItemWidth] = useState(galleryItemWidth);
  const [itemHeight, setItemHeight] = useState(galleryItemHeight);

  galleryController.tweenDuration = tweenDuration;

  useEffect(() => {
    galleryController.setSize(w, h, itemWidth, itemHeight, itemSpacing);
  }, [itemWidth, itemSpacing, itemHeight, w, h, galleryController]);

  useEffect(() => {
    galleryController.setItems(items);
  }, [items, galleryController]);

  useEffect(() => {
    setItemWidth(galleryItemWidth);
    setItemHeight(galleryItemHeight);
  }, [items, galleryItemWidth, galleryItemHeight, setItemWidth, setItemHeight]);

  useEffect(() => {
    const canvas = refContainer.current;
    if (!canvas || !rendererWrapper || paused) return;
    const ctx = canvas.getContext("2d");
    let cancelled = false;

    // FPS tracking variables
    let frameCount = 0;
    let fpsStartTime = performance.now();
    let isAnimating = false;

    const animate = () => {
      if (cancelled) return;
      requestAnimationFrame(animate);

      const wasAnimating = isAnimating;
      isAnimating = galleryController.render();

      if (isAnimating) {
        if (!wasAnimating) {
          // Animation just started
          frameCount = 0;
          fpsStartTime = performance.now();
        }

        frameCount++;
        const elapsed = performance.now() - fpsStartTime;

        if (elapsed > 1000 && frameCount > 10) {
          // After 1 second and at least 10 frames
          const fps = (frameCount / elapsed) * 1000;
          console.log(`Gallery Animation FPS: ${fps.toFixed(1)}`);
          frameCount = 0;
          fpsStartTime = performance.now();
        }

        rendererWrapper.render(galleryController.sceneWrapper, galleryController.camera);

        if (ctx) {
          ctx.clearRect(0, 0, w * window.devicePixelRatio, h * window.devicePixelRatio);
          ctx.drawImage(
            rendererWrapper.renderer.domElement,
            0,
            0,
            w * window.devicePixelRatio,
            h * window.devicePixelRatio,
          );
        }
      }
    };
    animate();
    return () => {
      cancelled = true;
    };
  }, [id, rendererWrapper, galleryController, paused, w, h]);

  useEffect(() => {
    const el = refContainer.current;
    if (!el) return;
    const hammer = new Hammer.Manager(el);
    hammer.add(new Hammer.Pan({ direction: Hammer.DIRECTION_HORIZONTAL }));

    const fixPosition = (ev: HammerInput) => {
      const rect = el.getBoundingClientRect();
      return { x: ev.center.x - rect.left, y: ev.center.y - rect.top };
    };

    hammer.add(new Hammer.Tap());
    hammer.on("tap", (ev) => {
      const pos = fixPosition(ev);

      if (galleryController.isAnimating()) {
        galleryController.pan(0, true); // goofy but fine?  locks to closest slot?
      } else {
        const tappedItem = galleryController.getItemAtPosition(pos.x, pos.y);
        if (tappedItem) {
          if (tappedItem.onClick) {
            tappedItem.onClick();

            // // TODO: this is maybe not right? do we always want to close upon selection?  I don't think so
            // if (onClose) {
            //   setTimeout(onClose, 500);
            // }
          }
        } else if (onClose) {
          onClose();
        }
      }
    });

    let lastX: number | undefined = undefined;
    let lastVelocityX = 0;
    hammer.on("pan", (ev) => {
      if (lastX === undefined) {
        lastX = 0;
      } else {
        lastVelocityX = ev.velocityX;
        galleryController.pan(-(lastX - ev.deltaX));
        lastX = ev.deltaX;
      }
      ev.preventDefault();
    });
    hammer.on("panend", () => {
      lastX = undefined;
      galleryController.pan(lastVelocityX * 300, true);
      lastVelocityX = 0;
    });

    let timeout: NodeJS.Timeout;
    const wheelListener = (ev: any) => {
      const dy = ev.wheelDeltaY as number;
      galleryController.pan(dy / 3, false);
      ev.preventDefault();
      clearTimeout(timeout);
      timeout = setTimeout(() => galleryController.pan(0, true), 50);
    };

    addWheelListener(el, wheelListener);
    return () => {
      hammer.destroy();
      removeWheelListener(el, wheelListener);
    };
  }, [galleryController, onClose]);

  // Cleanup sceneWrapper on unmount
  useEffect(() => {
    return () => {
      galleryController.sceneWrapper.dispose();
    };
  }, [galleryController]);

  if (!w || !h) {
    return null;
  }

  return (
    <Box sx={{ position: "absolute", top: 0, right: 0, left: 0, bottom: 0 }}>
      <canvas
        width={w * window.devicePixelRatio}
        height={h * window.devicePixelRatio}
        style={{ width: w, height: h }}
        ref={refContainer}
      />
    </Box>
  );
}
