import React from "react";
import { Stack } from "@mui/material";
import { Chit } from "../../game/Chit";
import Viewer from "../Viewer";
import { useGameTheme } from "../../hooks/useGameTheme";
import { useTimeState } from "../../hooks/useTimeController";
import { useEventChannelState } from "../../hooks/useEventChannelState";
import PanelSpark from "../PanelSpark";
import { useChit } from "../../hooks/useChits";
import { ZINDEX_SPARKS } from "../../utilities/zIndex";

export function ViewerWrapper({
  chit,
  w,
  h,
  paused,
  panCallback,
  refContainer,
}: {
  chit: Chit;
  w: number;
  h: number;
  paused: boolean;
  panCallback?: (direction: "left" | "right") => void;
  refContainer: React.RefObject<HTMLElement> | null;
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
        refContainer={refContainer}
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
