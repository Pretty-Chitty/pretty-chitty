import React, { useRef } from "react";
import { Box } from "@mui/material";
import { useGameTheme } from "../hooks/useGameTheme";
import useSize from "@react-hook/size";
import { useEventChannelState } from "../hooks/useEventChannelState";
import { useClientPrompts } from "../hooks/useTimeController";

export function ActionLogDisplay() {
  const theme = useGameTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width] = useSize(containerRef);
  const layoutSize = theme.layoutSize(width);
  const clientPrompt = useClientPrompts();
  const [prompt] = useEventChannelState(clientPrompt.currentPrompt);

  return (
    <Box
      ref={containerRef}
      sx={{
        background: theme.actionLogBackgroundColor,
      }}
    >
      <Box
        sx={{
          p: 1,
          marginLeft: "auto",
          marginRight: "auto",
          lineHeight: 1,
          textAlign: "center",
          fontSize: 14,
          minHeight: 14 * 3.25,
          color: theme.actionLogTextColor,
          maxWidth: layoutSize !== "mobile" ? `${theme.actionBarWidth}px` : undefined,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {prompt?.message ?? ""}
      </Box>
    </Box>
  );
}
