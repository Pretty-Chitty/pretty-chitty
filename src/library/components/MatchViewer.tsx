import React, { useEffect, useRef, useState } from "react";
import { useGame } from "../hooks/useGame";
import { Box, CssBaseline, Stack, ThemeProvider, createTheme } from "@mui/material";
import {
  TimeControllerProvider,
  useAnimationSpeedMultiplier,
  useClientStatus,
  useTimeController,
} from "../hooks/useTimeController";
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
import { PanelScaleProvider } from "../hooks/usePanelScale";
import { GalleryProvider, useGalleryState } from "../hooks/useGalleryState";
import { GalleryDisplay } from "./GalleryDisplay";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function generateTheme(game: Game<any, any>) {
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
        p: `${theme.spacing / 2}px`,
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

function BlurringGalleryWrapper({ children }: { children: React.ReactNode }) {
  const galleryState = useGalleryState();
  const [isShowingGallery, setIsShowingGallery] = useState(false);
  const [source] = useEventChannelState(galleryState.source);
  const theme = useGameTheme();
  const animationSpeedMultiplier = useAnimationSpeedMultiplier();

  useEffect(() => {
    if (source) {
      setIsShowingGallery(source.items.length > 0);
      return source.registerUpdateHandler(() => {
        setIsShowingGallery(source.items.length > 0);
      });
    } else {
      setIsShowingGallery(false);
    }
  }, [source, setIsShowingGallery]);

  return (
    <Box
      sx={{
        position: "relative",
        flex: 1,
        width: "100%",
        height: "100%",
        display: "flex",
        filter: isShowingGallery ? `blur(${theme.galleryBlur}px)` : "none",
        transition: `filter ${0.3 * animationSpeedMultiplier}s`,
      }}
    >
      {children}
    </Box>
  );
}

function InnerMatchViewer({ onBack }: { onBack?: () => void }) {
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
    <Stack
      sx={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        userSelect: "none",
        touchAction: "none", // Prevent dragging on touch devices
        WebkitTouchCallout: "none", // Prevent highlighting phone numbers on iOS
      }}
    >
      <TopBar onBack={onBack} />
      <Box flex={1} style={{ display: "flex", position: "relative" }}>
        <MatchEndDisplay />
        <GalleryDisplay />

        <BlurringGalleryWrapper>
          {!errorMessage && rootChit && <PanelContents rootChit={rootChit} />}
        </BlurringGalleryWrapper>
        {errorMessage}
      </Box>
      <BottomBar />
    </Stack>
  );
}

export function MatchViewer({ onBack }: { onBack?: () => void }) {
  const game = useGame();
  return (
    <TimeControllerProvider>
      <CssBaseline />
      <PanelScaleProvider>
        <GalleryProvider>
          <GameThemeProvider theme={game.theme}>
            <ThemeProvider theme={generateTheme(game)}>
              <InnerMatchViewer onBack={onBack} />
            </ThemeProvider>
          </GameThemeProvider>
        </GalleryProvider>
      </PanelScaleProvider>
    </TimeControllerProvider>
  );
}
