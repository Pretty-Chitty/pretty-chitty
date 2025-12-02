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

  if (hideIfLive && targetClock >= maxClock.clock) {
    return null;
  }

  return (
    <BottomBarButton
      disabled={targetClock >= maxClock.clock && live}
      icon={SkipNext}
      label={"Live"}
      onClick={() => timeState.goLive(maxClock.clock)}
    />
  );
}
