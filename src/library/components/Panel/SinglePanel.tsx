import React, { useEffect } from "react";
import { Box } from "@mui/material";
import { Chit } from "../../game/Chit";
import { useGameTheme } from "../../hooks/useGameTheme";
import { panelTransition } from "./util";
import { useAnimationSpeedMultiplier } from "../../hooks/useTimeController";
import { usePanelPositioning } from "../../hooks/usePanelPositioning";

export function SinglePanel({
  chit,
  x,
  y,
  w,
  h,
  enabled,
  paused = false,
  focusedPanel,
  setFocusedPanel: _setFocusedPanel,
}: {
  chit: Chit;
  x: number;
  y: number;
  w: number;
  h: number;
  enabled: boolean;
  paused?: boolean;
  focusedPanel?: Chit | undefined;
  setFocusedPanel: (chit: Chit | undefined) => void;
}) {
  const theme = useGameTheme();
  const panelSpacing = theme.getPanelSpacing();
  const animationSpeedMultiplier = useAnimationSpeedMultiplier();
  const { registerPosition } = usePanelPositioning();

  const effectivePaused = !enabled ? true : paused;

  const transition = panelTransition(theme, animationSpeedMultiplier);

  // Register position for ViewerWrapper (only when NOT in full-screen focus mode)
  useEffect(() => {
    // If focusedPanel is set, don't register - the full-screen MultiPanel in PanelContents handles it
    if (!enabled) {
      return;
    }

    const chitId = chit.id ?? "";
    registerPosition(chitId, {
      chitId,
      x: x + panelSpacing / 4,
      y: y + panelSpacing / 4,
      w: w - panelSpacing / 2,
      h: h - panelSpacing / 2,
      paused: effectivePaused,
      front: true,
      visible: true,
      transition,
    });
  }, [chit, x, y, w, h, transition, effectivePaused, enabled, focusedPanel, registerPosition, panelSpacing]);

  return (
    <Box
      sx={{
        overflow: "hidden",
        width: `${w}px`,
        height: `${h}px`,
        left: `${x}px`,
        top: `${y}px`,
        position: "absolute",
        p: `${panelSpacing / 4}px`,
        transition,
        zIndex: enabled ? "auto" : -1,
      }}
    >
      <Box sx={{ width: "100%", height: "100%", position: "relative", borderRadius: "10px", overflow: "hidden" }} />
    </Box>
  );
}
