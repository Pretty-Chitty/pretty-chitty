import React from "react";
import { Box } from "@mui/material";
import { Chit } from "../../game/Chit";
import { useGameTheme } from "../../hooks/useGameTheme";
import { ViewerWrapper } from "./ViewerWrapper";
import { panelTransition } from "./util";
import { useAnimationSpeedMultiplier } from "../../hooks/useTimeController";

export function SinglePanel({
  chit,
  x,
  y,
  w,
  h,
  paused = false,
}: {
  chit: Chit;
  x: number;
  y: number;
  w: number;
  h: number;
  paused?: boolean;
}) {
  const theme = useGameTheme();
  const animationSpeedMultiplier = useAnimationSpeedMultiplier();
  return (
    <Box
      sx={{
        overflow: "hidden",
        width: `${w}px`,
        height: `${h}px`,
        left: `${x}px`,
        top: `${y}px`,
        position: "absolute",
        p: `${theme.spacing / 2}px`,
        transition: panelTransition(theme, animationSpeedMultiplier),
      }}
    >
      <Box sx={{ width: "100%", height: "100%", position: "relative", borderRadius: "10px", overflow: "hidden" }}>
        <ViewerWrapper chit={chit} w={w - theme.spacing} h={h - theme.spacing} paused={paused} refContainer={null} />
      </Box>
    </Box>
  );
}
