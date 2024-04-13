import React, { ReactNode } from "react";
import { Box, Stack } from "@mui/material";
import { Chat, SkipNext, Speed } from "@mui/icons-material";
import { useTimeController, useTimeState } from "../hooks/useTimeController";
import { useEventChannelState } from "../hooks/useEventChannelState";
import BottomBarButton from "./BottomBarButton";
import { useGameTheme } from "../hooks/useGameTheme";
import TimeControlBar from "./TimeControlBar";
import PromptControls from "./PromptControls";

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

  return (
    <BaseBottomBar>
      <Stack direction="row" sx={{ width: "100%", height: "100%", pl: 1, pr: 1 }}>
        <BottomBarButton icon={Chat} label={"Chat"} />
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
