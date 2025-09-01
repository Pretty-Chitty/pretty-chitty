import React, { useCallback, useContext, useEffect, useState } from "react";
import base64 from "base-64";
import { Box, Stack } from "@mui/material";
import { useDebounce } from "@react-hook/debounce";
import { Chit } from "../game/Chit";
import Viewer from "./Viewer";
import { PanelLayoutResult, PanelChit } from "../game/PanelChit";
import { useGameTheme } from "../hooks/useGameTheme";

import { useAnimationSpeedMultiplier, useTimeController, useTimeState } from "../hooks/useTimeController";
import { usePanelStates } from "../hooks/usePanelStates";
import { RootChitRenderInstance } from "../rendering/RootChitRenderInstance";
import { useEventChannelState } from "../hooks/useEventChannelState";
import PanelSpark from "./PanelSpark";
import { useChit } from "../hooks/useChits";
import { ZINDEX_PANEL_CUTOUTS, ZINDEX_SPARKS } from "../utilities/zIndex";
import { usePanelScale } from "../hooks/usePanelScale";
import { usePlayerId } from "../hooks/usePlayer";
import { RootChit } from "../game/RootChit";

const Cutout = `data:image/svg+xml;base64,${base64.encode(
  `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg
   width="40"
   height="14"
   version="1.1"
   id="svg4"
   sodipodi:docname="cutout.svg"
   viewport="0 0 40 14"
   inkscape:version="1.3.1 (9b9bdc1480, 2023-11-25, custom)"
   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
   xmlns="http://www.w3.org/2000/svg"
   xmlns:svg="http://www.w3.org/2000/svg">
  <rect
     style="fill:#000000;stroke-width:1.58232"
     id="rect4"
     width="34"
     height="8"
     x="3"
     y="6"
     ry="4" />
</svg>`,
)}`;

function ViewerWrapper({
  chit,
  w,
  h,
  paused,
  panCallback,
}: {
  chit: Chit;
  w: number;
  h: number;
  paused: boolean;
  panCallback?: (direction: "left" | "right") => void;
}) {
  const chitInstance = useChit(chit.id ?? "nochit");
  const theme = useGameTheme();

  // if time is overridden, we don't want to pause ourselves (ever)
  // it's likely trying to play "catchup" and will go very very fast
  const timeState = useTimeState();
  const [override] = useEventChannelState(timeState.animationSpeedOverrideMultiplier);

  const sparks = chitInstance?.getSparks("panel") ?? [];

  const sparkHeight = theme.sparkSize + theme.sparkBorderWidth * 2 + theme.sparkPadding * 2;
  const sparkWidth = sparkHeight * 1.45;
  const sparkRows = Math.ceil((sparks.length * sparkWidth) / w);

  return (
    <>
      <Stack direction={"row"} flexWrap={"wrap"} sx={{ position: "absolute", zIndex: ZINDEX_SPARKS }}>
        {sparks.map((spark, i) => (
          <PanelSpark zIndex={ZINDEX_SPARKS + sparks.length - i} key={spark.id} chit={spark} paused={paused} />
        ))}
      </Stack>
      <Viewer
        paused={override ? false : paused}
        chit={chit}
        w={w}
        h={h}
        paddingTop={sparkRows * sparkHeight}
        panCallback={panCallback}
      />
    </>
  );
}

function SinglePanel({
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
      }}
    >
      <Box sx={{ width: "100%", height: "100%", position: "relative", borderRadius: "10px", overflow: "hidden" }}>
        <ViewerWrapper chit={chit} w={w - theme.spacing} h={h - theme.spacing} paused={paused} />
      </Box>
    </Box>
  );
}

