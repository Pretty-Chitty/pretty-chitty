import React, { ReactNode, useEffect, useState } from "react";
import { Box } from "@mui/material";
import { ZINDEX_GALLERY_INVISIBLE, ZINDEX_GALLERY_VISIBLE } from "../utilities/zIndex";
import { useAnimationSpeedMultiplier } from "../hooks/useTimeController";
import { useGameTheme } from "../hooks/useGameTheme";

const DELAY = 300;

interface GameModalBackdropProps {
  visible: boolean;
  children: ReactNode;
  persist?: boolean;
}

export function GameModalBackdrop({ visible, children, persist = false }: GameModalBackdropProps) {
  const theme = useGameTheme();
  const animationSpeedMultiplier = useAnimationSpeedMultiplier();
  const [visibleDelayed, setVisibleDelayed] = useState(false);

  useEffect(() => {
    if (visible) {
      setVisibleDelayed(true);
    } else {
      const to = setTimeout(() => setVisibleDelayed(false), DELAY * animationSpeedMultiplier);
      return () => clearTimeout(to);
    }
  }, [visible, animationSpeedMultiplier]);

  return (
    <Box
      sx={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: visibleDelayed ? ZINDEX_GALLERY_VISIBLE : ZINDEX_GALLERY_INVISIBLE,
        background: visible ? theme.dialogBackgroundColor : "rgba(0,0,0,0)",
        transition: `background linear ${(DELAY / 1000) * animationSpeedMultiplier}s`,
      }}
    >
      {(visibleDelayed || persist) && children}
    </Box>
  );
}
