import React, { useEffect, useRef, useState } from "react";
import { useGame } from "../hooks/useGame";
import { Box, CssBaseline, Stack, ThemeProvider, createTheme } from "@mui/material";
import { TimeControllerProvider, useClientStatus, useTimeController } from "../hooks/useTimeController";
import BottomBar from "./BottomBar";
import { GameThemeProvider, useGameTheme } from "../hooks/useGameTheme";

import "@fontsource/raleway/400.css";
import TopBar from "./TopBar";
import { useEventChannelState } from "../hooks/useEventChannelState";
import { MatchEndDisplay } from "./MatchEndDisplay";
import { PanelScaleProvider } from "../hooks/usePanelScale";
import { ModalProvider } from "../hooks/useModalState";
import { FullScreenGalleryDisplay } from "./FullScreenGalleryDisplay";
import { ActionLogDisplay } from "./ActionLogDisplay";
import { ActionLogHistoryDisplay } from "./ActionLogHistoryDisplay";
import { PanelContents } from "./Panel/PanelContents";
import useSize from "@react-hook/size";
import { SettingsDisplay } from "./SettingsDisplay";
import { ActionLogSidebar } from "./ActionLogSidebar";
import { InlineGalleryDisplay } from "./InlineGalleryDisplay";

const theme = createTheme({
  typography: {
    fontFamily: ["Raleway", "sans-serif"].join(","),
  },
});

function InnerMatchViewer({ onBack }: { onBack?: () => void }) {
  const timeController = useTimeController();
  const theme = useGameTheme();
  const clientStatus = useClientStatus();
  const [errorMessage] = useEventChannelState(clientStatus.errorMessage);
  const [rootChit, setRootChit] = useState(timeController.rootChit.value);
  const ref = useRef(null);
  const outerRef = useRef(null);
  const [width, height] = useSize(ref);
  const [outerWidth] = useSize(outerRef);
  const [showLog] = useEventChannelState(timeController.clientTimeState.showLog);

  useEffect(
    () =>
      timeController.rootChit.on((rootChit) => {
        if (rootChit) {
          setRootChit(rootChit);
        }
      }),
    [timeController],
  );

  const largeEnoughToShowLogSidebar = outerWidth >= 1000;

  return (
    <Stack
      direction={"row"}
      ref={outerRef}
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
      <Stack flex={1} sx={{ maxWidth: "100%" }}>
        <TopBar onBack={onBack} />
        <Stack
          direction={"column"}
          flex={1}
          ref={ref}
          sx={{
            background: `${theme.backgroundColor} linear-gradient(${theme.backgroundGradientAngle}deg, rgba(255,255,255,${theme.backgroundGradientPercent}) 0%, rgba(0,0,0,${theme.backgroundGradientPercent}) 100%)`,
          }}
        >
          <Box flex={1} style={{ display: "flex", position: "relative" }}>
            <MatchEndDisplay />
            <FullScreenGalleryDisplay />
            <SettingsDisplay />
            <ActionLogHistoryDisplay />

            {!errorMessage && rootChit && <PanelContents rootChit={rootChit} scaleWidth={width} scaleHeight={height} />}
            {errorMessage}
          </Box>
          <InlineGalleryDisplay />
          <ActionLogDisplay toggleSidebarLog={largeEnoughToShowLogSidebar} />
        </Stack>
        <BottomBar />
      </Stack>

      {largeEnoughToShowLogSidebar && showLog && <ActionLogSidebar />}
    </Stack>
  );
}

export function MatchViewer({ onBack }: { onBack?: () => void }) {
  const game = useGame();
  return (
    <TimeControllerProvider>
      <CssBaseline />
      <PanelScaleProvider>
        <ModalProvider>
          <GameThemeProvider theme={game.theme}>
            <ThemeProvider theme={theme}>
              <InnerMatchViewer onBack={onBack} />
            </ThemeProvider>
          </GameThemeProvider>
        </ModalProvider>
      </PanelScaleProvider>
    </TimeControllerProvider>
  );
}
