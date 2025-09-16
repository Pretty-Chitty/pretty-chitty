import { Scene, Vector2 } from "three";
import { Box } from "@mui/material";
import React, { useEffect, useRef, useState } from "react";
import { Chit } from "../game/Chit";
import { RootChitRenderInstance } from "../rendering/RootChitRenderInstance";
import { useAnimationSpeedMultiplier, useTimeState } from "../hooks/useTimeController";
import { useEventChannelState } from "../hooks/useEventChannelState";
import Hammer from "@egjs/hammerjs";
import { addWheelListener, removeWheelListener } from "wheel";
import { useWebGlRenderer } from "../hooks/useWebGlRenderer";
import { useGalleryState } from "../hooks/useGalleryState";
import { usePlayerId } from "../hooks/usePlayer";

let ID_COUNTER = 1;

export default function Viewer({
  paused = false,
  chit,
  wireframes,
  w = 0,
  h = 0,
  paddingTop = 0,
  panCallback,
}: {
  chit: Chit;
  wireframes?: boolean;
  w: number;
  h: number;
  paddingTop?: number;
  paused?: boolean;
  panCallback?: (direction: "left" | "right") => void;
}) {
  const playerId = usePlayerId();
  const [id] = useState(`Viewer${ID_COUNTER++}`);
  const timeState = useTimeState();
  const animationSpeedMultiplier = useAnimationSpeedMultiplier();
  const [isLoading] = useEventChannelState(timeState.isLoading);
  const refContainer = useRef(null);
  const renderer = useWebGlRenderer(w, h);
  const [scene] = useState<Scene>(new Scene());
  const galleryState = useGalleryState();
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
  const R = RootChitRenderInstance;
  useEffect(() => {
    if (!chitRenderInstance || chitRenderInstance.chit !== chit || !(chitRenderInstance instanceof R)) {
      if (chitRenderInstance) {
        chitRenderInstance.destroy();
        scene.remove(chitRenderInstance.rootGroup);
      }

      if (chit.renderInstance) {
        chit.renderInstance.invalidateRootRenderInstance();
        chit.renderInstance.destroy();
      }

      const newInstance = new R(chit);
      newInstance.playerId = playerId;
      newInstance.convertCameraSpaceToScreenSpace = (x: number, y: number) => {
        const el = refContainer.current as unknown as HTMLElement;
        if (!el) {
          return;
        }
        const rect = el.getBoundingClientRect();

        return new Vector2(rect.left + ((1 + x) / 2) * rect.width, rect.top + ((1 - y) / 2) * rect.height);
      };
      newInstance.convertScreenSpaceToCameraSpace = (x: number, y: number) => {
        const el = refContainer.current as unknown as HTMLElement;
        if (!el) {
          return;
        }
        const rect = el.getBoundingClientRect();

        x -= rect.left;
        y -= rect.top;

        return new Vector2((x / rect.width) * 2 - 1, -((y / rect.height) * 2 - 1));
      };
      newInstance.setup(galleryState);
      setChitRenderInstance(newInstance);
      scene.add(newInstance.rootGroup);
    }
  }, [refContainer, playerId, animationSpeedMultiplier, chit, chitRenderInstance, scene, R, galleryState]);

  // make sure "wireframes" gets set correctly on the render instance
  useEffect(() => {
    if (chitRenderInstance) {
      chitRenderInstance.wireframes = !!wireframes;
    }
  }, [chitRenderInstance, wireframes]);

  // handle animation frames
  useEffect(() => {
    const canvas = refContainer.current as any as HTMLCanvasElement;
    if (!chitRenderInstance || !renderer || !canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    let renderNextFrame: boolean | undefined;
    let cancelled = false;
    const animate = () => {
      if (!cancelled) {
        try {
          // console.log(renderNextFrame);
          if (!paused) {
            requestAnimationFrame(animate);
          }
          if (chitRenderInstance && (renderNextFrame === undefined || renderNextFrame || chitRenderInstance.dirty)) {
            renderer.render(scene, chitRenderInstance.camera);
            context.drawImage(renderer.domElement, 0, 0, w * window.devicePixelRatio, h * window.devicePixelRatio);
            chitRenderInstance.dirty = false;
            timeState.setAnimationState(id, !paused);
          } else {
            timeState.setAnimationState(id, false);
          }
          renderNextFrame = chitRenderInstance?.update();
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
  }, [id, timeState, renderer, scene, chitRenderInstance, paused, refContainer, w, h]);

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
  useEffect(() => {
    const el = refContainer.current as unknown as HTMLElement;
    if (el) {
      if (!chitRenderInstance) {
        return;
      }

      const hammer = new Hammer.Manager(el);

      const fixPosition = (ev: HammerInput) => {
        const rect = el.getBoundingClientRect();
        return { x: ev.center.x - rect.left, y: ev.center.y - rect.top };
      };

      hammer.add(new Hammer.Tap({ event: "doubletap", taps: 2, interval: 300, threshold: 5, posThreshold: 50 }));
      hammer.add(new Hammer.Tap({ event: "singletap", time: 400 }));
      hammer.add(new Hammer.Pinch({ event: "pinch", threshold: 0.03 }));
      hammer.add(new Hammer.Pan({ event: "pan", direction: Hammer.DIRECTION_ALL }));

      hammer.add(new Hammer.Press({ event: "longtap", time: 600 }));

      hammer.get("doubletap").recognizeWith("singletap");
      hammer.get("singletap").requireFailure("doubletap");

      hammer.get("longtap").recognizeWith("singletap");
      hammer.get("singletap").requireFailure("longtap");

      hammer.on("longtap", (ev) => {
        const pos = fixPosition(ev);
        const isMouse = ev.pointerType === "mouse";
        chitRenderInstance.handleLongClick(pos.x, pos.y, isMouse ? 3 : 6, isMouse ? 1.5 : 3);
      });
      hammer.on("singletap", (ev) => {
        const pos = fixPosition(ev);
        const isMouse = ev.pointerType === "mouse";
        chitRenderInstance.handleClick(pos.x, pos.y, isMouse ? 3 : 6, isMouse ? 1.5 : 3);
      });
      hammer.on("doubletap", (ev) => {
        const pos = fixPosition(ev);
        chitRenderInstance.handleZoom(pos.x, pos.y, chitRenderInstance.cameraZoom <= 1.1 ? 20 : -20, true);
      });

      hammer.on("pinch", (ev) => {
        console.log(ev);
      });

      let lastDeltaX = 0,
        lastDeltaY = 0,
        cancelled = false,
        pinchEndedRecently = false;
      hammer.on("panstart", () => {
        // Prevent a quick pan after pinch
        if (pinchEndedRecently) {
          cancelled = true;
          return;
        }
        lastDeltaX = 0;
        lastDeltaY = 0;
        cancelled = false;
      });
      hammer.on("pan", (ev) => {
        if (cancelled) {
          return;
        }

        const dx = ev.deltaX - lastDeltaX,
          dy = ev.deltaY - lastDeltaY;

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

        lastDeltaX = ev.deltaX;
        lastDeltaY = ev.deltaY;

        chitRenderInstance.handlePan(dx, dy);
      });

      let lastScale = 1,
        pinchScale = 1;
      hammer.on("pinchstart", () => {
        lastScale = 1;
        pinchScale = chitRenderInstance.cameraZoom;
        cancelled = false;
      });
      hammer.on("pinchend", () => {
        cancelled = true;
        pinchEndedRecently = true;
        setTimeout(() => (pinchEndedRecently = false), 200);
      });
      hammer.on("pinch", (ev) => {
        if (cancelled) {
          return;
        }

        const pos = fixPosition(ev);
        const sx = ev.scale - lastScale;
        lastScale = ev.scale;

        chitRenderInstance.handleZoom(pos.x, pos.y, pinchScale * sx, false);
      });

      const wheelListener = (ev: any) => {
        if (panCallback && Math.abs(ev.deltaX) > 30 && Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) {
          const direction = ev.deltaX > 0 ? "left" : "right";
          panCallback(direction);
          ev.preventDefault();
        } else {
          const dy = ev.wheelDeltaY as number;
          chitRenderInstance.handleZoom(ev.layerX as number, ev.layerY as number, dy / 120, false);
          ev.preventDefault();
        }
      };

      addWheelListener(el, wheelListener);

      return () => {
        hammer.destroy();
        removeWheelListener(el, wheelListener);
      };
    }
  }, [refContainer, chitRenderInstance, galleryState, panCallback]);

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
