import React from "react";
import { Box } from "@mui/material";
import { Chit } from "../../game/Chit";
import { useGameTheme } from "../../hooks/useGameTheme";
import { ViewerWrapper } from "./ViewerWrapper";
import { panelTransition } from "./util";
import { useAnimationSpeedMultiplier } from "../../hooks/useTimeController";
import { TAB_HEIGHT } from "./PanelTabStack";
import { ZINDEX_PINCH_OUT_FOCUSED } from "../../utilities/zIndex";

export function SinglePanel({
  chit,
  x,
  y,
  w,
  h,
  paused = false,
  focusedPanel,
  setFocusedPanel,
  totalWidth,
  totalHeight,
}: {
  chit: Chit;
  x: number;
  y: number;
  w: number;
  h: number;
  paused?: boolean;
  focusedPanel?: Chit | undefined;
  setFocusedPanel: (chit: Chit | undefined) => void;
  totalWidth: number;
  totalHeight: number;
}) {
  const theme = useGameTheme();
  const animationSpeedMultiplier = useAnimationSpeedMultiplier();

  if (focusedPanel) {
    w = totalWidth;
    h = totalHeight - TAB_HEIGHT;
    x = 0;
    y = 0;

    if (focusedPanel !== chit) {
      paused = true;
    }
  }

  return (
    <Box
      sx={{
        overflow: "hidden",
        width: `${w}px`,
        height: `${h}px`,
        left: `${x}px`,
        top: `${y}px`,
        position: "absolute",
        p: `${theme.spacing / 4}px`,
        transition: focusedPanel ? panelTransition(theme, animationSpeedMultiplier) : null,
        zIndex: focusedPanel === chit ? ZINDEX_PINCH_OUT_FOCUSED : "auto",
        opacity: !focusedPanel || focusedPanel === chit ? 1 : 0,
      }}
    >
      <Box sx={{ width: "100%", height: "100%", position: "relative", borderRadius: "10px", overflow: "hidden" }}>
        <ViewerWrapper
          focusedPanel={focusedPanel}
          setFocusedPanel={setFocusedPanel}
          chit={chit}
          w={w - theme.spacing / 2}
          h={h - theme.spacing / 2}
          paused={paused}
          refContainer={null}
        />
      </Box>
    </Box>
  );
}
