import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Stack } from "@mui/material";
import { useDebounce } from "@react-hook/debounce";
import { Chit } from "../../game/Chit";
import { useGameTheme } from "../../hooks/useGameTheme";
import { useAnimationSpeedMultiplier, useTimeController, useTimeState } from "../../hooks/useTimeController";
import { usePanelStates } from "../../hooks/usePanelStates";
import { RootChitRenderInstance } from "../../rendering/RootChitRenderInstance";
import { useEventChannelState } from "../../hooks/useEventChannelState";
import { ZINDEX_PANEL_CUTOUTS } from "../../utilities/zIndex";
import { ViewerWrapper } from "./ViewerWrapper";
import { Cutout } from "./cutout";
import { panelTransition } from "./util";

export function MultiPanel({ chits, x, y, w, h }: { chits: Chit[]; x: number; y: number; w: number; h: number }) {
  const theme = useGameTheme();
  const refContainer = useRef(null);
  const timeState = useTimeState();

  const timeController = useTimeController();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_targetClock, setTargetClock] = useEventChannelState(timeState.targetClock);
  const [maxClock] = useEventChannelState(timeController.maxClock);
  const [live] = useEventChannelState(timeState.live);

  const timeMultiplier = useAnimationSpeedMultiplier();

  const [isSliding, setIsSliding] = useState(false);
  const [isLoading] = useEventChannelState(timeState.isLoading);
  const [selectedIndex, setSelectedIndex] = useDebounce(0);
  const rootRenders = chits.map((c) =>
    c.renderInstance instanceof RootChitRenderInstance ? c.renderInstance : undefined,
  );
  const panelStates = usePanelStates(rootRenders);
  const CUTOUT_WIDTH = Math.min(40, (w - theme.spacing * 2) / chits.length);
  const CUTOUT_HEIGHT = 14;
  const ANIMATION_DURATION = 0.125;

  const effectiveSelectedIndex = selectedIndex >= chits.length ? 0 : selectedIndex;

  const leavingIndex = panelStates.findIndex((p) => p.state === "leaving");
  const enteringIndex = panelStates.findIndex((p) => p.state === "entering");
  const pendingIndex = panelStates.findIndex((p) => p.state === "pending");

  if (!isLoading) {
    if (leavingIndex >= 0) {
      if (panelStates[effectiveSelectedIndex].state !== "leaving") {
        // if our current panel is entering... obviously stay there
        setSelectedIndex(leavingIndex);
      }
    } else if (enteringIndex >= 0) {
      if (panelStates[effectiveSelectedIndex].state !== "entering") {
        // if our current panel is entering... obviously stay there
        setSelectedIndex(enteringIndex);
      }
    } else if (pendingIndex >= 0) {
      if (panelStates[effectiveSelectedIndex].state !== "pending") {
        // if our current panel is pending... obviously stay there
        setSelectedIndex(pendingIndex);
      }
    }
  }

  useEffect(() => {
    setIsSliding(true);
    const to = setTimeout(
      () => {
        setIsSliding(false);
      },
      ANIMATION_DURATION * 1000 * timeMultiplier,
    );
    return () => clearTimeout(to);
  }, [selectedIndex, timeState, timeMultiplier]);

  const key = `panel--${chits.map((c) => c.id).join("-")}`;
  const isAnimating = Math.max(leavingIndex, enteringIndex, pendingIndex) >= 0;
  useEffect(() => {
    timeState.setAnimationState(key, isAnimating);
    return () => timeState.setAnimationState(key, false);
  }, [key, isAnimating, timeState]);

  const panCallback = useCallback(
    (direction: "left" | "right") => {
      if (direction === "left") {
        setSelectedIndex((chits.length + selectedIndex - 1) % chits.length);
      } else {
        setSelectedIndex((chits.length + selectedIndex + 1) % chits.length);
      }

      if (live) {
        setTargetClock(maxClock.clock);
        chits.forEach((chit) => chit.renderInstance?.rootRenderInstance.resetMarks());
      }
    },
    [selectedIndex, chits, setSelectedIndex, maxClock, setTargetClock, live],
  );

  return (
    <Stack
      sx={{
        overflow: "hidden",
        width: `${w}px`,
        height: `${h}px`,
        left: `${x}px`,
        top: `${y}px`,
        position: "absolute",
        p: `${theme.spacing / 2}px`,
        transition: panelTransition(theme, timeMultiplier),
      }}
    >
      <Box
        ref={refContainer}
        sx={{ width: "100%", flex: 1, position: "relative", borderRadius: "10px", overflow: "hidden" }}
      >
        {chits.map((chit, index) => (
          <Box
            key={chit.id}
            sx={{
              width: "100%",
              height: "100%",
              transition: isLoading ? null : `transform ease-in-out ${ANIMATION_DURATION * timeMultiplier}s`,
              position: "absolute",
              left: 0,
              top: 0,
              transform:
                index === effectiveSelectedIndex
                  ? `translateX(0)`
                  : `translateX(${index > effectiveSelectedIndex ? "110%" : "-110%"})`,
            }}
          >
            <ViewerWrapper
              refContainer={refContainer}
              paused={isLoading ? false : isSliding ? true : effectiveSelectedIndex !== index}
              chit={chit}
              w={w - theme.spacing}
              h={h - CUTOUT_HEIGHT - theme.spacing}
              panCallback={panCallback}
            />
          </Box>
        ))}
      </Box>

      <Stack direction="row" sx={{ height: CUTOUT_HEIGHT }}>
        <Box flex={1} />
        <Box
          sx={{
            width: CUTOUT_WIDTH * chits.length,
            position: "relative",
            mask: `url(${Cutout})`,
            maskSize: `${CUTOUT_WIDTH}px ${CUTOUT_HEIGHT}px`,
          }}
        >
          {chits.map((chit, index) => (
            <Box
              onMouseDown={() => setSelectedIndex(index)}
              key={chit.id}
              sx={{
                zIndex: ZINDEX_PANEL_CUTOUTS,
                cursor: "pointer",
                height: CUTOUT_HEIGHT,
                width: CUTOUT_WIDTH,
                position: "absolute",
                top: 0,
                left: index * CUTOUT_WIDTH,
              }}
            />
          ))}
          <Box sx={{ height: CUTOUT_HEIGHT, width: "100%", background: theme.panelSelectionCutoutBackground }}></Box>
          <Box
            sx={{
              height: CUTOUT_HEIGHT,
              width: CUTOUT_WIDTH,
              transition: `left ease-in-out ${ANIMATION_DURATION * timeMultiplier}s`,
              background: theme.panelSelectionCutoutSelected,
              position: "absolute",
              top: 0,
              left: effectiveSelectedIndex * CUTOUT_WIDTH,
            }}
          />
        </Box>
        <Box flex={1} />
      </Stack>
    </Stack>
  );
}
