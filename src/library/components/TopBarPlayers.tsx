import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import TopBarDropdown from "./TopBarDropdown";
import PlayerImage from "./PlayerImage";
import { useGameTheme } from "../hooks/useGameTheme";
import { useChit, useChits } from "../hooks/useChits";
import { PlayerChit } from "../game/PlayerChit";
import { PlayerPromptStatus } from "../game/PlayerPromptStatus";
import { SparkChit } from "../game/SparkChit";
import { UpdatingCanvasImage } from "./UpdatingCanvasImage";
import { StaticImage } from "../utilities/StaticImage";
import { RootChit } from "../game/RootChit";
import { usePlayerId } from "../hooks/usePlayer";
import { IUpdatingCanvas } from "../utilities/IUpdatingCanvas";
import { ImageSpec } from "../utilities/CanvasStack/CanvasOperations";

function PlayerInfoCell({ spark, size }: { size: number; spark: SparkChit }) {
  const theme = useGameTheme();
  return (
    <Box sx={{ width: `${spark.width}px`, pl: 1, pr: 1, borderRight: `1px solid ${theme.barTopLineColor}` }}>
      <Typography
        sx={{ fontSize: 14, textOverflow: "ellipsis", overflow: "hidden", textAlign: "right", lineHeight: `${size}px` }}
      >
        {spark.value}
      </Typography>
    </Box>
  );
}

function TextPlayerInfoCell({ text, size, width }: { size: number; text: string; width: number }) {
  const theme = useGameTheme();
  return (
    <Box sx={{ width: `${width}px`, pl: 1, pr: 1, borderRight: `1px solid ${theme.barTopLineColor}` }}>
      <Typography
        sx={{
          fontSize: 14,
          textOverflow: "ellipsis",
          overflow: "hidden",
          whiteSpace: "nowrap",
          textAlign: "left",
          lineHeight: `${size}px`,
        }}
      >
        {text}
      </Typography>
    </Box>
  );
}

function HeaderCell({ spark }: { spark: SparkChit }) {
  const theme = useGameTheme();
  if (!spark.headerIcon || spark.headerIcon instanceof PlayerChit) {
    return <Box sx={{ width: `${spark.width}px`, pl: 1, pr: 1 }} />;
  }

  const im = spark.headerIcon as IUpdatingCanvas;

  return (
    <Box sx={{ width: `${spark.width}px`, pl: 1, pr: 1 }}>
      <UpdatingCanvasImage image={im} style={{ width: `${spark.width - theme.spacing * 2}px` }} />
    </Box>
  );
}

function PlayerInfoRow({ headers, player }: { player: PlayerChit; headers?: boolean }) {
  const theme = useGameTheme();

  const sparks = useChits<SparkChit>(player.getSparks("dropdown").map((d) => d.id ?? ""));

  const LINE_HEIGHT_RATIO = 0.6;
  const IMAGE_SIZE_RATIO = 0.75;
  const size = theme.topBarHeight * LINE_HEIGHT_RATIO;
  const NAME_WIDTH = 150;
  const PROMPT_WIDTH = 300;
  const width =
    NAME_WIDTH + PROMPT_WIDTH + size + theme.spacing + sparks.reduce((total, spark) => total + spark.width, 0);

  if (headers) {
    return (
      <Stack direction="row" sx={{ pl: 1, pr: 0, width }}>
        {/* Player icon */}
        <Box sx={{ width: size }} />
        {sparks.map((spark) => (
          <HeaderCell key={spark.id} spark={spark} />
        ))}
      </Stack>
    );
  }

  return (
    <Stack
      direction="row"
      sx={{
        pl: 1,
        pr: 0,
        width,
      }}
    >
      <PlayerImage
        player={player}
        size={size * 0.75}
        sx={{
          boxShadow: `0 0 ${theme.spacing / 2}px ${theme.spacing / 2}px ${theme.barTopDropdownColor}`,
          mr: 1,
          mt: `${size * ((1 - IMAGE_SIZE_RATIO) / 2)}px`,
          left: 0,
          position: "sticky",
        }}
      />
      {sparks.map((spark) => (
        <PlayerInfoCell size={size} key={spark.id} spark={spark} />
      ))}
      <TextPlayerInfoCell size={size} width={NAME_WIDTH} text={player.name} />
      <TextPlayerInfoCell size={size} width={PROMPT_WIDTH} text={player.promptStatus.latestPromptMessage ?? ""} />
    </Stack>
  );
}

export default function TopBarPlayers() {
  const theme = useGameTheme();
  const root = useChit<RootChit<PlayerChit>>("root");
  const playerChits = useChits<PlayerChit>(root?.players.map((p) => p.id ?? "") ?? []);

  useChits<PlayerPromptStatus>(playerChits.map((p) => p.promptStatus.id ?? "")); // necessary for side effects so this recomputes when the status or prompt changes

  return (
    <TopBarDropdown
      label={
        <Stack direction={"row"} sx={{ pt: 1, pb: 1, maxWidth: "100%" }}>
          {playerChits.map((player) => (
            <PlayerImage
              sx={{ ml: -1 }}
              borderColor={player.promptStatus.latestPromptMessage ? theme.chitHighlightColor : undefined}
              size={theme.topBarHeight - theme.spacing * 2}
              key={player.id}
              player={player}
            />
          ))}
          <Typography
            flex={1}
            sx={{
              p: 1,
              lineHeight: `${theme.topBarHeight - theme.spacing * 4}px`,
              fontSize: 14,
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              overflow: "hidden",
            }}
          >
            Players
          </Typography>
        </Stack>
      }
    >
      <Box sx={{ pt: 0.5, pb: 0.5 }}>
        {playerChits.length && <PlayerInfoRow headers player={playerChits[0]} />}
        {playerChits.map((p) => (
          <PlayerInfoRow key={p.id} player={p} />
        ))}
      </Box>
    </TopBarDropdown>
  );
}
