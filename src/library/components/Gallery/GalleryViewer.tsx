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
import { GalleryKind, galleryRegistry } from "./registry";
import { Chit } from "../../game/Chit";
import { ChitGalleryItemInstance } from "../../rendering/ChitGalleryItemInstance";
import { useModalState } from "../../hooks/useModalState";
import type { ExternalDrag } from "../Panel/ExternalDrag";
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
  /**
   * Full-screen galleries: tapping near any edge of the gallery, or swiping down on an item (anywhere but summaries
   * that scroll), calls `onClose`.
   */
  dismissGestures?: boolean;
  showSummary?: SummaryMode;
  zFactor?: number;
  /** Lets tutorials find and point at this gallery's items (see `galleryRegistry`) */
  kind?: GalleryKind;
  /** `data-tutorial-target` for the gallery area */
  tutorialTarget?: string;
}

/**
 * Whether a gallery item shows `chit`: the item is that chit, or (galleries merge identical chits into
 * one "2x" item) an identical one.
 */
function itemShows(item: GalleryItem, chit: Chit) {
  if (item.id === chit.id) return true;
  const shown = (item as ChitGalleryItemInstance).chit;
  return shown instanceof Chit && shown !== chit && shown.functionallyIdentical(chit);
}

/** Full-screen galleries: how far (px) a swipe down must travel to dismiss, or how fast (px/ms) a shorter flick must be */
const DISMISS_DISTANCE = 120;
const DISMISS_FLING_MIN_DISTANCE = 30;
const DISMISS_FLING_VELOCITY = 0.4;

/** Whether a tap at (x, y) is within the edge band of a w×h gallery (tapping there dismisses a full-screen one) */
function nearEdge(x: number, y: number, w: number, h: number) {
  const band = Math.max(32, Math.min(w, h) * 0.06);
  return x < band || y < band || x > w - band || y > h - band;
}

/** Puts the canvas back after a dismissing swipe, sliding back when `animate` */
function resetDismissOffset(el: HTMLElement | null, animate: boolean) {
  if (!el) return;
  el.style.transition = animate ? "transform 150ms ease-out, opacity 150ms ease-out" : "none";
  el.style.transform = "";
  el.style.opacity = "";
}

