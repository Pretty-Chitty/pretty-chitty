import React, { useEffect, useRef } from "react";
import { Box, SxProps } from "@mui/material";
import { PlayerChit } from "../game/PlayerChit";
import { useGameTheme } from "../hooks/useGameTheme";
import { PlayerCanvas } from "../utilities/CanvasStack/PlayerCanvas";

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

  const dpr = window.devicePixelRatio ?? 1;
  const CANVAS_SIZE = Math.ceil(IMAGE_SIZE * dpr);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const icon = player.icon;

    const draw = () => {
      const target = canvasRef.current;
      const src = icon.canvas;
      if (!target || !src) return;
      const ctx = target.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, target.width, target.height);
      ctx.drawImage(src, 0, 0, target.width, target.height);
    };

    draw();
    return icon.onUpdate(draw);
  }, [player, CANVAS_SIZE]);

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
        <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} style={{ width: IMAGE_SIZE, height: IMAGE_SIZE, display: "block" }} />
      </Box>
    </Box>
  );
}
