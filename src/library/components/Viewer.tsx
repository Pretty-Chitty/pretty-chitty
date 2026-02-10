import { Vector2 } from "three";

import React, { useEffect, useRef, useState } from "react";
import { Chit } from "../game/Chit";
import { RootChitRenderInstance } from "../rendering/RootChitRenderInstance";
import { useAnimationSpeedMultiplier, useTimeState } from "../hooks/useTimeController";
import { useEventChannelState } from "../hooks/useEventChannelState";
import { addWheelListener, removeWheelListener } from "wheel";
import { useWebGlRenderer } from "../hooks/useWebGlRenderer";
import { useModalState } from "../hooks/useModalState";
import { usePlayerId } from "../hooks/usePlayer";
import { useGameTheme } from "../hooks/useGameTheme";
import { requestSharedAnimationFrame } from "../utilities/RequestSharedAnimationFrame";
import PersistentCanvas from "./PersistentCanvas";
import { useGestureContext, ViewerGestureHandlers } from "./Panel/PanelContents";
import { useLoadingState } from "../hooks/useLoadingStates";
import { DragHandler } from "../rendering/ChitRenderInstance";

let ID_COUNTER = 1;

export default function Viewer({
  paused = false,
  hardPaused = false,
  chit,
  wireframes,
  w = 0,
  h = 0,
  paddingTop = 0,
  panCallback,
  zoomCallback,
  refContainer = null,
  enableGestures = true,
}: {
  chit: Chit;
  wireframes?: boolean;
  w: number;
  h: number;
  paddingTop?: number;
  hardPaused?: boolean;
  paused?: boolean;
  panCallback?: (direction: "left" | "right") => void;
  zoomCallback?: (newZoom: number, oldZoom: number) => void;
  refContainer?: React.RefObject<HTMLElement> | null;
  enableGestures?: boolean;
}) {
  const loadingState = useLoadingState();
  const playerId = usePlayerId();
  const [id] = useState(`Viewer${ID_COUNTER++}`);
  const timeState = useTimeState();
  const animationSpeedMultiplier = useAnimationSpeedMultiplier();
  const [isLoading] = useEventChannelState(timeState.isLoading);
  const myRefContainer = useRef(null);
  const rendererWrapper = useWebGlRenderer();
  const theme = useGameTheme();

  useEffect(() => {
    loadingState.setLoading(id, true);
  }, [id, loadingState]);

  const modalState = useModalState();
  const [chitRenderInstance, setChitRenderInstance] = useState<RootChitRenderInstance | null>(null);

  if (chitRenderInstance) {
    if (isLoading) {
      chitRenderInstance.animationSpeedMultiplier = 0.0001;
    } else if (chitRenderInstance.animationSpeedMultiplier !== animationSpeedMultiplier) {
      chitRenderInstance.animationSpeedMultiplier = animationSpeedMultiplier;
      chitRenderInstance.resetMarks();
    }
  }

  useEffect(() => {
    if (!isLoading && chitRenderInstance) {
      chitRenderInstance.resetMarks();
    }
  }, [isLoading, chitRenderInstance]);

  // handle sizing and aspect ratio on camera
  useEffect(() => {
    chitRenderInstance?.setSize(w, h);
  }, [chitRenderInstance, w, h]);

  // handle padding
  useEffect(() => {
    chitRenderInstance?.setPaddingTop(paddingTop);
  }, [chitRenderInstance, w, h, paddingTop]);

  // handle hooking the root render instance onto the scene
  const actualRef = refContainer ?? myRefContainer;
  const R = RootChitRenderInstance;
  useEffect(() => {
    if (!chitRenderInstance || chitRenderInstance.chit !== chit || !(chitRenderInstance instanceof R)) {
      if (chitRenderInstance) {
        chitRenderInstance.destroy();
      }

      if (chit.renderInstance) {
        chit.renderInstance.invalidateRootRenderInstance();
        chit.renderInstance.destroy();
      }

      const newInstance = new R(chit);
      newInstance.playerId = playerId;
      newInstance.convertCameraSpaceToScreenSpace = (x: number, y: number) => {
        const el = actualRef.current as unknown as HTMLElement;
        if (!el) {
          return;
        }
        const rect = el.getBoundingClientRect();

        return new Vector2(rect.left + ((1 + x) / 2) * rect.width, rect.top + ((1 - y) / 2) * rect.height);
      };
      newInstance.convertScreenSpaceToCameraSpace = (x: number, y: number) => {
        const el = actualRef.current as unknown as HTMLElement;
        if (!el) {
          return;
        }
        const rect = el.getBoundingClientRect();

        x -= rect.left;
        y -= rect.top;

        return new Vector2((x / rect.width) * 2 - 1, -((y / rect.height) * 2 - 1));
      };
      newInstance.setup(modalState);
      setChitRenderInstance(newInstance);
    }
  }, [actualRef, playerId, animationSpeedMultiplier, chit, chitRenderInstance, R, modalState]);

  // make sure "wireframes" gets set correctly on the render instance
  useEffect(() => {
    if (chitRenderInstance) {
      chitRenderInstance.wireframes = !!wireframes;
    }
  }, [chitRenderInstance, wireframes]);

  // handle animation frames
  useEffect(() => {
    const canvas = myRefContainer.current as any as HTMLCanvasElement;
    if (!chitRenderInstance || !rendererWrapper || !canvas) {
      return;
    }

    loadingState.setLoading(id, true);

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    // chitRenderInstance.sceneWrapper.markDirty();

    let renderNextFrame: boolean | undefined;
    let cancelled = false;
    const animate = () => {
      if (!cancelled) {
        try {
          // console.log(renderNextFrame);
          if (!paused) {
            requestSharedAnimationFrame(animate);
            // setTimeout(animate, 500);
          }
          const prevRenderNextFrame = renderNextFrame;
          renderNextFrame = chitRenderInstance?.update();
          if (
            chitRenderInstance &&
            rendererWrapper &&
            (paused || prevRenderNextFrame === undefined || prevRenderNextFrame || chitRenderInstance.dirty)
          ) {
            if (!hardPaused) {
              // Clear canvas and render
              rendererWrapper.render(chitRenderInstance.sceneWrapper, chitRenderInstance.camera, context, theme);

              loadingState.setLoading(id, false);

              // Clear snapshot after first render at new size
              const canvasEl = canvas as any;
              if (canvasEl.clearSnapshot) {
                canvasEl.clearSnapshot();
              }
            } else {
              loadingState.setLoading(id, false);
            }

            chitRenderInstance.resetDirty();
            if (!hardPaused) {
              timeState.setAnimationState(id, !paused);
            }
          } else {
            timeState.setAnimationState(id, false);
            loadingState.setLoading(id, false);
          }
        } catch (e) {
          console.error(e);
        }
      }
    };
    animate();

    return () => {
      timeState.setAnimationState(id, false);
      cancelled = true;
    };
  }, [
    id,
    timeState,
    hardPaused,
    rendererWrapper,
    chitRenderInstance,
    paused,
    actualRef,
    myRefContainer,
    theme,
    loadingState,
  ]);

  useEffect(() => {
    if (chitRenderInstance) {
      if (paused) {
        timeState.setAnimationState(id, false);
        chitRenderInstance.pause();
      } else {
        chitRenderInstance.cameraWrapper.zeroTween();
        chitRenderInstance.resume();
      }
    }
  }, [chitRenderInstance, id, paused, timeState]);

  // hook up interactions
  const gestureContext = useGestureContext();

  useEffect(() => {
    const el = myRefContainer.current as unknown as HTMLElement;
    if (!el || !chitRenderInstance || hardPaused) {
      return;
    }

    // Set up wheel listener (not handled by HammerJS)
    const wheelListener = (ev: any) => {
      if (panCallback && Math.abs(ev.deltaX) > 30 && Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) {
        const direction = ev.deltaX > 0 ? "left" : "right";
        panCallback(direction);
        ev.preventDefault();
      } else {
        const dy = ev.wheelDeltaY as number;
        const prev = chitRenderInstance.cameraZoom;
        chitRenderInstance.handleZoom(ev.layerX as number, ev.layerY as number, dy / 120, false);

        if (zoomCallback) {
          zoomCallback(chitRenderInstance.cameraZoom, prev);
        }
        ev.preventDefault();
      }
    };

    addWheelListener(el, wheelListener);

    // If we have a gesture context and gestures are enabled, register with it
    if (gestureContext && enableGestures) {
      let cancelled = false;
      let pinchEndedRecently = false;
      let pinchScale = 1;
      let pinchCancelled = false;
      let dragHandler: DragHandler | undefined;

      const handlers: ViewerGestureHandlers = {
        onSingleTap: (x, y, isMouse) => {
          chitRenderInstance.handleClick(x, y, isMouse ? 3 : 6, isMouse ? 1.5 : 3);
        },
        onDoubleTap: (x, y) => {
          const prev = chitRenderInstance.cameraZoom;
          chitRenderInstance.handleZoom(x, y, chitRenderInstance.cameraZoom <= 1 ? 0.0001 : -20, !!zoomCallback);
          if (zoomCallback) {
            zoomCallback(chitRenderInstance.cameraZoom, prev);
            setTimeout(() => chitRenderInstance.handleZoom(x, y, 0, false), 100);
          }
        },
        onLongTap: (x, y, isMouse) => {
          chitRenderInstance.handleLongClick(x, y, isMouse ? 3 : 6, isMouse ? 1.5 : 3);
        },
        onPanStart: (x, y, isMouse) => {
          if (pinchEndedRecently) {
            cancelled = true;
            return;
          }
          cancelled = false;

          const draggingChit = chitRenderInstance.handleBeginDrag(x, y, isMouse ? 3 : 6, isMouse ? 1.5 : 3);
          if (draggingChit) {
            dragHandler = draggingChit.renderInstance!.executeDrag(x, y);
          }
        },
        onPan: (dx, dy, ev) => {
          if (cancelled) {
            return;
          }

          if (dragHandler) {
            dragHandler.duringDrag(dx, dy);
            return;
          }

          if (panCallback) {
            const isMouse = ev.pointerType === "mouse";
            const neededVelocity = chitRenderInstance.cameraZoom <= 1.1 ? 0.3 : isMouse ? 7.5 : 2.5;
            if (Math.abs(ev.velocityX) > neededVelocity && ev.distance > 20 && Math.abs(ev.velocityY) < 0.2) {
              const direction = ev.velocityX > 0 ? "left" : "right";
              panCallback(direction);
              cancelled = true;
              return;
            }
          }
          // if (zoomCallback) {
          //   const isMouse = ev.pointerType === "mouse";
          //   const neededVelocity = chitRenderInstance.cameraZoom <= 1.1 ? 0.3 : isMouse ? 7.5 : 2.5;
          //   if (Math.abs(ev.velocityY) > neededVelocity && ev.distance > 20 && Math.abs(ev.velocityX) < 0.2) {
          //     const prev = chitRenderInstance.cameraZoom;
          //     chitRenderInstance.handleZoom(0, 0, chitRenderInstance.cameraZoom <= 1 ? 0.0001 : -20, !!zoomCallback);
          //     zoomCallback(chitRenderInstance.cameraZoom, prev);
          //     setTimeout(() => chitRenderInstance.handleZoom(0, 0, 0, false), 100);
          //     cancelled = true;
          //     return;
          //   }
          // }

          chitRenderInstance.handlePan(dx, dy);
        },
        onPanEnd: () => {
          if (cancelled) {
            return;
          }
          if (dragHandler) {
            dragHandler.finishDrag();
            dragHandler = undefined;
          }
        },
        onPinchStart: () => {
          pinchScale = chitRenderInstance.cameraZoom;
          pinchCancelled = false;
        },
        onPinch: (_scale, deltaScale, centerX, centerY) => {
          if (pinchCancelled) {
            return;
          }

          const prev = chitRenderInstance.cameraZoom;
          chitRenderInstance.handleZoom(centerX, centerY, pinchScale * deltaScale, false);

          if (zoomCallback) {
            zoomCallback(chitRenderInstance.cameraZoom, prev);
          }
          if (chitRenderInstance.cameraZoom <= 1 && prev > 1) {
            pinchCancelled = true;
          }
        },
        onPinchEnd: () => {
          pinchCancelled = true;
          pinchEndedRecently = true;
          setTimeout(() => (pinchEndedRecently = false), 200);
        },
      };

      const unregister = gestureContext.registerViewer({
        id,
        getBounds: () => el.getBoundingClientRect(),
        handlers,
      });

      return () => {
        unregister();
        removeWheelListener(el, wheelListener);
      };
    }

    // Fallback: no gesture context available, so we can't register
    return () => {
      removeWheelListener(el, wheelListener);
    };
  }, [
    id,
    myRefContainer,
    hardPaused,
    chitRenderInstance,
    modalState,
    panCallback,
    zoomCallback,
    gestureContext,
    enableGestures,
  ]);

  return (
    <PersistentCanvas
      width={w * rendererWrapper.pixelRatio}
      height={h * rendererWrapper.pixelRatio}
      displayWidth={w}
      displayHeight={h}
      canvasRef={myRefContainer}
    />
  );
}
