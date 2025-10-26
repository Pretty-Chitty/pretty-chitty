import React, { useCallback, useRef } from "react";
import { Box, Stack } from "@mui/material";
import { Chit } from "../../game/Chit";
import Viewer from "../Viewer";
import { useGameTheme } from "../../hooks/useGameTheme";
import { useTimeState } from "../../hooks/useTimeController";
import { useEventChannelState } from "../../hooks/useEventChannelState";
import PanelSpark from "../PanelSpark";
import { useChit } from "../../hooks/useChits";
import { ZINDEX_PINCH_OUT, ZINDEX_SPARKS } from "../../utilities/zIndex";
import { ZoomOutOutlined } from "@mui/icons-material";
import { RootChitRenderInstance } from "../../rendering/RootChitRenderInstance";

export function ViewerWrapper({
  chit,
  w,
  h,
  paused,
  panCallback,
  refContainer,
  focusedPanel,
  setFocusedPanel,
}: {
  chit: Chit;
  w: number;
  h: number;
  paused: boolean;
  panCallback?: (direction: "left" | "right") => void;
  refContainer: React.RefObject<HTMLElement> | null;
  focusedPanel?: Chit | undefined;
  setFocusedPanel: (chit: Chit | undefined) => void;
}) {
  const chitInstance = useChit(chit.id ?? "nochit");
  const theme = useGameTheme();

  // if time is overridden, we don't want to pause ourselves (ever)
  // it's likely trying to play "catchup" and will go very very fast
  const timeState = useTimeState();
  const [override] = useEventChannelState(timeState.animationSpeedOverrideMultiplier);

  const sparks = chitInstance?.getSparks("panel") ?? [];

  // Use refs to maintain latest values without causing zoomCallback to change
  const focusedPanelRef = useRef(focusedPanel);
  const setFocusedPanelRef = useRef(setFocusedPanel);

  // Update refs on each render
  React.useEffect(() => {
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

  if (focusedPanel !== chit) {
    (chit.renderInstance as RootChitRenderInstance)?.cameraWrapper?.handleZoom(0, 0, -20, false);
  }

  return (
    <>
      <Stack direction={"row"} flexWrap={"wrap"} sx={{ position: "absolute", zIndex: ZINDEX_SPARKS }}>
        {sparks.map((spark, i) => (
          <PanelSpark zIndex={ZINDEX_SPARKS + sparks.length - i} key={spark.id} chit={spark} paused={paused} />
        ))}
      </Stack>
      {focusedPanel === chit && (
        <Box
          sx={{
            position: "absolute",
            bottom: 0,
            right: 0,
            backgroundColor: theme.barColor,
            color: theme.barTextColor,
            p: `${theme.spacing / 2}px`,
            zIndex: ZINDEX_PINCH_OUT,
            borderTopLeftRadius: "6px",
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
          <ZoomOutOutlined sx={{ width: `${theme.spacing * 2}px` }} />
        </Box>
      )}
      <Viewer
        refContainer={refContainer}
        paused={override ? false : paused}
        chit={chit}
        w={Math.ceil(w)}
        h={Math.ceil(h)}
        panCallback={panCallback}
        zoomCallback={zoomCallback}
        enableGestures={!focusedPanel || focusedPanel === chit}
      />
    </>
  );
}
