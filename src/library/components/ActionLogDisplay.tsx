import React, { useEffect, useRef, useState } from "react";
import { Box, Stack } from "@mui/material";
import { useGameTheme } from "../hooks/useGameTheme";
import useSize from "@react-hook/size";
import { useEventChannelState } from "../hooks/useEventChannelState";
import {
  useAnimationSpeedMultiplier,
  useClientPrompts,
  useTimeController,
  useTimeState,
} from "../hooks/useTimeController";
import { TokenizedMessage } from "./TokenizedMessage";
import { useChit, useChits } from "../hooks/useChits";
import { PlayerChit } from "../game/PlayerChit";
import { RootChit } from "../game/RootChit";
import { usePlayerId } from "../hooks/usePlayer";
import { NoValidMovesPrompt } from "../game/Prompt";
import { useTokenMap } from "../hooks/useTokenMap";
import { useModalState } from "../hooks/useModalState";
import { KeyboardDoubleArrowUp } from "@mui/icons-material";
import { useSmartDebouncedState } from "../hooks/useSmartDebouncedState";

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
  const animationSpeedMultiplier = useAnimationSpeedMultiplier();
  const [visible, setVisible] = useEventChannelState(modalState.actionLogVisible);
  const timeController = useTimeController();
  const timeState = useTimeState();
  const [currentClock] = useEventChannelState(timeController.currentClock);
  const [targetClock] = useEventChannelState(timeState.targetClock);
  const [live] = useEventChannelState(timeState.live);
  const [maxClock] = useEventChannelState(timeController.maxClock);

  const theme = useGameTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width] = useSize(containerRef);
  const layoutSize = theme.layoutSize(width);
  const clientPrompt = useClientPrompts();

  const [prompt] = useEventChannelState(clientPrompt.currentPrompt);
  const [promptMode, setPromptMode] = useState(false);
  const playerId = usePlayerId();
  const [promptSpec] = useEventChannelState(clientPrompt.getPromptEventChannelForPlayer(playerId));
  const tokenMap = useTokenMap();

  const [message, setMessage] = useSmartDebouncedState<string | undefined>(undefined, {
    interval: 1000 * animationSpeedMultiplier,
    // immediate: 50,
  });
  const [isSteppingBack, setIsSteppingBack] = useState(false);
  const [messageHasntChanged, setMessageHasntChanged] = useState(false);
  const [logMessage] = useEventChannelState(timeController.activeLog);

  const PADDING_SIZE = 8; // bs i know

  const root = useChit<RootChit<PlayerChit>>("root");

  const playerChits = useChits<PlayerChit>(root?.players.map((p) => p.id ?? "") ?? []);
  playerChits.map((p) => p.promptStatus.latestPromptMessage).fill;

  // calc if a prompt message.  this has highest priority
  let promptMessage: string | undefined;
  if (prompt) {
    if (prompt instanceof NoValidMovesPrompt) {
      promptMessage = `:warning: ${prompt?.message ?? ""}`;
    } else {
      promptMessage = `:${playerId}: to ${prompt?.message ?? ""}`;
    }
  }

  useEffect(() => {
    if (!live) {
      setPromptMode(false);
    } else if (!prompt) {
      // duplicated from promptcontrols... not ideal, but can fix later if this works
      const to = setTimeout(() => setPromptMode(false), promptSpec ? 4000 : 400);
      return () => clearTimeout(to);
    } else {
      setPromptMode(true);
    }
  }, [live, prompt, promptSpec]);

  // debounce messages and lock up animation loop
  useEffect(() => {
    setMessage(logMessage);
    setMessageHasntChanged(false);
    const key = `ActionLogDisplay${Date.now()}`;
    setTimeout(() => timeState.setAnimationState(key, false), 1000 * animationSpeedMultiplier);
    const to2 = setTimeout(() => {
      setMessageHasntChanged(true);
    }, 5000 * animationSpeedMultiplier);
    return () => {
      clearTimeout(to2);
    };
  }, [logMessage, animationSpeedMultiplier, timeState, setMessage]);

  // mark if we are stepping back
  useEffect(() => {
    if (live && targetClock < currentClock.clock) {
      setIsSteppingBack(true);
      setTimeout(() => setIsSteppingBack(false), 1000 * animationSpeedMultiplier);
    }
  }, [live, currentClock.clock, currentClock.pass, targetClock, maxClock.pass, animationSpeedMultiplier]);

  let messageToShow = message;
  if (promptMode) {
    messageToShow = promptMessage;
  } else if (isSteppingBack) {
    messageToShow = "↩ Stepping back...";
  } else if (messageHasntChanged && live) {
    const waitingPlayers = playerChits.filter((p) => p.promptStatus?.latestPromptMessage);
    if (waitingPlayers.length > 0 && !waitingPlayers.find((p) => p.playerId === playerId)) {
      messageToShow = `Waiting for ${waitingPlayers.map((p) => `:${p.playerId}:`).join(" and ")}`;
    }
  }

  return (
    <Stack
      direction={"row"}
      ref={containerRef}
      sx={{
        background: theme.actionLogBackgroundColor,
        cursor: "pointer",
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
        <TokenizedMessage message={messageToShow ?? ""} fontSize={14} tokenMap={tokenMap} />
      </Box>
      <Arrow flipped={visible} />
      <Box flex={1} />
    </Stack>
  );
}
