import React from "react";
import { SkipNext } from "@mui/icons-material";
import { useTimeController, useTimeState } from "../hooks/useTimeController";
import { useEventChannelState } from "../hooks/useEventChannelState";
import BottomBarButton from "./BottomBarButton";

export default function LiveButton({ hideIfLive = true }: { hideIfLive?: boolean }) {
  const timeController = useTimeController();
  const timeState = useTimeState();
  const [targetClock] = useEventChannelState(timeState.targetClock);
  const [maxClock] = useEventChannelState(timeController.maxClock);
  const [live] = useEventChannelState(timeState.live);
  // A tutorial holding the board counts as the end: there is nothing to skip to past it
  const [hold] = useEventChannelState(timeState.timelineHold);
  const end = hold === undefined ? maxClock.clock : Math.min(hold, maxClock.clock);

  if (hideIfLive && targetClock >= end) {
    return null;
  }

  return (
    <BottomBarButton
      disabled={targetClock >= end && live}
      icon={SkipNext}
      label={live && targetClock < end ? "Skip" : "Live"}
      invisible={live && targetClock >= end}
      onClick={() => timeState.goLive(end)}
    />
  );
}
