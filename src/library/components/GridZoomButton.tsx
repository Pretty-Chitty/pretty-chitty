import React from "react";
import { CalendarViewMonth } from "@mui/icons-material";
import { useTimeState } from "../hooks/useTimeController";
import { usePanelScale, usePanelSetScale } from "../hooks/usePanelScale";
import { useGame } from "../hooks/useGame";
import BottomBarButton from "./BottomBarButton";

export default function GridZoomButton() {
  const game = useGame();
  const timeState = useTimeState();
  const scale = usePanelScale();
  const setScale = usePanelSetScale();

  if (!game.showGrid) {
    return null;
  }

  const isLarge = window.innerWidth > 800;
  const zooms = isLarge ? [0.66, 1, 3] : [1, 3];
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
    <BottomBarButton icon={CalendarViewMonth} label={labels[zooms.indexOf(scale)] ?? "Grid"} onClick={toggleZoom} />
  );
}
