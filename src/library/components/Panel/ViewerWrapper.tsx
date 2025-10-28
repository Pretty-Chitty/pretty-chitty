import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Stack } from "@mui/material";
import { Chit } from "../../game/Chit";
import Viewer from "../Viewer";
import { useGameTheme } from "../../hooks/useGameTheme";
import { useTimeState } from "../../hooks/useTimeController";
import { useEventChannelState } from "../../hooks/useEventChannelState";
import PanelSpark from "../PanelSpark";
import { useChit } from "../../hooks/useChits";
import { ZINDEX_PINCH_OUT, ZINDEX_SPARKS } from "../../utilities/zIndex";
import { ZoomInMap, ZoomOutOutlined } from "@mui/icons-material";
import { RootChitRenderInstance } from "../../rendering/RootChitRenderInstance";

export function ViewerWrapper({
  chit,
  w,
  h,
  x,
  y,
  paused,
  front,
  panCallback,
  refContainer,
  focusedPanel,
  setFocusedPanel,
  transition,
}: {
  chit: Chit;
  w: number;
  h: number;
  x?: number;
  y?: number;
  paused: boolean;
  front: boolean;
  panCallback?: (direction: "left" | "right") => void;
  refContainer: React.RefObject<HTMLElement> | null;
  focusedPanel?: Chit | undefined;
  setFocusedPanel: (chit: Chit | undefined) => void;
  transition?: string | null;
}) {
  const chitInstance = useChit(chit.id ?? "nochit");
  const theme = useGameTheme();

  // if time is overridden, we don't want to pause ourselves (ever)
  // it's likely trying to play "catchup" and will go very very fast
  const timeState = useTimeState();
  const [override] = useEventChannelState(timeState.animationSpeedOverrideMultiplier);
  const [opacity, setOpacity] = useState(front ? 1 : 0);

  const sparks = chitInstance?.getSparks("panel") ?? [];

  // Use refs to maintain latest values without causing zoomCallback to change
  const focusedPanelRef = useRef(focusedPanel);
  const setFocusedPanelRef = useRef(setFocusedPanel);

  useEffect(() => {
    const to = setTimeout(
      () => {
        if (front) {
          setOpacity(1);
        } else {
          setOpacity(0);
        }
      },
      front ? 0 : 250,
    );
    return () => {
      clearTimeout(to);
    };
  }, [front]);

  // Update refs on each render
  useEffect(() => {
    focusedPanelRef.current = focusedPanel;
    setFocusedPanelRef.current = setFocusedPanel;
  }, [focusedPanel, setFocusedPanel]);

  // Create a stable callback that uses the refs
  const zoomCallback = useCallback(
    (newZoom: number, oldZoom: number) => {
      if (newZoom > oldZoom) {
        setFocusedPanelRef.current(chit);
      } else if (newZoom <= 1 && oldZoom > 1 && focusedPanelRef.current === chit) {
        setFocusedPanelRef.current(undefined);
      }
    },
    [chit],
  );

  useEffect(() => {
    if (focusedPanel !== chit) {
      (chit.renderInstance as RootChitRenderInstance)?.cameraWrapper?.handleZoom(0, 0, -20, false);
    } else {
      (chit.renderInstance as RootChitRenderInstance)?.cameraWrapper?.handleZoom(0, 0, 0.00001, false);
    }
  }, [focusedPanel, chit]);

  return (
    <Box
      sx={{
        borderRadius: "10px",
        overflow: "hidden",
        position: "absolute",
        left: x !== undefined ? `${x}px` : 0,
        top: y !== undefined ? `${y}px` : 0,
        width: `${w}px`,
        height: `${h}px`,
        transition: transition,
        zIndex: front ? 1 : 0,
        opacity,
      }}
    >
      <Stack direction={"row"} flexWrap={"wrap"} sx={{ position: "absolute", zIndex: ZINDEX_SPARKS }}>
        {sparks.map((spark, i) => (
          <PanelSpark zIndex={ZINDEX_SPARKS + sparks.length - i} key={spark.id} chit={spark} paused={paused} />
        ))}
      </Stack>

      {focusedPanel === chit && (
        <Box
          sx={{
            cursor: "pointer",
            position: "absolute",
            bottom: 0,
            left: 0,
            backgroundColor: theme.barColor,
            color: theme.barTextColor,
            p: `${theme.spacing / 2}px`,
            zIndex: ZINDEX_PINCH_OUT,
            borderTopRightRadius: "6px",
            height: `${theme.spacing * 4}px`,
          }}
          onClick={() => {
            setFocusedPanel(undefined);
            (chit.renderInstance as RootChitRenderInstance)?.handleZoom(0, 0, -20, false);
            setTimeout(() => {
              (chit.renderInstance as RootChitRenderInstance)?.handleZoom(0, 0, 0, false);
            }, 100);
          }}
        >
          <ZoomInMap sx={{ width: `${theme.spacing * 2}px` }} />
        </Box>
      )}
      <Viewer
        refContainer={refContainer}
        paused={override ? false : paused}
        hardPaused={override ? false : !front}
        chit={chit}
        w={Math.ceil(w)}
        h={Math.ceil(h)}
        panCallback={panCallback}
        zoomCallback={zoomCallback}
        enableGestures={!focusedPanel || focusedPanel === chit}
      />
    </Box>
  );
}
