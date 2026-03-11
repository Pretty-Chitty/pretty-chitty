import { Box } from "@mui/material";
import React, { useEffect, useRef, useState } from "react";
import Hammer from "@egjs/hammerjs";
import { Scene } from "three";
import { addWheelListener, removeWheelListener } from "wheel";
import { useWebGlRenderer } from "../../hooks/useWebGlRenderer";
import { useGameTheme } from "../../hooks/useGameTheme";
import { SceneWrapper } from "../../rendering/outline";
import { requestSharedAnimationFrame } from "../../utilities/RequestSharedAnimationFrame";
import { TextureReferenceCounter } from "../../rendering/TextureReferenceCounter";
import { GalleryController } from "./GalleryController";
import { GalleryItem, SummaryMode } from "./types";
import {
  DEFAULT_TWEEN_DURATION,
  DEFAULT_FOV,
  DEFAULT_ANGLE,
  DEFAULT_ITEM_WIDTH,
  DEFAULT_ITEM_SPACING,
  DEFAULT_Z_FACTOR,
  VELOCITY_MULTIPLIER,
  WHEEL_SENSITIVITY,
  WHEEL_SNAP_DELAY,
} from "./constants";

let ID_COUNTER = 1;

export interface GalleryViewerProps {
  items: GalleryItem[];
  w: number;
  h: number;
  fov?: number;
  angle?: number;
  itemSpacing?: number;
  paused?: boolean;
  tweenDuration?: number;
  galleryItemWidth?: number;
  galleryItemHeight?: number;
  onClose?: () => void;
  onLongPress?: () => void;
  showSummary?: SummaryMode;
  zFactor?: number;
}

export function GalleryViewer({
  items,
  paused = false,
  galleryItemWidth = DEFAULT_ITEM_WIDTH,
  fov = DEFAULT_FOV,
  angle = DEFAULT_ANGLE,
  onClose,
  onLongPress,
  itemSpacing = DEFAULT_ITEM_SPACING,
  tweenDuration = DEFAULT_TWEEN_DURATION,
  w = 0,
  h = 0,
  galleryItemHeight = h * 0.7,
  showSummary = "full",
  zFactor = DEFAULT_Z_FACTOR,
}: GalleryViewerProps) {
  const calcedItemWidth =
    items.length > 0 ? Math.min(...items.map((item) => item.preferredWidth ?? galleryItemWidth)) : galleryItemWidth;
  const calcedItemHeight =
    items.length > 0 ? Math.min(...items.map((item) => item.preferredHeight ?? galleryItemHeight)) : galleryItemHeight;

  const [id] = useState(`GalleryViewer${ID_COUNTER++}`);
  const refContainer = useRef<HTMLCanvasElement>(null);
  const rendererWrapper = useWebGlRenderer();
  const theme = useGameTheme();
  const [galleryController] = useState(() => new GalleryController(new SceneWrapper(new Scene()), theme, angle, fov));

  galleryController.setTweenDuration(tweenDuration);
  galleryController.showSummary = showSummary;

  // Single effect to handle both size and items changes
  useEffect(() => {
    if (!w || !h || !Number.isFinite(calcedItemHeight) || !Number.isFinite(calcedItemWidth)) {
      return;
    }

    // Always call setSize which will internally call setItems
    // This ensures items are always rendered with the correct dimensions
    galleryController.setSize({
      w,
      h,
      itemWidth: calcedItemWidth,
      itemHeight: calcedItemHeight,
      itemSpacing,
      zFactor,
    });
  }, [calcedItemWidth, itemSpacing, calcedItemHeight, w, h, galleryController, zFactor]);

  useEffect(() => {
    galleryController.setItems(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryController, items.map((i) => i.id).join("--")]);

  useEffect(() => {
    const canvas = refContainer.current;
    if (!canvas || !rendererWrapper || paused) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cancelled = false;

    const animate = () => {
      if (cancelled) return;
      requestSharedAnimationFrame(animate);

      const isAnimating = galleryController.render();

      if (isAnimating) {
        ctx.canvas.width = w * rendererWrapper.pixelRatio;
        ctx.canvas.height = h * rendererWrapper.pixelRatio;
        ctx.clearRect(0, 0, w * rendererWrapper.pixelRatio, h * rendererWrapper.pixelRatio);
        rendererWrapper.render(galleryController.sceneWrapper, galleryController.camera, ctx, theme);
      }
    };

    animate();
    return () => {
      cancelled = true;
    };
  }, [id, rendererWrapper, galleryController, paused, theme, w, h]);

  useEffect(() => {
    const el = refContainer.current;
    if (!el) return;

    const hammer = new Hammer.Manager(el);
    hammer.add(new Hammer.Pan({ direction: Hammer.DIRECTION_HORIZONTAL }));

    const singleTap = new Hammer.Tap({ event: "singletap" });
    const press = new Hammer.Press({ event: "longtap", time: 600 });

    hammer.add([singleTap, press]);
    press.recognizeWith(singleTap);
    singleTap.requireFailure(press);

    const fixPosition = (ev: any) => {
      const rect = el.getBoundingClientRect();
      return { x: ev.center.x - rect.left, y: ev.center.y - rect.top };
    };

    hammer.on("singletap", (ev) => {
      const pos = fixPosition(ev);
      // TODO: fix this
      if (galleryController.isAnimating()) {
        galleryController.pan(0, true);
      } else {
        const tappedItem = galleryController.getItemAtPosition(pos.x, pos.y);
        if (tappedItem?.onClick) {
          tappedItem.onClick();
        } else if (!tappedItem && onClose) {
          onClose();
        }
      }
    });

    hammer.on("longtap", () => {
      onLongPress?.();
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
      galleryController.pan(lastVelocityX * VELOCITY_MULTIPLIER, true);
      lastVelocityX = 0;
    });

    let wheelTimeout: NodeJS.Timeout;
    const wheelListener = (ev: WheelEvent) => {
      const dy = (ev as any).wheelDeltaY as number;
      galleryController.pan(dy / WHEEL_SENSITIVITY, false);
      ev.preventDefault();
      clearTimeout(wheelTimeout);
      wheelTimeout = setTimeout(() => galleryController.pan(0, true), WHEEL_SNAP_DELAY);
    };

    addWheelListener(el, wheelListener);

    return () => {
      hammer.destroy();
      removeWheelListener(el, wheelListener);
    };
  }, [galleryController, onClose, onLongPress]);

  useEffect(() => {
    TextureReferenceCounter.registerInstance(galleryController);
    return () => {
      TextureReferenceCounter.unregisterInstance(galleryController);
      galleryController.sceneWrapper.dispose();
    };
  }, [galleryController]);

  if (!w || !h) {
    return null;
  }

  return (
    <Box sx={{ position: "absolute", top: 0, right: 0, left: 0, bottom: 0 }}>
      <canvas
        width={w * rendererWrapper.pixelRatio}
        height={h * rendererWrapper.pixelRatio}
        style={{ width: w, height: h }}
        ref={refContainer}
      />
    </Box>
  );
}
