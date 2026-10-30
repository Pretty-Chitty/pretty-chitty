import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box } from "@mui/material";
import useSize from "@react-hook/size";
import { useTutorial } from "../../hooks/useTutorial";
import { useClientPrompts, useTimeController, useTimeState } from "../../hooks/useTimeController";
import { usePlayerId } from "../../hooks/usePlayer";
import { useGameTheme } from "../../hooks/useGameTheme";
import { useTokenMap } from "../../hooks/useTokenMap";
import { usePanelNavigation } from "../../hooks/usePanelNavigation";
import { useEventChannelState } from "../../hooks/useEventChannelState";
import { TutorialController, TutorialStatus, TutorialView } from "../../game/tutorial/TutorialController";
import { EventChannel } from "../../utilities/EventChannel";
import { samePasses } from "../../game/ClockDetails";
import { resolveTutorialTheme } from "../../game/tutorial/TutorialTheme";
import { BoxAnchor, BoxPlacement, Focus, Target } from "../../game/tutorial/defineTutorial";
import { PickPrompt } from "../../game/Prompt";
import { Chit } from "../../game/Chit";
import { PlayerChit } from "../../game/PlayerChit";
import { RootChit } from "../../game/RootChit";
import { ZINDEX_TUTORIAL } from "../../utilities/zIndex";
import { requestSharedAnimationFrame } from "../../utilities/RequestSharedAnimationFrame";
import { BrowserNarration } from "./BrowserNarration";
import { PanelShown, Rect, rectCenter, resolveTarget, tableRects, toLocal, unionRects } from "./targetRects";
import type { RootChitRenderInstance } from "../../rendering/RootChitRenderInstance";
import { UI_ALIASES } from "../../game/tutorial/allowed";
import { BoxPosition, TutorialBox } from "./TutorialBox";
import { useModalState } from "../../hooks/useModalState";
import { ModalState } from "../../game/ModalState";
import { GalleryCommand, TutorialGalleryState, selectChits } from "../../game/tutorial/defineTutorial";
import { GalleryItemSource } from "../Gallery/types";
import { GalleryItemChitChildrenSource } from "../../game/GalleryItemChitChildrenSource";
import { GalleryItemRawSource } from "../../game/GalleryItemRawSource";
import { chitsToGalleryItems } from "../../utilities/GalleryItemConversion";
import { RegisteredGallery } from "../Gallery/registry";

type DrawnFocus = {
  /** One union box, or one per chit with `separate` */
  rings: Rect[];
  shape: "rect" | "ellipse";
  arrows: Rect[];
  dim: boolean;
};

/** What the overlay draws, and for which step (placement must not mix two steps' targets) */
type Frame = { focus: DrawnFocus[]; debug: Rect[]; step: number };

const RING_PADDING = 8;
/** The box keeps this far from the screen's sides */
const BOX_MARGIN = 16;
/** A ringed thing smaller than this (its longer side, in pixels, with the whole table shown) gets zoomed in on */
const ZOOM_BELOW_PX = 56;
/** ...until its longer side is this share of its panel's shorter side, or this many pixels */
const ZOOM_TO_SHARE = 0.45;
const ZOOM_TO_MAX_PX = 220;
/** On a screen smaller than this (its shorter side), a step about one panel shows it full screen... */
const FOCUS_BELOW_PX = 700;
/** ...when that panel has less than this share of the screen */
const FOCUS_BELOW_SHARE = 0.6;
/** How long a ring that leapt in one frame stays where it was (see the ring tick) */
const JUMP_HOLD_MS = 120;

function sameFrame(a: Frame, b: Frame) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function overlapArea(a: Rect, b: Rect) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

const RING_BREATHING_ROOM = 20;
/** Arrows need room to be seen, so their targets push the box further away */
const ARROW_BREATHING_ROOM = 44;

/** A target the box keeps clear of; `weight` makes sitting next to an arrow's tip count as covering it */
type Avoid = { rect: Rect; room: number; weight: number };

/**
 * How badly `box` hides the targets: the sum over targets of the fraction of each target (plus its
 * breathing room) that the box covers. A small counter fully under the box counts as 1, the same as
 * a whole card; the box's own size does not matter.
 */
function coverage(box: Rect, targets: Avoid[]) {
  return targets.reduce((acc, { rect: t, room, weight }) => {
    const padded: Rect = { left: t.left - room, top: t.top - room, right: t.right + room, bottom: t.bottom + room };
    const area = Math.max(1, (padded.right - padded.left) * (padded.bottom - padded.top));
    return acc + (overlapArea(box, padded) / area) * weight;
  }, 0);
}

/** Every rect the overlay is drawing right now: the box must not sit on any of them */
function targetRects(frame: Frame): Avoid[] {
  return frame.focus.flatMap((f) => [
    ...f.rings.map((rect) => ({ rect, room: RING_BREATHING_ROOM, weight: 1 })),
    ...f.arrows.map((rect) => ({ rect, room: ARROW_BREATHING_ROOM, weight: 3 })),
  ]);
}

function sameAvoid(a: Avoid, b: Avoid) {
  return (
    a.room === b.room &&
    Math.abs(a.rect.left - b.rect.left) < 2 &&
    Math.abs(a.rect.top - b.rect.top) < 2 &&
    Math.abs(a.rect.right - b.rect.right) < 2 &&
    Math.abs(a.rect.bottom - b.rect.bottom) < 2
  );
}

/**
 * The 2D tutorial layer over the whole player: rings and arrows (SVG) that follow chits and UI, the
 * draggable text box, and the controller that drives them. Renders nothing unless the match was
 * started with a tutorial (see `TutorialProvider`).
 */
export function TutorialOverlay() {
  const tutorial = useTutorial();
  if (!tutorial) return null;
  return <InnerOverlay />;
}

