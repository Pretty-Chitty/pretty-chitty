import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Stack } from "@mui/material";
import { useDebounce } from "@react-hook/debounce";
import { Chit } from "../../game/Chit";
import { useGameTheme } from "../../hooks/useGameTheme";
import { useAnimationSpeedMultiplier, useTimeController, useTimeState } from "../../hooks/useTimeController";
import { usePanelStates } from "../../hooks/usePanelStates";
import { RootChitRenderInstance } from "../../rendering/RootChitRenderInstance";
import { useEventChannelState } from "../../hooks/useEventChannelState";
import { ViewerWrapper } from "./ViewerWrapper";
import { panelTransition } from "./util";
import { PanelTabStack, TAB_HEIGHT } from "./PanelTabStack";
import { ZINDEX_PINCH_OUT_FOCUSED } from "../../utilities/zIndex";

const ANIMATION_DURATION = 0.125;

const PANEL_ADJUST_IGNORE_DURATION = 5000;

export function MultiPanel({
  chits,
  x,
  y,
  w,
  h,
  focusedPanel,
  setFocusedPanel,
  totalWidth,
  totalHeight,
}: {
  chits: Chit[];
  x: number;
  y: number;
  w: number;
  h: number;
  totalWidth: number;
  totalHeight: number;
  focusedPanel?: Chit | undefined;
  setFocusedPanel: (chit: Chit | undefined) => void;
}) {
  const theme = useGameTheme();
  const refContainer = useRef(null);
  const timeState = useTimeState();

  const timeController = useTimeController();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_targetClock, setTargetClock] = useEventChannelState(timeState.targetClock);
  const [maxClock] = useEventChannelState(timeController.maxClock);
  const [live] = useEventChannelState(timeState.live);

  const timeMultiplier = useAnimationSpeedMultiplier();

  const [ignoreChangesBefore, setIgnoreChangesBefore] = useState(0);

  const [isSliding, setIsSliding] = useState(false);
  const [isLoading] = useEventChannelState(timeState.isLoading);
  const [selectedIndex, setSelectedIndex] = useDebounce(0, 250, true);
  const rootRenders = chits.map((c) =>
    c.renderInstance instanceof RootChitRenderInstance ? c.renderInstance : undefined,
  );
  const panelStates = usePanelStates(rootRenders);

  const manuallyChangeSelectedIndex = useCallback(
    (index: number) => {
      if (index !== selectedIndex) {
        setSelectedIndex(index);
        if (live) {
          setTargetClock(maxClock.clock);
        }
        setIgnoreChangesBefore(Date.now() + PANEL_ADJUST_IGNORE_DURATION);
      }
    },
    [selectedIndex, setSelectedIndex, live, maxClock, setTargetClock],
  );

  useEffect(() => {
    if (ignoreChangesBefore) {
      const to = setTimeout(() => setIgnoreChangesBefore(0), ignoreChangesBefore - Date.now());
      return () => clearTimeout(to);
    }
  }, [ignoreChangesBefore]);

  let effectiveSelectedIndex = selectedIndex >= chits.length ? 0 : selectedIndex;

  const leavingIndex = panelStates.findIndex((p) => p.state === "leaving");
  const enteringIndex = panelStates.findIndex((p) => p.state === "entering");
  const pendingIndex = panelStates.findIndex((p) => p.state === "pending");

  const ignoringChanges = ignoreChangesBefore > Date.now();

  if (!isLoading && !ignoringChanges) {
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

  if (ignoringChanges) {
    rootRenders.forEach((chit) => chit && chit.resetMarks());
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
  const isAnimating = ignoringChanges ? false : Math.max(leavingIndex, enteringIndex, pendingIndex) >= 0;
  useEffect(() => {
    timeState.setAnimationState(key, isAnimating);
    return () => timeState.setAnimationState(key, false);
  }, [key, isAnimating, timeState]);

  const panCallback = useCallback(
    (direction: "left" | "right") => {
      if (direction === "left") {
        manuallyChangeSelectedIndex((chits.length + selectedIndex - 1) % chits.length);
      } else {
        manuallyChangeSelectedIndex((chits.length + selectedIndex + 1) % chits.length);
      }
    },
    [selectedIndex, chits, manuallyChangeSelectedIndex],
  );

  let effectiveTabHeight = TAB_HEIGHT;
  let zIndex: string | number = "auto";
  if (focusedPanel) {
    w = totalWidth;
    h = totalHeight - TAB_HEIGHT;
    x = 0;
    y = 0;

    if (chits.find((chit) => focusedPanel === chit)) {
      effectiveSelectedIndex = chits.findIndex((chit) => focusedPanel === chit);
      effectiveTabHeight = 0;
      zIndex = ZINDEX_PINCH_OUT_FOCUSED;
    }
  }

  return (
    <Stack
      sx={{
        width: `${w}px`,
        height: `${h}px`,
        left: `${x}px`,
        top: `${y}px`,
        position: "absolute",
        p: `${theme.spacing / 4}px`,
        zIndex,
        transition: focusedPanel ? panelTransition(theme, timeMultiplier) : null,
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
              overflow: "hidden",
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
              paused={
                focusedPanel && focusedPanel !== chit
                  ? true
                  : isLoading || ignoringChanges
                    ? false
                    : isSliding
                      ? true
                      : effectiveSelectedIndex !== index
              }
              chit={chit}
              w={w - theme.spacing / 2}
              h={h - effectiveTabHeight - theme.spacing / 2}
              panCallback={panCallback}
              focusedPanel={focusedPanel}
              setFocusedPanel={setFocusedPanel}
            />
          </Box>
        ))}
      </Box>

      {!focusedPanel && (
        <PanelTabStack
          chits={chits}
          selectedIndex={effectiveSelectedIndex}
          onSelectedIndexChange={manuallyChangeSelectedIndex}
        />
      )}
    </Stack>
  );
}
