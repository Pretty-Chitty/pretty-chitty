import React from "react";
import { Box } from "@mui/material";
import { useGameTheme } from "../hooks/useGameTheme";
import { ActionLogHistory } from "./ActionLogHistory";

export function ActionLogSidebar({ height }: { height: number }) {
  const theme = useGameTheme();
  return (
    <Box sx={{ height: `${height}px`, width: "350px", background: theme.actionLogDialogBackgroundColor }}>
      <ActionLogHistory visible />
    </Box>
  );
}
