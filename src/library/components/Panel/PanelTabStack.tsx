import React from "react";
import { Box, Stack } from "@mui/material";
import Color from "color";
import { Chit } from "../../game/Chit";
import { useGameTheme } from "../../hooks/useGameTheme";
import { useAnimationSpeedMultiplier } from "../../hooks/useTimeController";
import { UpdatingCanvasImage } from "../UpdatingCanvasImage";
import { ZINDEX_PANEL_CUTOUTS } from "../../utilities/zIndex";
import { IconCanvas } from "../../utilities/CanvasStack/IconCanvas";
import { IUpdatingCanvas } from "../../utilities/IUpdatingCanvas";
import { ImageSpec } from "../../utilities/CanvasStack/CanvasOperations";

const TAB_HEIGHT = 20;
const ANIMATION_DURATION = 0.125;
const TAB_WIDTH = TAB_HEIGHT * 2;

function PanelTab({ chit, onClick, selected }: { selected?: boolean; chit: Chit; onClick: () => void }) {
  // eslint-disable-next-line prefer-const
  let { color, icon } = chit.panelTab ?? {};
  if (!color) {
    color = "#ffffff";
  }
  const lightness = Color(color).lightness();

  const outlineColor = Color(color)
    .lightness(lightness < 35 ? lightness + 10 : 20)
    .hex();

  const image = icon
    ? (icon as any)?.canvas
      ? (icon as IUpdatingCanvas)
      : new IconCanvas(icon as ImageSpec).get()
    : undefined;

  return (
    <Box
      onMouseDown={onClick}
      sx={{ pt: 1, pb: 1, mt: -1, mb: -1, position: "relative", zIndex: ZINDEX_PANEL_CUTOUTS }}
    >
      <Box
        sx={{
          opacity: selected ? 1 : 0.75,
          transition: "opacity linear 0.25s",
          background: color,
          border: `2px solid ${outlineColor}`,
          borderTop: "none",
          overflow: "hidden",
          cursor: "pointer",
          height: TAB_HEIGHT,
          textAlign: "center",
          width: TAB_WIDTH,
          borderBottomLeftRadius: TAB_HEIGHT / 4,
          borderBottomRightRadius: TAB_HEIGHT / 4,
        }}
      >
        {image && <UpdatingCanvasImage image={image} style={{ height: TAB_HEIGHT - 2, width: TAB_HEIGHT - 2 }} />}
      </Box>
    </Box>
  );
}

export function PanelTabStack({
  chits,
  selectedIndex,
  onSelectedIndexChange,
}: {
  chits: Chit[];
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
}) {
  const theme = useGameTheme();
  const timeMultiplier = useAnimationSpeedMultiplier();

  return (
    <Stack direction="row" sx={{ height: TAB_HEIGHT }}>
      <Box flex={1} />
      <Stack direction="row" sx={{ position: "relative", width: TAB_WIDTH * chits.length }}>
        {chits.map((chit, index) => (
          <PanelTab
            key={chit.id}
            chit={chit}
            onClick={() => onSelectedIndexChange(index)}
            selected={index === selectedIndex}
          />
        ))}
        <Box
          sx={{
            height: "2px",
            width: TAB_WIDTH * 0.75,
            transition: `left ease-in-out ${ANIMATION_DURATION * timeMultiplier}s`,
            background: theme.panelSelectionCutoutSelected,
            position: "absolute",
            bottom: -2,
            left: selectedIndex * TAB_WIDTH + TAB_WIDTH * 0.125,
          }}
        />
      </Stack>
      <Box flex={1} />
    </Stack>
  );
}

export { TAB_HEIGHT };
