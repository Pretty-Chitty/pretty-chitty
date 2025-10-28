import React, { useRef, useState, useEffect, useCallback, createContext, useContext } from "react";
import { Box } from "@mui/material";
import useSize from "@react-hook/size";
import { useGameTheme } from "../../hooks/useGameTheme";
import { RootChit } from "../../game/RootChit";
import { usePanelScale } from "../../hooks/usePanelScale";
import { usePlayerId } from "../../hooks/usePlayer";
import { SinglePanel } from "./SinglePanel";
import { MultiPanel } from "./MultiPanel";
import { Chit } from "../../game/Chit";
import Hammer from "@egjs/hammerjs";
import { PanelPositioningContext, ViewerPosition } from "../../hooks/usePanelPositioning";
import { ViewerWrapper } from "./ViewerWrapper";

// Types for gesture handling
export interface ViewerGestureHandlers {
  onSingleTap?: (x: number, y: number, isMouse: boolean) => void;
  onDoubleTap?: (x: number, y: number) => void;
  onLongTap?: (x: number, y: number, isMouse: boolean) => void;
  onPanStart?: () => void;
  onPan?: (dx: number, dy: number, ev: HammerInput) => void;
  onPinchStart?: () => void;
  onPinch?: (scale: number, deltaScale: number, centerX: number, centerY: number) => void;
  onPinchEnd?: () => void;
}

export interface ViewerRegistration {
  id: string;
  getBounds: () => DOMRect | null;
  handlers: ViewerGestureHandlers;
}

interface GestureContextValue {
  registerViewer: (registration: ViewerRegistration) => () => void;
}

const GestureContext = createContext<GestureContextValue | null>(null);

export function useGestureContext() {
  return useContext(GestureContext);
}

