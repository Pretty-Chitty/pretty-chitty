import { Box, Typography } from "@mui/material";
import React from "react";
import { useGameTheme } from "../hooks/useGameTheme";
import { useClientStatus, useTimeController, useTimeState } from "../hooks/useTimeController";
import { useEventChannelState } from "../hooks/useEventChannelState";
import { ZINDEX_MATCH_END_DISPLAY } from "../utilities/zIndex";
import { useChits } from "../hooks/useChits";
import { PlayerChit } from "../game/PlayerChit";

export function MatchEndDisplay() {
  const theme = useGameTheme();
  const clientStatus = useClientStatus();
  const timeState = useTimeState();
  const timeController = useTimeController();
  const [matchResult] = useEventChannelState(clientStatus.matchResult);
  const [isLive] = useEventChannelState(timeState.live);
  const [maxClock] = useEventChannelState(timeController.maxClock);
  const [currentClock] = useEventChannelState(timeController.currentClock);
  const winnerPlayers = useChits<PlayerChit>(matchResult?.winnerIds ?? []);

  if (!matchResult || !isLive || maxClock.clock !== currentClock.clock) {
    return null;
  }

  return (
    <Box
      sx={{
        position: "absolute",
        zIndex: ZINDEX_MATCH_END_DISPLAY,
        borderRadius: 1,
        color: theme.endGameTextColor,
        background: theme.endGameBackgroundColor,
        left: theme.spacing * 4,
        top: theme.spacing * 4,
        right: theme.spacing * 4,
        bottom: theme.spacing * 6,
        padding: `${theme.spacing * 2}px`,
      }}
    >
      <Typography align="center">The winner is</Typography>
      <Typography align="center" variant="h3">
        {winnerPlayers?.map((winner) => winner.name)}
      </Typography>
    </Box>
  );
}
