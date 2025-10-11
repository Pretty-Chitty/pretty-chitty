import React, { useRef } from "react";
import { Box } from "@mui/material";
import { useGameTheme } from "../hooks/useGameTheme";
import useSize from "@react-hook/size";
import { useEventChannelState } from "../hooks/useEventChannelState";
import { useClientPrompts, useTimeController } from "../hooks/useTimeController";
import { TokenDefinition, TokenizedMessage } from "./TokenizedMessage";
import { useChit, useChits } from "../hooks/useChits";
import { PlayerChit } from "../game/PlayerChit";
import { RootChit } from "../game/RootChit";
import { usePlayerId } from "../hooks/usePlayer";

export function ActionLogDisplay() {
  const timeController = useTimeController();
  const [currentClock] = useEventChannelState(timeController.currentClock);
  const [maxClock] = useEventChannelState(timeController.maxClock);

  const theme = useGameTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width] = useSize(containerRef);
  const layoutSize = theme.layoutSize(width);
  const clientPrompt = useClientPrompts();
  const [prompt] = useEventChannelState(clientPrompt.currentPrompt);

  const PADDING_SIZE = 8; // bs i know

  const playerId = usePlayerId();
  const root = useChit<RootChit<PlayerChit>>("root");
  const playerChits = useChits<PlayerChit>(root?.players.map((p) => p.id ?? "") ?? []);

  const tokenMap: { [key: string]: TokenDefinition } = {};
  playerChits?.forEach((p) => {
    tokenMap[p.playerId] = { label: p.name ?? "??", color: p.color ?? theme.actionLogTextColor, image: p.imageUrl };
  });

  let message: string = "";
  if (prompt) {
    message = `:${playerId}: to ${prompt?.message ?? ""}`;
  } else if (currentClock.clock === maxClock.clock) {
    const waitingPlayers = playerChits.filter((p) => p.promptStatus?.latestPromptMessage);
    if (waitingPlayers.length > 0 && !waitingPlayers.find((p) => p.playerId === playerId)) {
      message = `Waiting for ${waitingPlayers.map((p) => `:${p.playerId}:`).join(" and ")}`;
    }
  }

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
          minHeight: 14 * theme.actionBarLinesToShow + PADDING_SIZE * 2, // 8px for padding?
          color: theme.actionLogTextColor,
          maxWidth: layoutSize !== "mobile" ? `${theme.actionBarWidth}px` : undefined,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <TokenizedMessage message={message} fontSize={14} tokenMap={tokenMap} />
      </Box>
    </Box>
  );
}
