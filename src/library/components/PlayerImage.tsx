import React from "react";
import { Box, SxProps } from "@mui/material";
import { PlayerChit } from "../game/PlayerChit";
import { useGameTheme } from "../hooks/useGameTheme";

export default function PlayerImage({
  player,
  borderColor,
  size = 50,
  sx,
}: {
  player: PlayerChit;
  borderColor?: string;
  size?: number;
  sx?: SxProps;
}) {
  const theme = useGameTheme();
  const BORDER_RATIO = player.color === "transparent" ? 0 : 1 / 12;
  const IMAGE_SIZE = Math.ceil(size * (1 - BORDER_RATIO * 2));
  return (
    <Box
      sx={{
        background: player.color,
        border: `${size * BORDER_RATIO}px solid ${borderColor ?? player.color}`,
        borderRadius: 2,
        boxShadow: `0 0 ${theme.spacing / 4}px ${theme.spacing / 4}px ${theme.topBarPlayerDropShadowColor}`,
        overflow: "hidden",
        position: "relative",
        width: size,
        height: size,
        lineHeight: `${IMAGE_SIZE}px`,
        ...sx,
      }}
    >
      <Box sx={{ position: "absolute", top: 0, left: 0 }}>
        <img src={player.imageUrl} style={{ width: IMAGE_SIZE, height: IMAGE_SIZE }} />
      </Box>
    </Box>
  );
}