function InnerOverlay() {
  const tutorial = useTutorial()!;
  const clientTime = useTimeController();
  const clientPrompts = useClientPrompts();
  const timeState = useTimeState();
  const playerId = usePlayerId();
  const gameTheme = useGameTheme();
  const tokenMap = useTokenMap();
  const navigation = usePanelNavigation();
  const modalState = useModalState();
  const theme = useMemo(
    () => resolveTutorialTheme(gameTheme, tutorial.spec.theme, tutorial.themeOverrides),
    [gameTheme, tutorial.spec.theme, tutorial.themeOverrides],
  );

  const ref = useRef<HTMLDivElement>(null);
  const [width, height] = useSize(ref);
  const [rootChit] = useEventChannelState(clientTime.rootChit);
  const [isLoading] = useEventChannelState(timeState.isLoading);
  const [live] = useEventChannelState(timeState.live);
  const [controller, setController] = useState<TutorialController<any, any> | undefined>();
  const [started, setStarted] = useState(tutorial.autoStart);
  const [dev] = useEventChannelState(tutorial.dev);
  const [muted] = useEventChannelState(tutorial.muted);

  // ---- the controller, built once the board exists -------------------------------------------
  useEffect(() => {
    if (!rootChit || controller) return;
    const view: TutorialView<PlayerChit, RootChit<PlayerChit>> = {
      root: () => clientTime.rootChit.value,
      me: () => clientTime.rootChit.value?.players.find((p) => p.id === playerId),
      prompt: () => {
        const p = clientPrompts.currentPrompt.value;
        return p instanceof PickPrompt ? p : undefined;
      },
      clock: () => clientTime.currentClock.value.clock,
      find: (id) => clientTime.findChitUnsafe(id),
      latestLog: () => clientTime.activeLog.value,
      live: () => timeState.live.value,
      onChange: (cb) => {
        const unsubs = [
          clientTime.currentClock.on(cb, false),
          clientTime.rootChit.on(cb, false),
          clientTime.activeLog.on(cb, false),
          clientPrompts.currentPrompt.on(cb, false),
          timeState.live.on(cb, false),
          modalState.gallerySource.on(cb, false),
          modalState.inlineGallerySource.on(cb, false),
        ];
        return () => unsubs.forEach((u) => u());
      },
      setGuard: (guard) => {
        clientPrompts.guard = guard ? (_prompt, action) => guard(action) : undefined;
      },
      setUndo: (undo) => {
        clientPrompts.undoOverride.value = undo;
      },
      galleries: () => describeGalleries(modalState),
      setGallery: (command) =>
        applyGalleryCommand(
          modalState,
          command,
          clientTime.rootChit.value,
          clientTime.rootChit.value?.players.find((p) => p.id === playerId),
        ),
      onBlocked: (cb) => clientPrompts.blocked.on((b) => b && cb(b.action), false),
      // Poses change this client's copy of a chit only; the match never hears of them
      pose: (chit, change) => clientTime.poseChit(chit, change),
      unpose: (chit) => clientTime.restoreChit(chit),
      // Holds only how far this board plays; the match runs on behind it
      timeline: {
        at: () => Math.max(clientTime.currentClock.value.clock, timeState.targetClock.value),
        hold: (clock) => {
          timeState.timelineHold.value = clock;
        },
      },
      pressUi: (name) => {
        const el = (UI_ALIASES[name] ?? [name])
          .map((n) => document.querySelector(`[data-tutorial-target="${CSS.escape(n)}"]`) as HTMLElement | null)
          .find((e) => e && e.getBoundingClientRect().width > 0);
        if (!el) return false;
        // a target is often a wrapper around the actual control
        const control = (el.matches("button, [role=button]") ? el : el.querySelector("button, [role=button]")) ?? el;
        (control as HTMLElement).click();
        return true;
      },
      settled: () =>
        !timeState.isWaitingOnAnimations.value &&
        clientTime.currentClock.value.clock >= clientTime.maxClock.value.clock,
      setFastForward: (on) => {
        timeState.animationSpeedOverrideMultiplier.value = on ? 0.05 : undefined;
      },
    };
    const { snapshot, rewind, runtime } = tutorial;
    const c = new TutorialController({
      spec: tutorial.spec,
      view,
      runtime,
      narration: new BrowserNarration(),
      ai: tutorial.ai,
      onEvent: tutorial.onEvent,
      muted: tutorial.muted.value,
      rate: readRate(),
      history:
        snapshot && rewind
          ? {
              save: (stepId) => runtime.saveSnapshot(stepId, snapshot()),
              restore: async (stepId) => {
                // Watch the history live, then wait for the rerun (a new clock pass) to reach this view
                if (!timeState.live.value) timeState.live.value = true;
                const before = clientTime.currentClock.value.pass;
                if (!(await rewind(stepId))) return false;
                const deadline = Date.now() + 8000;
                while (Date.now() < deadline) {
                  const current = clientTime.currentClock.value;
                  const max = clientTime.maxClock.value;
                  if (
                    current.pass !== before &&
                    current.clock === max.clock &&
                    samePasses(current, max) &&
                    !timeState.isWaitingOnAnimations.value
                  ) {
                    break;
                  }
                  await new Promise((resolve) => setTimeout(resolve, 50));
                }
                return true;
              },
            }
          : undefined,
    });
    setController(c);
    tutorial.controller.value = c;
    c.rate.on((rate) => writeRate(rate), false);
    if (tutorial.autoStart) {
      // After a rewind or a dev restart: the board is already there and the player already tapped once
      setStarted(true);
      c.start(tutorial.startAt, { paused: tutorial.startPaused });
    }
  }, [rootChit, controller, clientTime, clientPrompts, timeState, playerId, tutorial, modalState]);

  useEffect(() => {
    return () => {
      controller?.dispose();
      if (tutorial.controller.value === controller) tutorial.controller.value = undefined;
    };
  }, [controller, tutorial]);

  useEffect(() => {
    controller?.setMuted(muted);
  }, [controller, muted]);

  // Tapping a control the next "do it" step asks for counts as moving on to that step. Listen in the
  // capture phase so the step is entered (and its check baselined) before the control acts.
  useEffect(() => {
    if (!controller) return;
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-tutorial-target]");
      const name = el?.getAttribute("data-tutorial-target");
      if (name) controller.usedUi(name);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [controller]);

  // Keyboard: → next step (or, while a step waits for the player, makes its move for them), ← previous
  // step, Space play/pause. Otherwise the same as the box's buttons.
  useEffect(() => {
    if (!controller) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const status = controller.status.value;
      if (status === "idle" || status === "done") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === "ArrowRight") controller.forward();
      else if (e.key === "ArrowLeft") controller.back();
      else if (e.key === " ") {
        // a focused button would also take the space as a click
        if (el?.tagName === "BUTTON") el.blur();
        controller.toggleNarration();
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [controller]);

  const onStart = useCallback(() => {
    if (!controller) return;
    setStarted(true);
    controller.start(tutorial.startAt);
  }, [controller, tutorial.startAt]);

  // ---- per-frame target resolution ------------------------------------------------------------
  const [focus] = useEventChannelState(controller?.focus ?? EMPTY_FOCUS);
  const [status] = useEventChannelState(controller?.status ?? IDLE);
  // Everything this step has pointed at so far: an earlier sentence's target stays relevant while
  // the step is on screen, so the box keeps clear of it too. Keyed by the step the frame was drawn for.
  const stepTargetsRef = useRef<{ step: number; targets: Avoid[] }>({ step: -1, targets: [] });
  const [placement] = useEventChannelState(controller?.box ?? NO_BOX);
  const [frame, setFrame] = useState<Frame>({ focus: [], debug: [], step: -1 });
  const frameRef = useRef(frame);
  /** Rings that leapt in one frame, per focus entry: since when (see the ring tick) */
  const jumpRef = useRef<{ focus: unknown; since: (number | undefined)[] }>({ focus: undefined, since: [] });
  const [boxSize, setBoxSize] = useState({ width: theme.boxWidth, height: 160 });
  // Dragging a narrower box is still allowed; the drag is clamped to the viewer
  const [boxPos, setBoxPos] = useState<BoxPosition>({ x: 16, y: 16 });
  // The latest box rect, for the framing (an effect that outlives renders)
  const boxPosRef = useRef(boxPos);
  boxPosRef.current = boxPos;
  const boxSizeRef = useRef(boxSize);
  boxSizeRef.current = boxSize;
  const userDraggedRef = useRef(false);
  const targetRectRef = useRef<Rect | undefined>(undefined);

  const active = started && status !== "done" && live;
  // Keep the box off the top and bottom bars: the player needs the prompt buttons the script points at
  const safeTop = gameTheme.topBarHeight + 12;
  const safeBottom = gameTheme.bottomBarHeight + 12;
  /** Where the box may sit: inside the screen, clear of the top and bottom bars */
  const clampBox = useCallback(
    (p: BoxPosition): BoxPosition => ({
      x: Math.max(BOX_MARGIN, Math.min(width - boxSize.width - BOX_MARGIN, p.x)),
      y: Math.max(safeTop, Math.min(height - boxSize.height - safeBottom, p.y)),
    }),
    [width, height, boxSize.width, boxSize.height, safeTop, safeBottom],
  );
  // A chit is on screen only if its panel is in front of its tab group: one behind still paints during
  // a tab slide, from where it would be, and a ring drawn there points at the wrong panel
  const shown = useCallback<PanelShown>(
    (chit) => {
      if (!navigation) return true;
      const roots = new Set(navigation.panelRoots().map((c) => c.id));
      let panel: Chit | undefined = chit;
      while (panel && !roots.has(panel.id)) panel = panel.parent;
      return !panel?.id || navigation.isFront(panel.id);
    },
    [navigation],
  );
  // The box floats on every screen size; on a narrow one it just gets narrower
  const boxWidth = Math.max(220, Math.min(theme.boxWidth, width - 32));

  // Bring hidden targets on screen, and keep doing so for as long as the step has one: the panel
  // stack flips to wherever the bots act, and a target that is off screen explains nothing
  useEffect(() => {
    if (!active || !navigation || !controller) return;
    let cancelled = false;
    let revealing = false;
    let revealedOnce = false;
    const attempt = () => {
      if (cancelled || revealing) return;
      const container = ref.current;
      if (!container) return;
      const ctx = controller.context();
      const root = ctx?.root;
      const me = ctx?.me;
      const hidden = new Set<Chit>();
      const visible = new Set<Chit>();
      const scroll: { gallery: RegisteredGallery; chit: Chit }[] = [];
      focus.forEach((f: Focus<any, any>) => {
        if (f.reveal === false) return;
        const targets: Target<any, any>[] = [];
        if (f.ring) targets.push(f.ring);
        if (f.arrow && f.arrow !== true) targets.push(f.arrow);
        targets.forEach((t) => {
          const resolved = resolveTarget(t, root, me, container, shown, ctx?.find);
          resolved.hidden.forEach((c) => hidden.add(c));
          resolved.chits.forEach((c) => !resolved.hidden.includes(c) && visible.add(c));
          scroll.push(...resolved.offscreenInGallery);
        });
      });
      // Items scrolled out of an open gallery: bring the first one into view
      if (scroll.length > 0) scroll[0].gallery.scrollTo(scroll[0].chit);
      // What shows stays in front: its tab group would otherwise slide off to wherever a bot just moved
      visible.forEach((c) => navigation.keepFront(c));
      if (hidden.size === 0) return;
      // Targets in two panels of one tab group cannot both show: switch once, not back and forth
      if (visible.size > 0 && revealedOnce) return;
      revealedOnce = true;
      revealing = true;
      void navigation.revealChit([...hidden][0]).finally(() => {
        revealing = false;
      });
    };
    const first = setTimeout(attempt, 50);
    const interval = setInterval(attempt, 400);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [focus, active, navigation, controller, shown]);

  // Frame what the step is about, on a small screen: everything it rings on the table sits in one
  // panel that has little of the screen, so show that panel full screen (as zooming in does, with
  // every panel as a tab); rings over several panels go back to the normal layout so all show. Then,
  // if the thing is still tiny, zoom the camera in on it. Both are undone when no longer needed (not
  // if the player zoomed or focused meanwhile: that is theirs). Only what is ringed counts, and only
  // on the table (a gallery shows things at a readable size already).
  const zoomRef = useRef<{ panel: RootChitRenderInstance; zoom: number } | undefined>(undefined);
  const focusedByUsRef = useRef<Chit | undefined>(undefined);
  /** The step whose rings set the current framing */
  const framedStepRef = useRef(-1);
  // The framing moved the targets: the box's memory of where they were this step is out of date
  const forgetTargets = () => {
    stepTargetsRef.current.targets = [];
  };
  const unzoom = useCallback(() => {
    const z = zoomRef.current;
    zoomRef.current = undefined;
    if (z && Math.abs(z.panel.cameraZoom - z.zoom) < 0.01) {
      z.panel.focusCamera(z.panel.width / 2, z.panel.height / 2, 1);
      forgetTargets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const unfocus = useCallback(() => {
    const ours = focusedByUsRef.current;
    focusedByUsRef.current = undefined;
    if (ours && navigation?.focusedPanel()) void navigation.focusPanelOf(undefined);
  }, [navigation]);
  useEffect(() => {
    if (!active || !controller) {
      unzoom();
      unfocus();
      return;
    }
    let cancelled = false;
    const ringed = () => {
      const container = ref.current;
      const ctx = controller.context();
      const found: { rect: Rect; panel: RootChitRenderInstance }[] = [];
      const panels = new Map<string, Chit>(); // panel root id → a ringed chit in it
      let inGallery = false;
      let asked: number | undefined; // a zoom the step asks for outright
      if (!container || !navigation) return { found, panels, inGallery, asked };
      const roots = new Set(navigation.panelRoots().map((c) => c.id));
      focus.forEach((f: Focus<any, any>) => {
        if (f.reveal === false || f.zoom === false || !f.ring) return;
        const t = f.ring;
        if (typeof t !== "function" && !("chit" in t)) return; // a UI or screen target
        if (typeof f.zoom === "number") asked = Math.max(asked ?? 1, f.zoom);
        const table = tableRects(t, ctx?.root, ctx?.me, container, shown);
        inGallery ||= table.inGallery;
        found.push(...table.rects);
        for (const c of selectChits(typeof t === "function" ? t : t.chit, ctx?.root, ctx?.me)) {
          let p: Chit | undefined = c;
          while (p && !roots.has(p.id)) p = p.parent;
          if (p?.id) panels.set(p.id, c);
        }
      });
      return { found, panels, inGallery, asked };
    };
    const zoomIn = () => {
      const { found, inGallery, asked, panels } = ringed();
      // Nothing to frame in this cue (only rings that flash by, or UI): keep the step's framing; a new
      // step starts zoomed out
      if (panels.size === 0 && !inGallery) {
        if (controller.index.value !== framedStepRef.current) unzoom();
        return;
      }
      framedStepRef.current = controller.index.value;
      const panel = found[0]?.panel;
      if (!panel || inGallery || found.some((f) => f.panel !== panel)) return unzoom();
      const union = unionRects(found.map((f) => f.rect))!;
      const topLeft = panel.convertCameraSpaceToScreenSpace(-1, 1);
      const bottomRight = panel.convertCameraSpaceToScreenSpace(1, -1);
      if (!topLeft || !bottomRight) return;
      // its longer side with the whole table shown
      const current = panel.cameraZoom;
      const size = Math.max(union.right - union.left, union.bottom - union.top) / current;
      // Where the thing should end up: the part of the panel the box leaves free (above or below it)
      const bounds = ref.current!.getBoundingClientRect();
      const box = {
        left: bounds.left + boxPosRef.current.x,
        top: bounds.top + boxPosRef.current.y,
        right: bounds.left + boxPosRef.current.x + boxSizeRef.current.width,
        bottom: bounds.top + boxPosRef.current.y + boxSizeRef.current.height,
      };
      let bandTop = topLeft.y;
      let bandBottom = bottomRight.y;
      if (box.right > topLeft.x && box.left < bottomRight.x && box.bottom > topLeft.y && box.top < bottomRight.y) {
        if (box.top - topLeft.y >= bottomRight.y - box.bottom) bandBottom = Math.max(topLeft.y + 1, box.top);
        else bandTop = Math.min(bottomRight.y - 1, box.bottom);
      }
      const panelShort = Math.min(bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
      // a zoom the step asks for is for small screens, like the full-screen panel
      const smallScreen = Math.min(width, height) < FOCUS_BELOW_PX;
      const fits = Math.min(0.85 * (bandBottom - bandTop), 0.85 * (bottomRight.x - topLeft.x)) / size;
      const wanted =
        asked && smallScreen ? asked : size < ZOOM_BELOW_PX ? Math.min(Math.min(panelShort * ZOOM_TO_SHARE, ZOOM_TO_MAX_PX) / size, fits) : 1;
      const zoom = Math.min(wanted, panel.cameraWrapper.cameraSpec.maxZoom);
      if (zoom < 1.25) return unzoom();
      // focusCamera brings a point to the middle: pick the point that puts the thing in the free band
      const c = rectCenter(union);
      const shift = ((bandTop + bandBottom) / 2 - (topLeft.y + bottomRight.y) / 2) * (current / zoom);
      panel.focusCamera(c.x - topLeft.x, c.y - shift - topLeft.y, zoom);
      zoomRef.current = { panel, zoom: panel.cameraZoom };
      forgetTargets();
    };
    const frame = async () => {
      if (cancelled || !navigation) return;
      const { panels, inGallery } = ringed();
      if (!inGallery && panels.size > 1 && navigation.focusedPanel()) {
        // the step needs more than one panel: the normal layout shows them side by side
        unzoom();
        focusedByUsRef.current = undefined;
        await navigation.focusPanelOf(undefined);
        forgetTargets();
      } else if (!inGallery && panels.size === 1) {
        const [[, chit]] = [...panels];
        const panel = chit.renderInstance?.rootRenderInstance;
        const share = panel && width && height ? (panel.width * panel.height) / (width * height) : 1;
        const smallScreen = Math.min(width, height) < FOCUS_BELOW_PX;
        if (navigation.focusedPanel() || (smallScreen && share < FOCUS_BELOW_SHARE)) {
          const before = navigation.focusedPanel();
          await navigation.focusPanelOf(chit);
          if (!before) focusedByUsRef.current = chit;
          forgetTargets();
        }
      }
      if (!cancelled) zoomIn();
    };
    // After a tab switch has slid in (see the reveal above), and the zoom once more in case it was slow
    const first = setTimeout(() => void frame(), 450);
    const again = setTimeout(() => !cancelled && zoomIn(), 1500);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearTimeout(again);
    };
  }, [focus, active, controller, shown, unzoom, unfocus, navigation, width, height]);

  // While the player only watches, the prompt's own strip (the gallery its toggle button opens by
  // itself) is put away, so the board gets the room; it comes back when it is the player's move or
  // the step points into it. A strip the player opens themselves stays open.
  const putAwayRef = useRef<{ source: GalleryItemSource; channel: EventChannel<GalleryItemSource | undefined> } | undefined>(undefined);
  useEffect(() => {
    if (!controller || !active) return;
    const promptStrips = (): GalleryItemSource[] => {
      const p = clientPrompts.currentPrompt.value;
      if (!(p instanceof PickPrompt)) return [];
      return p.picks.flatMap((k) => {
        // a chit pick's toggle button (Hand, Actions...), when it opens its gallery by itself
        const button = (k as { button?: { autoShow?: boolean; galleryItemSource?: GalleryItemSource } }).button;
        return button?.autoShow && button.galleryItemSource ? [button.galleryItemSource] : [];
      });
    };
    const playersMove = () => {
      const allow = controller.step?.allow;
      const list = allow === undefined ? [] : Array.isArray(allow) ? allow : [allow];
      return controller.status.value === "waiting" && !controller.reviewing.value && list.length > 0;
    };
    const pointsInto = (source: GalleryItemSource) => {
      const ids = new Set(describeSource(source, "inline").chitIds);
      const ctx = controller.context();
      return controller.focus.value.some((f: Focus<any, any>) =>
        [f.ring, f.arrow].some((t) => {
          if (!t || t === true) return false;
          if (typeof t !== "function" && "ui" in t) {
            const name = typeof t.ui === "function" ? (ctx ? t.ui(ctx.root, ctx.me) : "") : t.ui;
            return typeof name === "string" && (name.startsWith("gallery:") || name.startsWith("button:"));
          }
          if (typeof t !== "function" && !("chit" in t)) return false;
          const selector = typeof t === "function" ? t : t.chit;
          return selectChits(selector, ctx?.root, ctx?.me).some((c) => ids.has(c.id ?? ""));
        }),
      );
    };
    // Inline or full screen, as the player prefers
    const channels = [modalState.inlineGallerySource, modalState.gallerySource];
    const update = () => {
      const strips = promptStrips();
      const away = putAwayRef.current;
      if (away && !strips.includes(away.source)) putAwayRef.current = undefined; // its prompt is gone
      for (const channel of channels) {
        const open = channel.value;
        if (open && strips.includes(open) && !playersMove() && !pointsInto(open)) {
          putAwayRef.current = { source: open, channel };
          channel.value = undefined;
        }
      }
      const back = putAwayRef.current;
      if (back && !channels.some((c) => c.value) && (playersMove() || pointsInto(back.source))) {
        back.channel.value = back.source;
        putAwayRef.current = undefined;
      }
    };
    update();
    const unsubs = [
      controller.status.on(update, false),
      controller.focus.on(update, false),
      controller.index.on(update, false),
      clientPrompts.currentPrompt.on(update, false),
    ];
    return () => unsubs.forEach((u) => u());
  }, [controller, active, clientPrompts, modalState]);

  // Project every target each frame while something is drawn; publish a new frame only when it changed
  useEffect(() => {
    if (!controller || (!active && !dev.showTargetRects)) {
      if (frameRef.current.focus.length || frameRef.current.debug.length) {
        frameRef.current = { focus: [], debug: [], step: -1 };
        setFrame(frameRef.current);
      }
      return;
    }
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      requestSharedAnimationFrame(tick);
      const container = ref.current;
      if (!container) return;
      const bounds = container.getBoundingClientRect();
      const ctx = controller.context();
      const root = ctx?.root;
      const me = ctx?.me;
      const drawn: DrawnFocus[] = [];
      const debug: Rect[] = [];
      let firstRing: Rect | undefined;
      focus.forEach((f: Focus<any, any>) => {
        let rings: Rect[] = [];
        if (f.ring) {
          const resolved = resolveTarget(f.ring, root, me, container, shown, ctx?.find);
          const local = resolved.rects.map((r) => toLocal(r, bounds));
          if (f.separate) {
            rings = local;
          } else {
            const union = unionRects(local);
            rings = union ? [union] : [];
          }
          debug.push(...local);
        }
        const ring = rings[0];
        let arrows: Rect[] = [];
        if (f.arrow === true) {
          arrows = rings;
        } else if (f.arrow) {
          const resolved = resolveTarget(f.arrow, root, me, container, shown, ctx?.find);
          arrows = resolved.rects.map((r) => toLocal(r, bounds));
          debug.push(...arrows);
        }
        if (ring && !firstRing) firstRing = ring;
        if (!firstRing && arrows[0]) firstRing = unionRects(arrows);
        drawn.push({ rings, shape: f.shape ?? "rect", arrows, dim: !!f.dim });
      });
      // A ring that leaps across the screen in one frame, for the same focus, is the board mid-switch (a
      // panel reporting where it is going a frame before it gets there): keep it where it was until
      // the new place has lasted a moment. Zooms and slides move smoothly and are never held back.
      const jumps = jumpRef.current;
      if (jumps.focus !== focus) jumpRef.current = { focus, since: [] };
      else {
        const now = performance.now();
        const far = 0.2 * Math.min(bounds.width, bounds.height);
        drawn.forEach((d, i) => {
          const before = frameRef.current.focus[i];
          const moved =
            before && before.rings.length === d.rings.length && d.rings.length > 0
              ? Math.max(...d.rings.map((r, k) => {
                  const a = rectCenter(r), b = rectCenter(before.rings[k]);
                  return Math.hypot(a.x - b.x, a.y - b.y);
                }))
              : 0;
          if (moved <= far) {
            jumps.since[i] = undefined;
            return;
          }
          jumps.since[i] ??= now;
          if (now - jumps.since[i]! < JUMP_HOLD_MS) drawn[i] = before;
          else jumps.since[i] = undefined;
        });
      }
      targetRectRef.current = firstRing;
      const next: Frame = { focus: drawn, debug: dev.showTargetRects ? debug : [], step: controller.index.value };
      if (!sameFrame(next, frameRef.current)) {
        frameRef.current = next;
        setFrame(next);
      }
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [controller, focus, active, dev.showTargetRects, shown]);

  // ---- box placement --------------------------------------------------------------------------
  useEffect(() => {
    userDraggedRef.current = false;
  }, [placement]);

  useEffect(() => {
    const container = ref.current;
    if (!container || width === 0) return;
    if (stepTargetsRef.current.step !== frame.step) {
      stepTargetsRef.current = { step: frame.step, targets: [] };
    }
    const seen = stepTargetsRef.current.targets;
    targetRects(frame).forEach((t) => {
      if (!seen.some((s) => sameAvoid(s, t))) seen.push(t);
    });
    const targetsNow = seen;
    const rectNow: Rect = {
      left: boxPos.x,
      top: boxPos.y,
      right: boxPos.x + boxSize.width,
      bottom: boxPos.y + boxSize.height,
    };
    const margin = BOX_MARGIN;
    const bw = boxSize.width;
    const bh = boxSize.height;
    const clamp = clampBox;
    // A dragged box stays put unless a target shows up underneath it (but stays on screen when it
    // grows or the screen turns)
    if (userDraggedRef.current && coverage(rectNow, targetsNow) <= 0.1) {
      const kept = clamp(boxPos);
      if (Math.abs(kept.x - boxPos.x) > 1 || Math.abs(kept.y - boxPos.y) > 1) setBoxPos(kept);
      return;
    }
    const place = (p: BoxPlacement<any, any> | undefined): BoxPosition => {
      const anchor = p?.anchor ?? "top-right";
      switch (anchor) {
        case "top-left":
          return { x: margin, y: safeTop };
        case "top":
          return { x: (width - bw) / 2, y: safeTop };
        case "top-right":
          return { x: width - bw - margin, y: safeTop };
        case "bottom-left":
          return { x: margin, y: height - bh - safeBottom };
        case "bottom":
          return { x: (width - bw) / 2, y: height - bh - safeBottom };
        case "bottom-right":
          return { x: width - bw - margin, y: height - bh - safeBottom };
        case "center":
          return { x: (width - bw) / 2, y: (height - bh) / 2 };
        case "keep":
          return boxPos;
        case "near": {
          const bounds = container.getBoundingClientRect();
          const ctx = controller?.context();
          const resolved = resolveTarget((p as any).target, ctx?.root, ctx?.me, container, shown);
          const target = unionRects(resolved.rects.map((r) => toLocal(r, bounds)));
          if (!target) return boxPos;
          const gap = 24;
          const side =
            (p as any).side ??
            (target.bottom + gap + bh < height ? "below" : target.top - gap - bh > 0 ? "above" : "right");
          const c = rectCenter(target);
          switch (side) {
            case "below":
              return { x: c.x - bw / 2, y: target.bottom + gap };
            case "above":
              return { x: c.x - bw / 2, y: target.top - gap - bh };
            case "left":
              return { x: target.left - gap - bw, y: c.y - bh / 2 };
            default:
              return { x: target.right + gap, y: c.y - bh / 2 };
          }
        }
      }
    };
    const targets = targetsNow;
    const rectAt = (p: BoxPosition): Rect => ({ left: p.x, top: p.y, right: p.x + bw, bottom: p.y + bh });
    let next = clamp(place(placement));
    // Never sit on what the step is pointing at: if the requested spot covers a target, take the
    // corner that covers the least (the current spot wins ties so the box does not wander)
    if (coverage(rectAt(next), targets) > 0.1) {
      const candidates: BoxAnchor[] = ["top-left", "top-right", "bottom-left", "bottom-right", "top", "bottom"];
      let best = { pos: boxPos, cover: coverage(rectAt(boxPos), targets) };
      for (const anchor of candidates) {
        const pos = clamp(place({ anchor }));
        const cover = coverage(rectAt(pos), targets);
        if (cover < best.cover - 0.02) best = { pos, cover };
      }
      next = best.pos;
    }
    if (Math.abs(next.x - boxPos.x) > 1 || Math.abs(next.y - boxPos.y) > 1) {
      setBoxPos(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placement, width, height, boxSize.width, boxSize.height, frame, controller, safeTop, safeBottom, clampBox, shown]);

  // Dragging keeps the box on screen too: a box dragged off it could not be dragged back
  const clampRef = useRef(clampBox);
  clampRef.current = clampBox;
  const onDrag = useCallback((pos: BoxPosition) => {
    userDraggedRef.current = true;
    setBoxPos(clampRef.current(pos));
  }, []);
  const onMeasure = useCallback((size: { width: number; height: number }) => {
    setBoxSize((prev) => (prev.width === size.width && prev.height === size.height ? prev : size));
  }, []);

  if (!controller) {
    return <Box ref={ref} sx={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: ZINDEX_TUTORIAL }} />;
  }

  const boxRect: Rect = {
    left: boxPos.x,
    top: boxPos.y,
    right: boxPos.x + boxSize.width,
    bottom: boxPos.y + boxSize.height,
  };
  const hasNarration = !!controller.step?.audio || controller.spec.steps.some((s) => !!s.audio);
  // Once the tutorial is finished or skipped the box goes away and the match is just a game
  const showBox = !isLoading && (live || !started) && status !== "done";
  // A spotlight keeps everything the step highlights lit: every ring and every arrow target
  const anyDim = frame.focus.some((f) => f.dim) && frame.focus.some((f) => f.rings.length > 0 || f.arrows.length > 0);
  const lit = frame.focus.flatMap((f) => [
    ...f.rings.map((rect) => ({ rect, shape: f.shape })),
    ...f.arrows.map((rect) => ({ rect, shape: "rect" as const })),
  ]);

  return (
    <Box
      ref={ref}
      sx={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: ZINDEX_TUTORIAL,
        overflow: "hidden",
        fontFamily: theme.fontFamily,
      }}
    >
      {active && (
        <svg width={width} height={height} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <defs>
            <marker
              id="tutorial-arrowhead"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.arrowColor} />
            </marker>
            {/* Sized to the overlay, not to each shape: a near-vertical arrow's own bounding box is a
                few pixels wide and does not include its arrowhead, which then gets clipped */}
            <filter id="tutorial-glow" filterUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {anyDim && (
              <mask id="tutorial-dim-mask">
                <rect x={0} y={0} width={width} height={height} fill="white" />
                {lit.map((l, i) => (
                  <RingShape key={i} rect={l.rect} shape={l.shape} pad={RING_PADDING + 4} fill="black" />
                ))}
                <rect
                  x={boxRect.left - 4}
                  y={boxRect.top - 4}
                  width={boxRect.right - boxRect.left + 8}
                  height={boxRect.bottom - boxRect.top + 8}
                  rx={theme.borderRadius}
                  fill="black"
                />
              </mask>
            )}
          </defs>
          {anyDim && (
            <rect
              x={0}
              y={0}
              width={width}
              height={height}
              fill={theme.dimColor}
              opacity={theme.dimOpacity}
              mask="url(#tutorial-dim-mask)"
              style={{ transition: "opacity 0.3s" }}
            />
          )}
          <style>{`
            @keyframes tutorialRingPulse { 0% { stroke-opacity: 0.55; } 50% { stroke-opacity: 1; } 100% { stroke-opacity: 0.55; } }
            @keyframes tutorialDash { to { stroke-dashoffset: -24; } }
            @keyframes tutorialArrowNudge { 0% { transform: translate(0,0); } 50% { transform: translate(var(--nx), var(--ny)); } 100% { transform: translate(0,0); } }
          `}</style>
          {frame.debug.map((r, i) => (
            <rect
              key={`d${i}`}
              x={r.left}
              y={r.top}
              width={r.right - r.left}
              height={r.bottom - r.top}
              fill="none"
              stroke="#ff00ff"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          ))}
          {frame.focus.map((f, i) => (
            <g key={i}>
              {f.rings.map((ring, j) => (
                <RingShape
                  key={j}
                  rect={ring}
                  shape={f.shape}
                  pad={ringPadding(ring, f.rings)}
                  fill="none"
                  stroke={theme.highlightColor}
                  strokeWidth={3}
                  filter="url(#tutorial-glow)"
                  style={{ animation: "tutorialRingPulse 1.6s ease-in-out infinite" }}
                />
              ))}
              {f.arrows.map((target, j) => (
                <Arrow key={j} from={boxRect} to={target} color={theme.arrowColor} />
              ))}
            </g>
          ))}
        </svg>
      )}

      {showBox && (
        <TutorialBox
          controller={controller}
          theme={theme}
          tokenMap={tokenMap}
          position={boxPos}
          width={boxWidth}
          narrow={width < 600}
          onDrag={onDrag}
          onMeasure={onMeasure}
          started={started}
          onStart={onStart}
          hasNarration={hasNarration}
        />
      )}
    </Box>
  );
}

// ---- galleries ---------------------------------------------------------------------------------

const DEFAULT_INLINE_GALLERY_SIZE = 125;

function describeSource(source: GalleryItemSource, mode: "inline" | "fullscreen"): TutorialGalleryState {
  const backing = source.backingObject;
  return {
    mode,
    of: backing instanceof Chit ? backing.id : undefined,
    chitIds: source.items.map((item) => ((item as any).chit instanceof Chit ? (item as any).chit.id : item.id)),
  };
}

function describeGalleries(modal: ModalState): TutorialGalleryState[] {
  const result: TutorialGalleryState[] = [];
  if (modal.gallerySource.value) result.push(describeSource(modal.gallerySource.value, "fullscreen"));
  if (modal.inlineGallerySource.value) result.push(describeSource(modal.inlineGallerySource.value, "inline"));
  return result;
}

/** The inline/full-screen choice the gallery buttons remember */
function preferredGalleryMode(): "inline" | "fullscreen" {
  try {
    return window.localStorage.getItem("galleryFullScreen") === '"modal"' ? "fullscreen" : "inline";
  } catch {
    return "inline";
  }
}

/**
 * Opens, switches or closes a gallery through the same modal state the gallery buttons use, so the
 * player can keep using those buttons. Returns true when it opened a new gallery.
 */
function applyGalleryCommand(
  modal: ModalState,
  command: GalleryCommand<any, any>,
  root: RootChit<any> | undefined,
  me: PlayerChit | undefined,
): boolean {
  if (command === "close") {
    modal.gallerySource.value = undefined;
    modal.inlineGallerySource.value = undefined;
    return false;
  }
  const open = modal.gallerySource.value ?? modal.inlineGallerySource.value;
  let source: GalleryItemSource | undefined;
  let opened = false;
  if (command.of) {
    const container = selectChits(command.of, root, me)[0];
    if (container) {
      source = new GalleryItemChitChildrenSource(container);
      opened = true;
    }
  } else if (command.items) {
    const chits = selectChits(command.items, root, me);
    if (chits.length > 0) {
      source = new GalleryItemRawSource(chitsToGalleryItems(chits));
      opened = true;
    }
  } else if (open) {
    // Switching modes: a display closes the source it leaves, so hand the other one a fresh copy
    source = open.backingObject instanceof Chit ? new GalleryItemChitChildrenSource(open.backingObject) : open;
    source.inlineGallerySize = open.inlineGallerySize;
  }
  if (!source) return false;
  source.inlineGallerySize ??= DEFAULT_INLINE_GALLERY_SIZE;
  const mode =
    command.mode && command.mode !== "preferred"
      ? command.mode
      : opened
        ? preferredGalleryMode()
        : modal.gallerySource.value
          ? "fullscreen"
          : "inline";
  if (mode === "fullscreen") {
    modal.inlineGallerySource.value = undefined;
    modal.gallerySource.value = source;
  } else {
    modal.gallerySource.value = undefined;
    modal.inlineGallerySource.value = source;
  }
  return opened;
}

const RATE_KEY = "tutorialPlaybackRate";

/** The narration speed this viewer chose last time (a per-device convenience; 1 when unavailable) */
function readRate(): number {
  try {
    const value = parseFloat(window.localStorage.getItem(RATE_KEY) ?? "1");
    return value > 0 ? value : 1;
  } catch {
    return 1;
  }
}

function writeRate(rate: number) {
  try {
    window.localStorage.setItem(RATE_KEY, String(rate));
  } catch {
    // private window or blocked storage: the speed just is not remembered
  }
}

const EMPTY_FOCUS = new EventChannel<Focus<any, any>[]>([]);
const IDLE = new EventChannel<TutorialStatus>("idle");
const NO_BOX = new EventChannel<BoxPlacement<any, any> | undefined>(undefined);

/** A ring's padding: the usual breathing room, shrunk so neighbouring rings (with `separate`) never touch */
function ringPadding(ring: Rect, all: Rect[]) {
  let pad = RING_PADDING;
  for (const other of all) {
    if (other === ring) continue;
    const gapX = Math.max(other.left - ring.right, ring.left - other.right);
    const gapY = Math.max(other.top - ring.bottom, ring.top - other.bottom);
    const gap = Math.max(gapX, gapY);
    pad = Math.min(pad, gap / 2 - 2);
  }
  return Math.max(1, pad);
}

function RingShape({
  rect,
  shape,
  pad,
  ...rest
}: { rect: Rect; shape: "rect" | "ellipse"; pad: number } & React.SVGProps<SVGRectElement> &
  React.SVGProps<SVGEllipseElement>) {
  const w = rect.right - rect.left + pad * 2;
  const h = rect.bottom - rect.top + pad * 2;
  if (shape === "ellipse") {
    return (
      <ellipse
        cx={rect.left - pad + w / 2}
        cy={rect.top - pad + h / 2}
        rx={w / 2}
        ry={h / 2}
        {...(rest as React.SVGProps<SVGEllipseElement>)}
      />
    );
  }
  return (
    <rect
      x={rect.left - pad}
      y={rect.top - pad}
      width={w}
      height={h}
      rx={Math.min(14, w / 4, h / 4)}
      {...(rest as React.SVGProps<SVGRectElement>)}
    />
  );
}

/** A curved arrow from the nearest edge of the box to the nearest edge of the target. */
function Arrow({ from, to, color }: { from: Rect; to: Rect; color: string }) {
  const tc = rectCenter(to);
  const fc = rectCenter(from);
  // Start on the box edge facing the target
  const dx = tc.x - fc.x;
  const dy = tc.y - fc.y;
  let start: { x: number; y: number };
  // ...as close to straight across from the target as the edge allows, so several arrows fan out
  // from their own points instead of one shared one
  const edgeMargin = 18;
  if (Math.abs(dx) * (from.bottom - from.top) > Math.abs(dy) * (from.right - from.left)) {
    start = {
      x: dx > 0 ? from.right : from.left,
      y: Math.max(from.top + edgeMargin, Math.min(from.bottom - edgeMargin, tc.y)),
    };
  } else {
    start = {
      x: Math.max(from.left + edgeMargin, Math.min(from.right - edgeMargin, tc.x)),
      y: dy > 0 ? from.bottom : from.top,
    };
  }
  // End on the target edge facing the box, a little outside it
  const pad = 10;
  const ex = tc.x - start.x;
  const ey = tc.y - start.y;
  let end: { x: number; y: number };
  if (Math.abs(ex) * (to.bottom - to.top) > Math.abs(ey) * (to.right - to.left)) {
    end = { x: ex > 0 ? to.left - pad : to.right + pad, y: tc.y };
  } else {
    end = { x: tc.x, y: ey > 0 ? to.top - pad : to.bottom + pad };
  }
  const len = Math.hypot(end.x - start.x, end.y - start.y);
  if (len < 24) return null;
  // Control point: perpendicular offset for a gentle curve
  const mx = (start.x + end.x) / 2;
  const my = (start.y + end.y) / 2;
  const nx = -(end.y - start.y) / len;
  const ny = (end.x - start.x) / len;
  const bend = Math.min(60, len * 0.2);
  const cx = mx + nx * bend;
  const cy = my + ny * bend;
  const ux = (end.x - start.x) / len;
  const uy = (end.y - start.y) / len;
  return (
    <g
      style={
        {
          "--nx": `${ux * 6}px`,
          "--ny": `${uy * 6}px`,
          animation: "tutorialArrowNudge 1.1s ease-in-out infinite",
        } as React.CSSProperties
      }
    >
      <path
        d={`M ${start.x} ${start.y} Q ${cx} ${cy} ${end.x} ${end.y}`}
        fill="none"
        stroke="rgba(0,0,0,0.35)"
        strokeWidth={6}
        strokeLinecap="round"
      />
      <path
        d={`M ${start.x} ${start.y} Q ${cx} ${cy} ${end.x} ${end.y}`}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        markerEnd="url(#tutorial-arrowhead)"
        filter="url(#tutorial-glow)"
      />
      <circle cx={start.x} cy={start.y} r={4} fill={color} />
    </g>
  );
}
