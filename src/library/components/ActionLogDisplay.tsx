import React, { useRef } from "react";
import { Box, Stack } from "@mui/material";
import { useGameTheme } from "../hooks/useGameTheme";
import useSize from "@react-hook/size";
import { useEventChannelState } from "../hooks/useEventChannelState";
import { useClientPrompts, useTimeController } from "../hooks/useTimeController";
import { TokenizedMessage } from "./TokenizedMessage";
import { useChit, useChits } from "../hooks/useChits";
import { PlayerChit } from "../game/PlayerChit";
import { RootChit } from "../game/RootChit";
import { usePlayerId } from "../hooks/usePlayer";
import { NoValidMovesPrompt } from "../game/Prompt";
import { useTokenMap } from "../hooks/useTokenMap";
import { useModalState } from "../hooks/useModalState";
import { KeyboardDoubleArrowUp } from "@mui/icons-material";

function Arrow({ flipped }: { flipped?: boolean }) {
  const theme = useGameTheme();
  return (
    <Box
      sx={{
        color: theme.actionLogTextColor,
        opacity: 0.25,
        alignItems: "center",
        display: "flex",
        transform: flipped ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 0.1s ease-in-out",
      }}
    >
      <KeyboardDoubleArrowUp />
    </Box>
  );
}

export function ActionLogDisplay() {
  const modalState = useModalState();
  const [visible, setVisible] = useEventChannelState(modalState.actionLogVisible);
  const timeController = useTimeController();
  const [currentClock] = useEventChannelState(timeController.currentClock);
  const [maxClock] = useEventChannelState(timeController.maxClock);

  const theme = useGameTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width] = useSize(containerRef);
  const layoutSize = theme.layoutSize(width);
  const clientPrompt = useClientPrompts();
  const [prompt] = useEventChannelState(clientPrompt.currentPrompt);
  const tokenMap = useTokenMap();

  const PADDING_SIZE = 8; // bs i know

  const playerId = usePlayerId();
  const root = useChit<RootChit<PlayerChit>>("root");
  const playerChits = useChits<PlayerChit>(root?.players.map((p) => p.id ?? "") ?? []);

  let message: string = "";
  if (prompt) {
    if (prompt instanceof NoValidMovesPrompt) {
      message = `:warning: ${prompt?.message ?? ""}`;
    } else {
      message = `:${playerId}: to ${prompt?.message ?? ""}`;
    }
  } else if (currentClock.clock === maxClock.clock) {
    const waitingPlayers = playerChits.filter((p) => p.promptStatus?.latestPromptMessage);
    if (waitingPlayers.length > 0 && !waitingPlayers.find((p) => p.playerId === playerId)) {
      message = `Waiting for ${waitingPlayers.map((p) => `:${p.playerId}:`).join(" and ")}`;
    }
  }

  return (
    <Stack
      direction={"row"}
      ref={containerRef}
      sx={{
        background: theme.actionLogBackgroundColor,
      }}
      onClick={() => setVisible(!visible)}
    >
      <Box flex={1} />
      <Arrow flipped={visible} />
      <Box
        flex={1000}
        sx={{
          p: 1,
          lineHeight: 1,
          textAlign: "center",
          minHeight: 14 * theme.actionBarLinesToShow * 1.1 + PADDING_SIZE * 2, // 8px for padding?
          color: theme.actionLogTextColor,
          maxWidth: layoutSize !== "mobile" ? `${theme.actionBarWidth - 40}px` : undefined,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <TokenizedMessage message={message} fontSize={14} tokenMap={tokenMap} />
      </Box>
      <Arrow flipped={visible} />
      <Box flex={1} />
    </Stack>
  );
}
