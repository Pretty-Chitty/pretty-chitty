import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Stack } from "@mui/material";
import { useDebounce } from "@react-hook/debounce";
import { Chit } from "../../game/Chit";
import { useGameTheme } from "../../hooks/useGameTheme";
import { useAnimationSpeedMultiplier, useTimeController, useTimeState } from "../../hooks/useTimeController";
import { usePanelStates } from "../../hooks/usePanelStates";
import { RootChitRenderInstance } from "../../rendering/RootChitRenderInstance";
import { useEventChannelState } from "../../hooks/useEventChannelState";
import { panelTransition } from "./util";
import { PanelTabStack, TAB_HEIGHT } from "./PanelTabStack";
import { usePanelPositioning } from "../../hooks/usePanelPositioning";
import { useSmartDebouncedState } from "../../hooks/useSmartDebouncedState";

const ANIMATION_DURATION = 0.125;

const PANEL_ADJUST_IGNORE_DURATION = 5000;

export function MultiPanel({
  chits,
  x,
  y,
  w,
  h,
  isFocusedPanel = false,
  focusedPanel,
  setFocusedPanel,
  enabled,
}: {
  chits: Chit[];
  x: number;
  y: number;
  w: number;
  h: number;
  enabled: boolean;
  isFocusedPanel: boolean;
  focusedPanel?: Chit | undefined;
  setFocusedPanel: (chit: Chit | undefined) => void;
}) {
  const theme = useGameTheme();
  const refContainer = useRef(null);
  const timeState = useTimeState();
  const { registerPosition } = usePanelPositioning();

  const timeController = useTimeController();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_targetClock, setTargetClock] = useEventChannelState(timeState.targetClock);
  const [maxClock] = useEventChannelState(timeController.maxClock);
  const [live] = useEventChannelState(timeState.live);

  const timeMultiplier = useAnimationSpeedMultiplier();

  const [ignoreChangesBefore, setIgnoreChangesBefore] = useState(0);

  const [isSliding, setIsSliding] = useState(false);
  const [isLoading] = useEventChannelState(timeState.isLoading);
  const [selectedIndex, setSelectedIndex] = useSmartDebouncedState(0, {
    interval: 250,
  });

  // Create a stable string of chit IDs for dependency tracking
  const chitIdsString = chits.map((c) => c.id).join("-");
  const chitsLength = chits.length;

  const rootRenders = chits.map((c) =>
    c.renderInstance instanceof RootChitRenderInstance ? c.renderInstance : undefined,
  );
  const panelStates = usePanelStates(rootRenders);

  const manuallyChangeSelectedIndex = useCallback(
    (index: number) => {
      if (index !== selectedIndex) {
        setSelectedIndex(index);
        if (isFocusedPanel) {
          (chits[index].renderInstance as RootChitRenderInstance)?.cameraWrapper?.handleZoom(0, 0, 0.0001, false);
        }
        if (live) {
          setTargetClock(maxClock.clock);
        }
        setIgnoreChangesBefore(Date.now() + PANEL_ADJUST_IGNORE_DURATION);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIndex, setSelectedIndex, live, maxClock, setTargetClock, isFocusedPanel, chitIdsString],
  );

  useEffect(() => {
    if (ignoreChangesBefore) {
      const to = setTimeout(() => setIgnoreChangesBefore(0), ignoreChangesBefore - Date.now());
      return () => clearTimeout(to);
    }
  }, [ignoreChangesBefore]);

  const effectiveSelectedIndex = selectedIndex >= chitsLength ? 0 : selectedIndex;

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

  if (isFocusedPanel && focusedPanel !== chits[effectiveSelectedIndex]) {
    setFocusedPanel(chits[effectiveSelectedIndex]);
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

  const key = `panel--${chitIdsString}`;
  const isAnimating = ignoringChanges ? false : Math.max(leavingIndex, enteringIndex, pendingIndex) >= 0;
  useEffect(() => {
    timeState.setAnimationState(key, isAnimating);
    return () => timeState.setAnimationState(key, false);
  }, [key, isAnimating, timeState]);

  const panCallback = useCallback(
    (direction: "left" | "right") => {
      if (direction === "left") {
        manuallyChangeSelectedIndex((chitsLength + selectedIndex - 1) % chitsLength);
      } else {
        manuallyChangeSelectedIndex((chitsLength + selectedIndex + 1) % chitsLength);
      }
    },
    [selectedIndex, chitsLength, manuallyChangeSelectedIndex],
  );

  // Register positions for all chits in this MultiPanel
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const transition = isLoading ? null : `left ease-in-out ${ANIMATION_DURATION * timeMultiplier}s`;

    chits.forEach((chit, index) => {
      const chitId = chit.id ?? "";
      const isPaused =
        focusedPanel && focusedPanel !== chit
          ? true
          : isLoading || ignoringChanges
            ? false
            : isSliding
              ? true
              : effectiveSelectedIndex !== index;

      // Calculate the x offset based on sliding position
      let xOffset = 0;
      if (index !== effectiveSelectedIndex) {
        // Off-screen panels are positioned 110% to the left or right
        xOffset = index > effectiveSelectedIndex ? w * 1.1 : -w * 1.1;
      }

      registerPosition(chitId, {
        chitId,
        x: x + theme.spacing / 4 + xOffset,
        y: y + theme.spacing / 4,
        w: w - theme.spacing / 2,
        h: h - TAB_HEIGHT - theme.spacing / 2,
        paused: isPaused,
        refContainer,
        panCallback,
        visible: true,
        transition,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    chitIdsString,
    effectiveSelectedIndex,
    w,
    h,
    x,
    y,
    enabled,
    isLoading,
    ignoringChanges,
    isSliding,
    focusedPanel,
    registerPosition,
    theme.spacing,
    refContainer,
    panCallback,
    timeMultiplier,
  ]);

  return (
    <Stack
      sx={{
        width: `${w}px`,
        height: `${h}px`,
        left: `${x}px`,
        top: `${y}px`,
        position: "absolute",
        zIndex: enabled ? "auto" : -1,
        p: `${theme.spacing / 4}px`,
        transition: panelTransition(theme, timeMultiplier),
      }}
    >
      <Box ref={refContainer} sx={{ width: "100%", flex: 1, position: "relative" }} />

      {enabled && (
        <PanelTabStack
          chits={chits}
          selectedIndex={effectiveSelectedIndex}
          onSelectedIndexChange={manuallyChangeSelectedIndex}
        />
      )}
    </Stack>
  );
}
