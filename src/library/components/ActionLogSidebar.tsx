import React from "react";
import { Box } from "@mui/material";
import { useGameTheme } from "../hooks/useGameTheme";
import { ActionLogHistory } from "./ActionLogHistory";

export function ActionLogSidebar() {
  const theme = useGameTheme();
  return (
    <Box
      sx={{ position: "relative", height: `100%`, width: "350px", background: theme.actionLogDialogBackgroundColor }}
    >
      <Box sx={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
        <ActionLogHistory visible />
      </Box>
    </Box>
  );
}
