import React, { ReactNode, useRef } from "react";
import { Box, Stack } from "@mui/material";
import { Speed } from "@mui/icons-material";
import { useTimeState } from "../hooks/useTimeController";
import { useEventChannelState } from "../hooks/useEventChannelState";
import BottomBarButton from "./BottomBarButton";
import { useGameTheme } from "../hooks/useGameTheme";
import TimeControlBar from "./TimeControlBar";
import PromptControls from "./PromptControls";
import GridZoomButton from "./GridZoomButton";
import LiveButton from "./LiveButton";
import useSize from "@react-hook/size";

type LayoutSize = "mobile" | "medium" | "large";

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
  const timeState = useTimeState();
  const [live, setLive] = useEventChannelState(timeState.live);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width] = useSize(containerRef);

  const layoutSize: LayoutSize = width >= 1200 ? "large" : width >= 768 ? "medium" : "mobile";

  // Mobile: current behavior (live mode shows buttons, timeline mode shows TimeControlBar)
  if (layoutSize === "mobile") {
    if (!live) {
      return (
        <BaseBottomBar>
          <Box ref={containerRef} sx={{ width: "100%", height: "100%" }}>
            <TimeControlBar />
          </Box>
        </BaseBottomBar>
      );
    }

    return (
      <BaseBottomBar>
        <Stack ref={containerRef} direction="row" sx={{ width: "100%", height: "100%", pl: 1, pr: 1 }}>
          <GridZoomButton />
          <BottomBarButton icon={Speed} label={"Timeline"} onClick={() => setLive(false)} />
          <Box flex={1} />
          <PromptControls collapsible />
          <LiveButton />
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
        <Box sx={{ width: "30%", display: "flex", alignItems: "center" }}>
          <TimeControlBar autoLive />
        </Box>
        <Box sx={{ width: "40%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <PromptControls />
        </Box>
        <Stack direction="row" sx={{ width: "30%", pr: 1, pl: 1 }}>
          <Box flex={1} />
          <GridZoomButton />
        </Stack>
      </Stack>
    </BaseBottomBar>
  );
}