function MultiPanel({ chits, x, y, w, h }: { chits: Chit[]; x: number; y: number; w: number; h: number }) {
  const theme = useGameTheme();
  const timeState = useTimeState();

  const timeController = useTimeController();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_targetClock, setTargetClock] = useEventChannelState(timeState.targetClock);
  const [maxClock] = useEventChannelState(timeController.maxClock);
  const [live] = useEventChannelState(timeState.live);

  const timeMultiplier = useAnimationSpeedMultiplier();

  const [isSliding, setIsSliding] = useState(false);
  const [isLoading] = useEventChannelState(timeState.isLoading);
  const [selectedIndex, setSelectedIndex] = useDebounce(0);
  const rootRenders = chits.map((c) =>
    c.renderInstance instanceof RootChitRenderInstance ? c.renderInstance : undefined,
  );
  const panelStates = usePanelStates(rootRenders);
  const CUTOUT_WIDTH = Math.min(40, (w - theme.spacing * 2) / chits.length);
  const CUTOUT_HEIGHT = 14;
  const ANIMATION_DURATION = 0.25;

  const leavingIndex = panelStates.findIndex((p) => p.state === "leaving");
  const enteringIndex = panelStates.findIndex((p) => p.state === "entering");
  const pendingIndex = panelStates.findIndex((p) => p.state === "pending");

  if (!isLoading) {
    if (leavingIndex >= 0) {
      if (panelStates[selectedIndex].state !== "leaving") {
        // if our current panel is entering... obviously stay there
        setSelectedIndex(leavingIndex);
      }
    } else if (enteringIndex >= 0) {
      if (panelStates[selectedIndex].state !== "entering") {
        // if our current panel is entering... obviously stay there
        setSelectedIndex(enteringIndex);
      }
    } else if (pendingIndex >= 0) {
      if (panelStates[selectedIndex].state !== "pending") {
        // if our current panel is pending... obviously stay there
        setSelectedIndex(pendingIndex);
      }
    }
  }

  useEffect(() => {
    setIsSliding(true);
    const to = setTimeout(
      () => {
        setIsSliding(false);
      },
      ANIMATION_DURATION * 1000 * timeMultiplier,
    );
    return () => clearTimeout(to);
  }, [selectedIndex, timeState, timeMultiplier]);

  const key = `panel--${chits.map((c) => c.id).join("-")}`;
  const isAnimating = Math.max(leavingIndex, enteringIndex, pendingIndex) >= 0;
  useEffect(() => {
    timeState.setAnimationState(key, isAnimating);
  }, [key, isAnimating, timeState]);

  const panCallback = useCallback(
    (direction: "left" | "right") => {
      if (direction === "left") {
        setSelectedIndex((chits.length + selectedIndex - 1) % chits.length);
      } else {
        setSelectedIndex((chits.length + selectedIndex + 1) % chits.length);
      }

      if (live) {
        setTargetClock(maxClock.clock);
        chits.forEach((chit) => chit.renderInstance?.rootRenderInstance.resetMarks());
      }
    },
    [selectedIndex, chits, setSelectedIndex, maxClock, setTargetClock, live],
  );

  return (
    <Stack
      sx={{
        overflow: "hidden",
        width: `${w}px`,
        height: `${h}px`,
        left: `${x}px`,
        top: `${y}px`,
        position: "absolute",
        p: `${theme.spacing / 2}px`,
      }}
    >
      <Box sx={{ width: "100%", flex: 1, position: "relative", borderRadius: "10px", overflow: "hidden" }}>
        {chits.map((chit, index) => (
          <Box
            key={chit.id}
            sx={{
              width: "100%",
              height: "100%",
              transition: isLoading ? null : `transform ease-in-out ${ANIMATION_DURATION * timeMultiplier}s`,
              position: "absolute",
              left: 0,
              top: 0,
              transform:
                index === selectedIndex ? `translateX(0)` : `translateX(${index > selectedIndex ? "110%" : "-110%"})`,
            }}
          >
            <ViewerWrapper
              paused={isLoading ? false : isSliding ? true : selectedIndex !== index}
              chit={chit}
              w={w - theme.spacing}
              h={h - CUTOUT_HEIGHT - theme.spacing}
              panCallback={panCallback}
            />
          </Box>
        ))}
      </Box>

      <Stack direction="row" sx={{ height: CUTOUT_HEIGHT }}>
        <Box flex={1} />
        <Box
          sx={{
            width: CUTOUT_WIDTH * chits.length,
            position: "relative",
            mask: `url(${Cutout})`,
            maskSize: `${CUTOUT_WIDTH}px ${CUTOUT_HEIGHT}px`,
          }}
        >
          {chits.map((chit, index) => (
            <Box
              onClick={() => setSelectedIndex(index)}
              key={chit.id}
              sx={{
                zIndex: ZINDEX_PANEL_CUTOUTS,
                cursor: "pointer",
                height: CUTOUT_HEIGHT,
                width: CUTOUT_WIDTH,
                position: "absolute",
                top: 0,
                left: index * CUTOUT_WIDTH,
              }}
            />
          ))}
          <Box sx={{ height: CUTOUT_HEIGHT, width: "100%", background: theme.panelSelectionCutoutBackground }}></Box>
          <Box
            sx={{
              height: CUTOUT_HEIGHT,
              width: CUTOUT_WIDTH,
              transition: `left ease-in-out ${ANIMATION_DURATION}s`,
              background: theme.panelSelectionCutoutSelected,
              position: "absolute",
              top: 0,
              left: selectedIndex * CUTOUT_WIDTH,
            }}
          />
        </Box>
        <Box flex={1} />
      </Stack>
    </Stack>
  );
}

export default function Panel({
  chit,
  x,
  y,
  w,
  h,
}: {
  chit: Chit | Chit[];
  x: number;
  y: number;
  w: number;
  h: number;
}) {
  const [layout, setLayout] = useState<PanelLayoutResult[]>([]);
  const scale = usePanelScale();
  const playerId = usePlayerId();

  useEffect(() => {
    if (!chit) {
      return;
    }

    if (chit instanceof PanelChit) {
      const newLayout = chit.getFlatLayout(w, h, scale, playerId);
      setLayout(newLayout);
    } else {
      setLayout([{ chit, x: 0, y: 0, w, h }]);
    }
  }, [chit, w, h, setLayout, scale, playerId]);

  // we are just given a root chit
  let renderHiddenRootChit = false;
  if (!Array.isArray(chit) && chit instanceof RootChit) {
    // if we are showing the root chit, no reason to render a fake hidden chit
    if (layout.length === 1 && layout[0].chit === chit) {
      renderHiddenRootChit = false;
    } else {
      renderHiddenRootChit = true;
    }
  }

  if (layout.length > 1) {
    return (
      <>
        {layout.map((cell) => (
          <Panel key={cell.id} chit={cell.chit} x={x + cell.x} y={y + cell.y} w={cell.w} h={cell.h} />
        ))}

        {renderHiddenRootChit && (
          <Box sx={{ display: "none" }}>
            <SinglePanel paused={true} chit={chit} x={0} y={0} w={1} h={1} />
          </Box>
        )}
      </>
    );
  }

  if (layout.length === 0) {
    return null;
  }

  if (Array.isArray(layout[0].chit)) {
    return <MultiPanel chits={layout[0].chit} w={w} h={h} x={x} y={y} />;
  } else {
    return <SinglePanel chit={layout[0].chit} w={w} h={h} x={x} y={y} />;
  }
}
