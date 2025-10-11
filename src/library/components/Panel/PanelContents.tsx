import React, { useRef } from "react";
import { Box } from "@mui/material";
import useSize from "@react-hook/size";
import { useGameTheme } from "../../hooks/useGameTheme";
import { RootChit } from "../../game/RootChit";
import { usePanelScale } from "../../hooks/usePanelScale";
import { usePlayerId } from "../../hooks/usePlayer";
import { SinglePanel } from "./SinglePanel";
import { MultiPanel } from "./MultiPanel";

export function PanelContents({
  rootChit,
  scaleWidth,
  scaleHeight,
}: {
  rootChit: RootChit<any>;
  scaleWidth: number;
  scaleHeight: number;
}) {
  const theme = useGameTheme();
  const ref = useRef(null);
  const [width, height] = useSize(ref);
  const scale = usePanelScale();
  const playerId = usePlayerId();
  const layout = rootChit.getFlatLayout(
    width,
    height,
    (scaleWidth / width) * scale,
    (scaleHeight / height) * scale,
    playerId,
  );
  const hasRootChitInLayout = layout.find((item) => item.chit === rootChit) !== undefined;

  return (
    <Box
      sx={{
        position: "relative",
        flex: 1,
        p: `${theme.spacing / 2}px`,
      }}
    >
      <Box
        ref={ref}
        sx={{
          position: "relative",
          width: "100%",
          height: "100%",
        }}
      >
        {layout.map((cell) => {
          if (Array.isArray(cell.chit)) {
            return <MultiPanel key={cell.id} chits={cell.chit} w={cell.w} h={cell.h} x={cell.x} y={cell.y} />;
          } else {
            return <SinglePanel key={cell.id} chit={cell.chit} w={cell.w} h={cell.h} x={cell.x} y={cell.y} />;
          }
        })}

        {!hasRootChitInLayout && <SinglePanel paused chit={rootChit} x={-5} y={0} w={1} h={1} />}
      </Box>
    </Box>
  );
}
