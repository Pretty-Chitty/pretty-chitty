import React, { useRef, useState } from "react";
import { Box } from "@mui/material";
import useSize from "@react-hook/size";
import { useGameTheme } from "../../hooks/useGameTheme";
import { RootChit } from "../../game/RootChit";
import { usePanelScale } from "../../hooks/usePanelScale";
import { usePlayerId } from "../../hooks/usePlayer";
import { SinglePanel } from "./SinglePanel";
import { MultiPanel } from "./MultiPanel";
import { Chit } from "../../game/Chit";

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
  const [focusedPanel, setFocusedPanel] = useState<Chit | undefined>();
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
        p: `${theme.spacing * 0.75}px`,
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
            return (
              <MultiPanel
                focusedPanel={focusedPanel}
                setFocusedPanel={setFocusedPanel}
                key={"m" + cell.id}
                chits={cell.chit}
                w={cell.w}
                h={cell.h}
                x={cell.x}
                y={cell.y}
                totalWidth={width}
                totalHeight={height}
              />
            );
          } else {
            return (
              <SinglePanel
                focusedPanel={focusedPanel}
                setFocusedPanel={setFocusedPanel}
                key={cell.id}
                chit={cell.chit}
                w={cell.w}
                h={cell.h}
                x={cell.x}
                y={cell.y}
                totalWidth={width}
                totalHeight={height}
              />
            );
          }
        })}

        {!hasRootChitInLayout && (
          <SinglePanel
            focusedPanel={focusedPanel}
            setFocusedPanel={setFocusedPanel}
            paused
            chit={rootChit}
            x={-5 - theme.spacing * 3}
            y={0}
            w={theme.spacing * 3}
            h={theme.spacing * 3}
            totalWidth={width}
            totalHeight={height}
          />
        )}
      </Box>
    </Box>
  );
}
