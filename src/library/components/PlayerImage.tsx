import React from "react";
import { Box, SxProps } from "@mui/material";
import { PlayerChit } from "../game/PlayerChit";

export default function PlayerImage({ player, size = 50, sx }: { player: PlayerChit; size?: number; sx?: SxProps }) {
  const BORDER_RATIO = 0 / 12;
  const IMAGE_SIZE = Math.ceil(size * (1 - BORDER_RATIO * 2));
  return (
    <Box
      sx={{
        background: player.color,
        border: `${size * BORDER_RATIO}px solid #fff`,
        borderRadius: 2,
        overflow: "hidden",
        position: "relative",
        width: size,
        height: size,
        ...sx,
      }}
    >
      <Box sx={{ position: "absolute", top: 0, left: 0 }}>
        <img src={player.imageUrl} style={{ width: IMAGE_SIZE, height: IMAGE_SIZE }} />
      </Box>
    </Box>
  );
}
