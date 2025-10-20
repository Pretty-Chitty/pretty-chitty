import React, { ReactNode, useRef } from "react";
import { Box, Stack } from "@mui/material";
import { useGameTheme } from "../hooks/useGameTheme";
import TimeControlBar from "./TimeControlBar";
import PromptControls from "./PromptControls";
import GridZoomButton from "./GridZoomButton";
import useSize from "@react-hook/size";

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
  const theme = useGameTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width] = useSize(containerRef);

  const layoutSize = theme.layoutSize(width);

  // Mobile: current behavior (live mode shows buttons, timeline mode shows TimeControlBar)
  if (layoutSize === "mobile") {
    return (
      <BaseBottomBar>
        <Stack ref={containerRef} direction="row" sx={{ width: "100%", height: "100%", pl: 1, pr: 1 }}>
          <TimeControlBar />
          <Box flex={1} />
          <PromptControls collapsible />
        </Stack>
      </BaseBottomBar>
    );
  }

  // Medium: time controls left half, prompt controls right half
  if (layoutSize === "medium") {
    return (
      <BaseBottomBar>
        <Stack ref={containerRef} direction="row" sx={{ width: "100%", height: "100%" }}>
          <Box sx={{ width: "50%", display: "flex", alignItems: "center" }}>
            <TimeControlBar autoLive includeGridButton />
          </Box>
          <Box sx={{ width: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <PromptControls />
          </Box>
        </Stack>
      </BaseBottomBar>
    );
  }

  // Large: time controls left 1/3, prompt controls middle 1/3, empty right 1/3
  return (
    <BaseBottomBar>
      <Stack ref={containerRef} direction="row" sx={{ width: "100%", height: "100%" }}>
        <Box flex={1}>
          <TimeControlBar autoLive />
        </Box>
        <Box
          sx={{ width: `${theme.actionBarWidth}px`, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <PromptControls />
        </Box>
        <Box flex={1}>
          <Stack direction="row" sx={{ pr: 1, pl: 1, height: "100%", width: "100%" }}>
            <Box flex={1} />
            <GridZoomButton />
          </Stack>
        </Box>
      </Stack>
    </BaseBottomBar>
  );
}
