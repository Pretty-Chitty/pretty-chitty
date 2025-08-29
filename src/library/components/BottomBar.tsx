import React, { ReactNode } from "react";
import { Box, Stack } from "@mui/material";
import { CalendarViewMonth, SkipNext, Speed } from "@mui/icons-material";
import { useTimeController, useTimeState } from "../hooks/useTimeController";
import { useEventChannelState } from "../hooks/useEventChannelState";
import BottomBarButton from "./BottomBarButton";
import { useGameTheme } from "../hooks/useGameTheme";
import TimeControlBar from "./TimeControlBar";
import PromptControls from "./PromptControls";
import { usePanelScale, usePanelSetScale } from "../hooks/usePanelScale";
import { useGame } from "../hooks/useGame";

function BaseBottomBar({ children }: { children: ReactNode | ReactNode[] }) {
  const theme = useGameTheme();
  return (
    <Box
      sx={{
        overflow: "hidden",
        position: "relative",
        background: `${theme.barColor} linear-gradient(${theme.barGradientAngle}deg, rgba(255,255,255,${theme.barGradientPercent}) 0%, rgba(0,0,0,${theme.barGradientPercent}) 100%)`,
        height: theme.bottomBarHeight,
      }}
    >
      {children}
    </Box>
  );
}

export default function BottomBar() {
  const timeController = useTimeController();
  const game = useGame();
  const scale = usePanelScale();
  const setScale = usePanelSetScale();
  const timeState = useTimeState();
  const [targetClock] = useEventChannelState(timeState.targetClock);
  const [maxClock] = useEventChannelState(timeController.maxClock);
  const [live, setLive] = useEventChannelState(timeState.live);

  if (!live) {
    return (
      <BaseBottomBar>
        <TimeControlBar />
      </BaseBottomBar>
    );
  }

  const isLarge = window.innerWidth > 800;
  const zooms = isLarge ? [0.33, 1, 3] : [1, 3];
  const labels = isLarge ? ["0.5x", "Grid", "3x"] : ["Grid", "3x"];

  function toggleZoom() {
    if (timeState.isLoading.value === false) {
      timeState.isLoading.value = true;
      setTimeout(() => {
        timeState.isLoading.value = false;
      }, 200);
    }

    const currentIndex = zooms.indexOf(scale);
    setScale(zooms[(currentIndex + 1) % zooms.length]);
  }

  return (
    <BaseBottomBar>
      <Stack direction="row" sx={{ width: "100%", height: "100%", pl: 1, pr: 1 }}>
        {/* <BottomBarButton icon={Chat} label={"Chat"} /> */}
        {game.showGrid && (
          <BottomBarButton
            icon={CalendarViewMonth}
            label={labels[zooms.indexOf(scale)] ?? "Grid"}
            onClick={toggleZoom}
          />
        )}
        <BottomBarButton icon={Speed} label={"Timeline"} onClick={() => setLive(false)} />
        <Box flex={1} />
        <PromptControls />
        {targetClock < maxClock.clock && (
          <BottomBarButton icon={SkipNext} label={"Live"} onClick={() => timeState.goLive(maxClock.clock)} />
        )}
      </Stack>
    </BaseBottomBar>
  );
}
