import React from "react";
import { Box } from "@mui/material";
import { useGameTheme } from "../hooks/useGameTheme";

export default function BottomBarBreak() {
  const theme = useGameTheme();
  return (
    <Box sx={{ width: "1px", height: "100%", pt: 1, pb: 1 }}>
      <Box sx={{ background: theme.barBreak, width: "1px", height: "100%" }} />;
    </Box>
  );
}
