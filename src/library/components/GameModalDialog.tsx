import React, { ReactNode } from "react";
import { Box, Stack, IconButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useGameTheme } from "../hooks/useGameTheme";
import { GameModalBackdrop } from "./GameModalBackdrop";
import { useAnimationSpeedMultiplier } from "../hooks/useTimeController";

interface GameModalDialogProps {
  opacity?: number;
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function GameModalDialog({ opacity, visible, onClose, title, children }: GameModalDialogProps) {
  const theme = useGameTheme();
  const animationSpeedMultiplier = useAnimationSpeedMultiplier();

  return (
    <GameModalBackdrop visible={visible} persist opacity={opacity}>
      <Box
        sx={{
          display: "grid",
          placeItems: "center",
          position: "absolute",
          overflow: "hidden",
          top: 0,
          left: 0,
          bottom: 0,
          right: 0,
        }}
        onClick={onClose}
      >
        <Stack
          onClick={(e) => e.stopPropagation()}
          sx={{
            background: theme.actionLogDialogBackgroundColor,
            width: `min(90%,${theme.actionBarWidth}px)`,
            height: "90%",
            overflow: "hidden",
            borderRadius: 2,
            transform: !visible ? "translateY(120%)" : "translateY(0)",
            transition: `transform ${0.1 * animationSpeedMultiplier}s ease-in-out`,
          }}
        >
          <Box
            sx={{
              padding: 2,
              borderBottom: `2px solid ${theme.actionLogBackgroundColor}`,
              color: theme.actionLogTextColor,
              fontWeight: "bold",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Box>{title}</Box>
            <IconButton
              onClick={onClose}
              size="small"
              sx={{
                color: theme.actionLogTextColor,
                "&:hover": {
                  backgroundColor: "rgba(255, 255, 255, 0.1)",
                },
              }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
          {children}
        </Stack>
      </Box>
    </GameModalBackdrop>
  );
}