export function GalleryViewer({
  items,
  paused = false,
  galleryItemWidth = DEFAULT_ITEM_WIDTH,
  fov = DEFAULT_FOV,
  angle = DEFAULT_ANGLE,
  onClose,
  onLongPress,
  dismissGestures = false,
  itemSpacing = DEFAULT_ITEM_SPACING,
  tweenDuration = DEFAULT_TWEEN_DURATION,
  w = 0,
  h = 0,
  galleryItemHeight = h * 0.7,
  showSummary = "full",
  zFactor = DEFAULT_Z_FACTOR,
  kind,
  tutorialTarget,
}: GalleryViewerProps) {
  const calcedItemWidth =
    items.length > 0 ? Math.min(...items.map((item) => item.preferredWidth ?? galleryItemWidth)) : galleryItemWidth;
  const calcedItemHeight =
    items.length > 0 ? Math.min(...items.map((item) => item.preferredHeight ?? galleryItemHeight)) : galleryItemHeight;

  const [id] = useState(`GalleryViewer${ID_COUNTER++}`);
  const refContainer = useRef<HTMLCanvasElement>(null);
  const rendererWrapper = useWebGlRenderer();
  const theme = useGameTheme();
  const modalState = useModalState();
  const [galleryController] = useState(() => new GalleryController(new SceneWrapper(new Scene()), theme, angle, fov));

  galleryController.setTweenDuration(tweenDuration);
  galleryController.showSummary = showSummary;

  // Must run before the effects below build items: each build sweeps unused textures, and the gallery's clones
  // only count as used once it's registered.
  useEffect(() => {
    TextureReferenceCounter.registerInstance(galleryController);
    return () => {
      galleryController.destroy();
      TextureReferenceCounter.unregisterInstance(galleryController);
      galleryController.sceneWrapper.dispose();
    };
  }, [galleryController]);

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

  // Tell tutorials where this gallery's items are
  useEffect(() => {
    const canvas = refContainer.current;
    if (!kind || !canvas) return;
    return galleryRegistry.register({
      kind,
      element: canvas,
      chitIds: () => galleryController.itemIds(),
      locate: (chit) => {
        const exact = galleryController.locateItem((item) => item.id === chit.id);
        const found = exact ?? galleryController.locateItem((item) => itemShows(item, chit));
        if (!found || found === "offscreen") return found;
        const r = canvas.getBoundingClientRect();
        return { left: r.left + found.left, top: r.top + found.top, right: r.left + found.right, bottom: r.top + found.bottom };
      },
      scrollTo: (chit) => {
        const hasExact = galleryController.itemIds().includes(chit.id ?? "");
        galleryController.scrollToItem((item) => (hasExact ? item.id === chit.id : itemShows(item, chit)));
      },
    });
    // the canvas exists only once w and h are known
  }, [kind, galleryController, w, h]);

  useEffect(() => {
    galleryController.setItems(items);
    // a gallery opened again (or reused) starts where it belongs, not where a dismissing swipe left it
    if (items.length > 0) resetDismissOffset(refContainer.current, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryController, items.map((i) => i.id).join("--")]);

  useEffect(() => {
    const canvas = refContainer.current;
    if (!canvas || !rendererWrapper || paused) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cancelled = false;
    let needsRedraw = false;

    const animate = () => {
      if (cancelled) return;
      requestSharedAnimationFrame(animate);

      const isAnimating = galleryController.render();

      if (isAnimating || needsRedraw) {
        ctx.canvas.width = w * rendererWrapper.pixelRatio;
        ctx.canvas.height = h * rendererWrapper.pixelRatio;
        ctx.clearRect(0, 0, w * rendererWrapper.pixelRatio, h * rendererWrapper.pixelRatio);
        const drew = rendererWrapper.render(galleryController.sceneWrapper, galleryController.camera, ctx, theme);
        // If render bailed (e.g. WebGL context lost), retry next frame even if
        // the controller has settled — otherwise the last frame of an animation
        // gets stuck on a stale snapshot.
        needsRedraw = !drew;
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
    // The inline strip also takes upward drags: a draggable item pulled up goes onto the board.
    const dragsOut = kind === "inline";
    // The full gallery takes vertical drags too: they scroll the summaries when those are longer than their space.
    hammer.add(new Hammer.Pan({ direction: Hammer.DIRECTION_ALL }));

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
      if (dismissGestures && nearEdge(pos.x, pos.y, el.clientWidth, el.clientHeight)) {
        onClose?.();
        return;
      }
      const tappedItem = galleryController.getItemAtPosition(pos.x, pos.y);
      if (galleryController.isAnimating() && tappedItem) {
        // a tap on a moving item stops the scroll rather than picking whatever happened to be under the finger
        galleryController.pan(0, true);
      } else if (tappedItem?.onClick) {
        tappedItem.onClick();
      } else if (!tappedItem && onClose) {
        onClose();
      }
    });

    hammer.on("longtap", () => {
      onLongPress?.();
    });

    let lastX: number | undefined = undefined;
    let lastVelocityX = 0;
    // Decided on a gesture's first movement: a pull upward (more than ~30° above horizontal) on
    // an item with a live DragPick drags it out onto the board; anything else scrolls the strip.
    // A scroll that leaves the strip through its top edge turns into a drag of the item it started
    // on, so a long diagonal pull toward the board still lands the piece.
    let mode: "undecided" | "scroll" | "drag" | "summaries" | "dismiss" = "undecided";
    let lastY: number | undefined = undefined;
    let summaryX = 0;
    let drag: ExternalDrag | undefined;
    let startItem: GalleryItem | null = null;

    const draggableChit = (item: GalleryItem | null) => {
      const chit = item instanceof ChitGalleryItemInstance ? item.chit : undefined;
      return chit?.onDrag ? chit : undefined;
    };
    const beginDragOut = (ev: HammerInput): boolean => {
      const chit = draggableChit(startItem);
      if (!chit || !startItem || !modalState.externalDragHost) return false;
      drag = modalState.externalDragHost.begin(chit, startItem, ev.center.x, ev.center.y);
      return !!drag;
    };

    hammer.on("pan", (ev) => {
      if (mode === "undecided") {
        const rect = el.getBoundingClientRect();
        startItem = dragsOut ? galleryController.getItemAtPosition(ev.center.x - ev.deltaX - rect.left, ev.center.y - ev.deltaY - rect.top) : null;
        const upward = -ev.deltaY > Math.abs(ev.deltaX) * 0.58;
        const vertical = Math.abs(ev.deltaY) > Math.abs(ev.deltaX);
        const startY = ev.center.y - ev.deltaY - rect.top;
        const summariesScroll = galleryController.canScrollSummaries();
        const onScrollingSummary = summariesScroll && startY > galleryController.summariesTop();
        mode =
          upward && beginDragOut(ev)
            ? "drag"
            : dismissGestures && vertical && ev.deltaY > 0 && !onScrollingSummary
              ? "dismiss"
              : !dragsOut && vertical && summariesScroll
                ? "summaries"
                : "scroll";
        // a summary drag scrolls the one it started on
        summaryX = ev.center.x - ev.deltaX - rect.left;
      } else if (mode === "scroll" && dragsOut && ev.center.y < el.getBoundingClientRect().top && beginDragOut(ev)) {
        // Put the strip back where the gesture found it, and carry on as a drag.
        if (lastX !== undefined) {
          galleryController.pan(-lastX);
          galleryController.pan(0, true);
        }
        lastX = undefined;
        mode = "drag";
      }
      if (mode === "drag") {
        drag?.move(ev.center.x, ev.center.y);
        ev.preventDefault();
        return;
      }
      if (mode === "dismiss") {
        // the gallery follows the finger down, fading as it goes
        const dy = Math.max(0, ev.deltaY);
        el.style.transition = "none";
        el.style.transform = `translateY(${dy}px)`;
        el.style.opacity = `${Math.max(0.3, 1 - dy / Math.max(1, el.clientHeight))}`;
        ev.preventDefault();
        return;
      }
      if (mode === "summaries") {
        // the text follows the finger: dragging up reads further down
        if (lastY !== undefined) galleryController.scrollSummaries(lastY - ev.deltaY, summaryX);
        lastY = ev.deltaY;
        ev.preventDefault();
        return;
      }
      if (!dragsOut && Math.abs(ev.deltaX) < 1 && lastX === undefined && Math.abs(ev.deltaY) > 0) {
        // a vertical drag with nothing to scroll: leave the strip where it is
        ev.preventDefault();
        return;
      }
      if (lastX === undefined) {
        lastX = 0;
      } else {
        lastVelocityX = ev.velocityX;
        galleryController.pan(-(lastX - ev.deltaX));
        lastX = ev.deltaX;
      }
      ev.preventDefault();
    });

    hammer.on("pancancel", () => {
      if (mode === "dismiss") resetDismissOffset(el, true);
      drag?.cancel();
      drag = undefined;
      mode = "undecided";
      lastY = undefined;
    });

    hammer.on("panend", (ev) => {
      if (mode === "dismiss") {
        mode = "undecided";
        const far = ev.deltaY > Math.min(DISMISS_DISTANCE, el.clientHeight * 0.2);
        const flung = ev.deltaY > DISMISS_FLING_MIN_DISTANCE && ev.velocityY > DISMISS_FLING_VELOCITY;
        if ((far || flung) && onClose) {
          onClose();
        } else {
          resetDismissOffset(el, true);
        }
        return;
      }
      if (mode === "drag") {
        drag?.end();
        drag = undefined;
        mode = "undecided";
        return;
      }
      if (mode === "summaries") {
        mode = "undecided";
        lastY = undefined;
        return;
      }
      mode = "undecided";
      lastX = undefined;
      galleryController.pan(lastVelocityX * VELOCITY_MULTIPLIER, true);
      lastVelocityX = 0;
    });

    let wheelTimeout: NodeJS.Timeout;
    const wheelListener = (ev: WheelEvent) => {
      // over the summaries (when they are longer than their space) the wheel reads through them
      if (galleryController.canScrollSummaries()) {
        const rect = el.getBoundingClientRect();
        if (ev.clientY - rect.top > galleryController.summariesTop()) {
          galleryController.scrollSummaries(ev.deltaY, ev.clientX - rect.left);
          ev.preventDefault();
          return;
        }
      }
      const dy = (ev as any).wheelDeltaY as number;
      galleryController.pan(dy / WHEEL_SENSITIVITY, false);
      ev.preventDefault();
      clearTimeout(wheelTimeout);
      wheelTimeout = setTimeout(() => galleryController.pan(0, true), WHEEL_SNAP_DELAY);
    };

    addWheelListener(el, wheelListener);

    return () => {
      clearTimeout(wheelTimeout);
      hammer.destroy();
      removeWheelListener(el, wheelListener);
    };
  }, [galleryController, onClose, onLongPress, kind, modalState, dismissGestures]);

  if (!w || !h) {
    return null;
  }

  return (
    <Box data-tutorial-target={tutorialTarget} sx={{ position: "absolute", top: 0, right: 0, left: 0, bottom: 0 }}>
      <canvas
        width={w * rendererWrapper.pixelRatio}
        height={h * rendererWrapper.pixelRatio}
        style={{ width: w, height: h }}
        ref={refContainer}
      />
    </Box>
  );
}
