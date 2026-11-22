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
import { PANEL_TAB_HEIGHT, PANEL_TAB_WIDTH } from "../../utilities/LayoutHelper";

const TAB_HEIGHT = PANEL_TAB_HEIGHT;
const ANIMATION_DURATION = 0.125;
const TAB_WIDTH = PANEL_TAB_WIDTH;

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
      data-tutorial-target={`panelTab:${chit.id}`}
      // shares the strip's width equally, so a stack with too little room squeezes its tabs rather than overflowing
      sx={{ pt: 1, pb: 1, mt: -1, mb: -1, position: "relative", zIndex: ZINDEX_PANEL_CUTOUTS, flex: 1, minWidth: 0 }}
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
          width: "100%",
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
      <Stack direction="row" sx={{ position: "relative", width: TAB_WIDTH * chits.length, maxWidth: "100%" }}>
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
            width: `${(0.75 / chits.length) * 100}%`,
            transition: `left ease-in-out ${ANIMATION_DURATION * timeMultiplier}s`,
            background: theme.panelSelectionCutoutSelected,
            position: "absolute",
            bottom: -2,
            left: `${((selectedIndex + 0.125) / chits.length) * 100}%`,
          }}
        />
      </Stack>
      <Box flex={1} />
    </Stack>
  );
}

export { TAB_HEIGHT };
