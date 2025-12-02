import React, { useEffect, useMemo, useState } from "react";
import { Box, Typography } from "@mui/material";
import { useGameTheme } from "../hooks/useGameTheme";
import { useClientStatus, useTimeController, useTimeState } from "../hooks/useTimeController";
import { useEventChannelState } from "../hooks/useEventChannelState";
import { useChit, useChits } from "../hooks/useChits";
import { PlayerChit } from "../game/PlayerChit";
import { GameModalDialog } from "./GameModalDialog";
import { RootChit } from "../game/RootChit";
import { SparkChit } from "../game/SparkChit";
import { SparkLineChart } from "./SparkLineChart";

function InnerMatchEndContents({ maxClock }: { maxClock: number }) {
  const theme = useGameTheme();
  const clientStatus = useClientStatus();
  const timeController = useTimeController();

  const root = useChit<RootChit<PlayerChit>>("root");
  const playerChits = useChits<PlayerChit>(root?.players.map((p) => p.id ?? "") ?? []);
  const [matchResult] = useEventChannelState(clientStatus.matchResult);
  const winnerPlayers = useChits<PlayerChit>(matchResult?.winnerIds ?? []);

  // Map of endGameLabel -> player -> history data
  const [chartState, setChartState] = useState<
    | {
        [endGameLabel: string]: {
          [playerId: string]: { player: PlayerChit; history: { clock: number; chit: SparkChit }[] };
        };
      }
    | undefined
  >(undefined);

  const allSparksWithPlayers: { spark: SparkChit; player: PlayerChit }[] = useMemo(
    () =>
      playerChits
        .map((player) => {
          return player.getSparks("endgame").map((spark) => ({ spark, player }));
        })
        .flat(),
    [playerChits],
  );

  useEffect(() => {
    const allSparks = allSparksWithPlayers.map((sp) => sp.spark);
    timeController.chitHistory(allSparks).then((history) => {
      console.log(history);

      // Reorganize history by endGameLabel -> player
      const organized: {
        [endGameLabel: string]: {
          [playerId: string]: { player: PlayerChit; history: { clock: number; chit: SparkChit }[] };
        };
      } = {};

      allSparksWithPlayers.forEach(({ spark, player }) => {
        const label = spark.endGameLabel;
        const historyData = history[spark.id!] as { clock: number; chit: SparkChit }[] | undefined;

        // Skip if there's no history data for this spark
        if (!historyData || historyData.length === 0) return;

        if (!organized[label]) {
          organized[label] = {};
        }

        if (!organized[label][player.id!]) {
          organized[label][player.id!] = { player, history: historyData };
        }
      });

      setChartState(organized);
    });
  }, [allSparksWithPlayers, timeController]);

  return (
    <Box
      sx={{
        color: theme.endGameTextColor,
        p: 3,
        pr: 1,
        maxHeight: "100%",
        overflowY: "auto",
      }}
    >
      <Typography align="center">The winner is</Typography>
      <Typography align="center" variant="h4">
        {winnerPlayers?.map((winner) => winner.name)}
      </Typography>
      {chartState &&
        Object.entries(chartState).map(([endGameLabel, playerData]) => (
          <SparkLineChart
            key={endGameLabel}
            label={endGameLabel}
            playerData={playerData}
            maxClock={maxClock}
            backgroundColor={theme.endGameBackgroundColor}
            width={700}
          />
        ))}
    </Box>
  );
}

export function MatchEndDisplay() {
  const clientStatus = useClientStatus();
  const timeState = useTimeState();
  const timeController = useTimeController();
  const [matchResult] = useEventChannelState(clientStatus.matchResult);
  const [isLive, setLive] = useEventChannelState(timeState.live);
  const [maxClock] = useEventChannelState(timeController.maxClock);
  const [currentClock] = useEventChannelState(timeController.currentClock);

  const visible = !!matchResult && !!isLive && maxClock.clock === currentClock.clock;

  return (
    <GameModalDialog visible={visible} title="Match Results" onClose={() => setLive(false)}>
      {visible && <InnerMatchEndContents maxClock={maxClock.clock} />}
    </GameModalDialog>
  );
}
