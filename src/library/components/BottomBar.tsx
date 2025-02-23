import React, { ReactNode } from "react";
import { Box, Stack } from "@mui/material";
import { CalendarViewMonth, Chat, Grid3x3, SkipNext, Speed } from "@mui/icons-material";
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
  const [targetClock, setTargetClock] = useEventChannelState(timeState.targetClock);
  const [maxClock] = useEventChannelState(timeController.maxClock);
  const [live, setLive] = useEventChannelState(timeState.live);

  if (!live) {
    return (
      <BaseBottomBar>
        <TimeControlBar />
      </BaseBottomBar>
    );
  }

  function toggleZoom() {
    if (scale > 1) {
      if (timeState.isLoading.value === false) {
        timeState.isLoading.value = true;
        setTimeout(() => {
          timeState.isLoading.value = false;
        }, 200);
      }

      setScale(1);
    } else {
      setScale(3);
    }
  }

  return (
    <BaseBottomBar>
      <Stack direction="row" sx={{ width: "100%", height: "100%", pl: 1, pr: 1 }}>
        {/* <BottomBarButton icon={Chat} label={"Chat"} /> */}
        {game.showGrid && (
          <BottomBarButton highlight={scale > 1} icon={CalendarViewMonth} label={"Grid"} onClick={toggleZoom} />
        )}
        <BottomBarButton icon={Speed} label={"Timeline"} onClick={() => setLive(false)} />
        <Box flex={1} />
        <PromptControls />
        {targetClock < maxClock.clock && (
          <BottomBarButton
            icon={SkipNext}
            label={"Live"}
            onClick={() => {
              setTargetClock(maxClock.clock);
              setLive(true);
            }}
          />
        )}
      </Stack>
    </BaseBottomBar>
  );
}