export function PanelContents({
  rootChit,
  scaleWidth,
  scaleHeight,
}: {
  rootChit: RootChit<any>;
  scaleWidth: number;
  scaleHeight: number;
}) {
  const theme = useGameTheme();
  const ref = useRef(null);
  const [width, height] = useSize(ref);
  const [focusedPanel, setFocusedPanel] = useState<Chit | undefined>();
  const scale = usePanelScale();
  const playerId = usePlayerId();
  const layout = rootChit.getFlatLayout(
    width,
    height,
    (scaleWidth / width) * scale,
    (scaleHeight / height) * scale,
    playerId,
  );
  const hasRootChitInLayout = layout.find((item) => item.chit === rootChit) !== undefined;

  // Viewer registration system
  const viewerRegistrationsRef = useRef<Map<string, ViewerRegistration>>(new Map());

  const registerViewer = useCallback((registration: ViewerRegistration) => {
    viewerRegistrationsRef.current.set(registration.id, registration);
    return () => {
      viewerRegistrationsRef.current.delete(registration.id);
    };
  }, []);

  // Panel positioning system
  const positionsRef = useRef<Map<string, ViewerPosition>>(
    new Map([
      [
        "root",
        { chitId: "root", x: -40, y: 0, w: 30, h: 30, front: true, visible: true, paused: true, refContainer: null },
      ],
    ]),
  );
  const [, forceUpdate] = useState({});

  const registerPosition = useCallback((chitId: string, position: ViewerPosition) => {
    positionsRef.current.set(chitId, position);
    forceUpdate({});
  }, []);

  const unregisterPosition = useCallback((chitId: string) => {
    positionsRef.current.delete(chitId);
    forceUpdate({});
  }, []);

  // Find which viewer contains a point
  const findViewerAtPoint = useCallback((x: number, y: number): ViewerRegistration | null => {
    for (const registration of viewerRegistrationsRef.current.values()) {
      const bounds = registration.getBounds();
      if (bounds && x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
        return registration;
      }
    }
    return null;
  }, []);

  // Setup single HammerJS instance
  useEffect(() => {
    const el = ref.current as unknown as HTMLElement;
    if (!el) {
      return;
    }

    const hammer = new Hammer.Manager(el);

    hammer.add(new Hammer.Tap({ event: "doubletap", taps: 2, interval: 300, threshold: 5, posThreshold: 50 }));
    hammer.add(new Hammer.Tap({ event: "singletap", time: 400 }));
    hammer.add(new Hammer.Pinch({ event: "pinch", threshold: 0.03 }));
    hammer.add(new Hammer.Pan({ event: "pan", direction: Hammer.DIRECTION_ALL }));
    hammer.add(new Hammer.Press({ event: "longtap", time: 600 }));

    hammer.get("singletap").requireFailure("doubletap");
    hammer.get("longtap").recognizeWith("singletap");
    hammer.get("singletap").requireFailure("longtap");

    let activeViewer: ViewerRegistration | null = null;
    let lastDeltaX = 0;
    let lastDeltaY = 0;
    let lastScale = 1;
    let panCancelled = false;
    let pinchCancelled = false;

    // Tap handlers
    hammer.on("longtap", (ev) => {
      const viewer = findViewerAtPoint(ev.center.x, ev.center.y);
      if (viewer?.handlers.onLongTap) {
        const bounds = viewer.getBounds();
        if (bounds) {
          const x = ev.center.x - bounds.left;
          const y = ev.center.y - bounds.top;
          const isMouse = ev.pointerType === "mouse";
          viewer.handlers.onLongTap(x, y, isMouse);
        }
      }
    });

    hammer.on("singletap", (ev) => {
      const viewer = findViewerAtPoint(ev.center.x, ev.center.y);
      if (viewer?.handlers.onSingleTap) {
        const bounds = viewer.getBounds();
        if (bounds) {
          const x = ev.center.x - bounds.left;
          const y = ev.center.y - bounds.top;
          const isMouse = ev.pointerType === "mouse";
          viewer.handlers.onSingleTap(x, y, isMouse);
        }
      }
    });

    hammer.on("doubletap", (ev) => {
      const viewer = findViewerAtPoint(ev.center.x, ev.center.y);
      if (viewer?.handlers.onDoubleTap) {
        const bounds = viewer.getBounds();
        if (bounds) {
          const x = ev.center.x - bounds.left;
          const y = ev.center.y - bounds.top;
          viewer.handlers.onDoubleTap(x, y);
        }
      }
    });

    // Pan handlers
    hammer.on("panstart", (ev) => {
      activeViewer = findViewerAtPoint(ev.center.x, ev.center.y);
      lastDeltaX = 0;
      lastDeltaY = 0;
      panCancelled = false;
      activeViewer?.handlers.onPanStart?.();
    });

    hammer.on("pan", (ev) => {
      if (!activeViewer || panCancelled) {
        return;
      }

      const dx = ev.deltaX - lastDeltaX;
      const dy = ev.deltaY - lastDeltaY;

      lastDeltaX = ev.deltaX;
      lastDeltaY = ev.deltaY;

      activeViewer.handlers.onPan?.(dx, dy, ev);
    });

    hammer.on("panend", () => {
      activeViewer = null;
    });

    // Pinch handlers
    hammer.on("pinchstart", (ev) => {
      activeViewer = findViewerAtPoint(ev.center.x, ev.center.y);
      lastScale = 1;
      pinchCancelled = false;
      activeViewer?.handlers.onPinchStart?.();
    });

    hammer.on("pinch", (ev) => {
      if (!activeViewer || pinchCancelled) {
        return;
      }

      const bounds = activeViewer.getBounds();
      if (bounds) {
        const centerX = ev.center.x - bounds.left;
        const centerY = ev.center.y - bounds.top;
        const deltaScale = ev.scale - lastScale;
        lastScale = ev.scale;

        activeViewer.handlers.onPinch?.(ev.scale, deltaScale, centerX, centerY);
      }
    });

    hammer.on("pinchend", () => {
      activeViewer?.handlers.onPinchEnd?.();
      activeViewer = null;
      pinchCancelled = true;
    });

    return () => {
      hammer.destroy();
    };
  }, [findViewerAtPoint]);

  const gestureContextValue = { registerViewer };
  const positioningContextValue = {
    positions: positionsRef.current,
    registerPosition,
    unregisterPosition,
  };

  const fullChitList = layout.flatMap((cell) => (Array.isArray(cell.chit) ? cell.chit : [cell.chit]));
  const tabChitList = fullChitList.concat();
  if (!hasRootChitInLayout) {
    fullChitList.push(rootChit);
  }

  return (
    <GestureContext.Provider value={gestureContextValue}>
      <PanelPositioningContext.Provider value={positioningContextValue}>
        <Box
          sx={{
            position: "relative",
            flex: 1,
            p: `${theme.spacing * 0.75}px`,
          }}
        >
          <Box
            ref={ref}
            sx={{
              position: "relative",
              width: "100%",
              height: "100%",
            }}
          >
            {layout.map((cell) => {
              if (Array.isArray(cell.chit)) {
                return (
                  <MultiPanel
                    enabled={focusedPanel === undefined}
                    focusedPanel={focusedPanel}
                    setFocusedPanel={setFocusedPanel}
                    key={"m" + cell.id}
                    chits={cell.chit}
                    w={cell.w}
                    h={cell.h}
                    x={cell.x}
                    y={cell.y}
                    isFocusedPanel={false}
                  />
                );
              } else {
                return (
                  <SinglePanel
                    enabled={focusedPanel === undefined}
                    focusedPanel={focusedPanel}
                    setFocusedPanel={setFocusedPanel}
                    key={cell.id}
                    chit={cell.chit}
                    w={cell.w}
                    h={cell.h}
                    x={cell.x}
                    y={cell.y}
                  />
                );
              }
            })}

            {!hasRootChitInLayout && (
              <SinglePanel
                focusedPanel={focusedPanel}
                setFocusedPanel={setFocusedPanel}
                paused
                chit={rootChit}
                x={-5 - theme.spacing * 3}
                y={0}
                w={theme.spacing * 3}
                h={theme.spacing * 3}
                enabled={true}
              />
            )}

            {/* Full-screen MultiPanel (visible when focusedPanel is set) */}
            {focusedPanel && (
              <MultiPanel
                isFocusedPanel
                enabled={focusedPanel !== undefined}
                focusedPanel={focusedPanel}
                setFocusedPanel={setFocusedPanel}
                chits={tabChitList}
                x={0}
                y={0}
                w={width}
                h={height}
              />
            )}

            {/* Render all ViewerWrappers directly here with stable keys */}
            {fullChitList.map((chit) => {
              const chitId = chit.id ?? "";
              const position = positionsRef.current.get(chitId);
              if (!position || !position.visible) {
                return null;
              }
              return (
                <ViewerWrapper
                  key={chitId}
                  focusedPanel={focusedPanel}
                  setFocusedPanel={setFocusedPanel}
                  front={position.front}
                  chit={chit}
                  w={position.w}
                  h={position.h}
                  x={position.x}
                  y={position.y}
                  paused={position.paused}
                  refContainer={position.refContainer}
                  panCallback={position.panCallback}
                  transition={position.transition}
                />
              );
            })}
          </Box>
        </Box>
      </PanelPositioningContext.Provider>
    </GestureContext.Provider>
  );
}
