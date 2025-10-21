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

  // if time is overridden, we don't want to pause ourselves (ever)
  // it's likely trying to play "catchup" and will go very very fast
  const timeState = useTimeState();
  const [override] = useEventChannelState(timeState.animationSpeedOverrideMultiplier);

  const sparks = chitInstance?.getSparks("panel") ?? [];

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
        w={Math.ceil(w)}
        h={Math.ceil(h)}
        panCallback={panCallback}
      />
    </>
  );
}
