import React from "react";
import { Box, Stack } from "@mui/material";
import { FastForward, FastRewind, SettingsOutlined } from "@mui/icons-material";
import { useTimeController, useTimeState } from "../hooks/useTimeController";
import { useEventChannelState } from "../hooks/useEventChannelState";
import BottomBarButton from "./BottomBarButton";
import { useGameTheme } from "../hooks/useGameTheme";
import LiveButton from "./LiveButton";
import { useModalState } from "../hooks/useModalState";

export default function TimeControlBar({ autoLive = false }: { autoLive?: boolean; includeGridButton?: boolean }) {
  const theme = useGameTheme();
  const timeController = useTimeController();
  const timeState = useTimeState();
  const [live, setLive] = useEventChannelState(timeState.live);
  const [targetClock, setTargetClock] = useEventChannelState(timeState.targetClock);
  const [maxClock] = useEventChannelState(timeController.maxClock);
  const modalState = useModalState();
  const [settingsVisible, setSettingsVisible] = useEventChannelState(modalState.settingsVisible);

  return (
    <Box sx={{ width: "100%", height: "100%", position: "relative" }}>
      <Box sx={{ height: "6px", position: "absolute", width: "100%" }}>
        {targetClock < maxClock.clock && !live && (
          <Box
            sx={{
              width: `${(targetClock / maxClock.clock) * 100}%`,
              background: theme.barHighlightTextColor,
              transition: "width linear 0.25s",
              height: "6px",
            }}
          />
        )}
      </Box>

      <Stack direction="row" sx={{ width: "100%", height: "100%", pl: 1, pr: 1 }}>
        <BottomBarButton
          icon={SettingsOutlined}
          label={"Menu"}
          onClick={() => setSettingsVisible(!settingsVisible)}
          highlight={settingsVisible}
        />
        <Box flex={1} />
        <BottomBarButton
          icon={FastRewind}
          label={"Back"}
          whileHolding={(n: number) => {
            setLive(false);
            setTargetClock(targetClock - n);
          }}
        />
        <BottomBarButton
          disabled={targetClock >= maxClock.clock}
          icon={FastForward}
          label={"Forward"}
          whileHolding={(n: number) => {
            if (autoLive && targetClock + n >= maxClock.clock) {
              setLive(true);
              setTargetClock(targetClock + n);
            } else {
              setLive(false);
              setTargetClock(targetClock + n);
            }
          }}
        />
        <Box flex={1} />
        <LiveButton hideIfLive={false} />
      </Stack>
    </Box>
  );
}
