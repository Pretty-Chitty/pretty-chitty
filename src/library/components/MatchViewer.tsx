import React, { useEffect, useRef, useState } from "react";
import { useGame } from "../hooks/useGame";
import { Box, Stack, ThemeProvider, createTheme } from "@mui/material";
import { TimeControllerProvider, useClientStatus, useTimeController } from "../hooks/useTimeController";
import BottomBar from "./BottomBar";
import { GameThemeProvider, useGameTheme } from "../hooks/useGameTheme";
import { Game } from "../game/Game";

import "@fontsource/raleway/400.css";
import Panel from "./Panel";
import { Chit } from "../game/Chit";
import useSize from "@react-hook/size";
import TopBar from "./TopBar";
import { useEventChannelState } from "../hooks/useEventChannelState";
import { MatchEndDisplay } from "./MatchEndDisplay";

function generateTheme(game: Game<any, any>) {
  console.log(game); // gets rid of warning? weird.
  const theme = createTheme({
    typography: {
      fontFamily: ["Raleway", "sans-serif"].join(","),
    },
  });

  return theme;
}

function PanelContents({ rootChit }: { rootChit: Chit }) {
  const theme = useGameTheme();
  const ref = useRef(null);
  const [width, height] = useSize(ref);
  return (
    <Box
      sx={{
        position: "relative",
        flex: 1,
        p: 1,
        background: `${theme.backgroundColor} linear-gradient(${theme.backgroundGradientAngle}deg, rgba(255,255,255,${theme.backgroundGradientPercent}) 0%, rgba(0,0,0,${theme.backgroundGradientPercent}) 100%)`,
      }}
    >
      <Box
        ref={ref}
        sx={{
          position: "relative",
          width: "100%",
          height: "100%",
        }}
      >
        <Panel chit={rootChit} x={0} y={0} w={width} h={height} />
      </Box>
    </Box>
  );
}

function InnerMatchViewer() {
  const timeController = useTimeController();
  const clientStatus = useClientStatus();
  const [errorMessage] = useEventChannelState(clientStatus.errorMessage);
  const [rootChit, setRootChit] = useState(timeController.rootChit.value);

  useEffect(
    () =>
      timeController.rootChit.on((rootChit) => {
        if (rootChit) {
          setRootChit(rootChit);
        }
      }),
    [timeController],
  );

  return (
    <Stack sx={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
      <TopBar />
      <Box flex={1} style={{ display: "flex", position: "relative" }}>
        <MatchEndDisplay />
        {!errorMessage && rootChit && <PanelContents rootChit={rootChit} />}
        {errorMessage}
      </Box>
      <BottomBar />
    </Stack>
  );
}

export function MatchViewer() {
  const game = useGame();

  return (
    <TimeControllerProvider>
      <GameThemeProvider theme={game.theme}>
        <ThemeProvider theme={generateTheme(game)}>
          <InnerMatchViewer />
        </ThemeProvider>
      </GameThemeProvider>
    </TimeControllerProvider>
  );
}
