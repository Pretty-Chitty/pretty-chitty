import React, { useState } from "react";
import useLocalStorageState from "use-local-storage-state";
import {
  AppBar,
  Tabs,
  Tab,
  CssBaseline,
  Stack,
  Box,
  Paper,
  Select,
  MenuItem,
  FormControl,
  IconButton,
  Tooltip,
  ToggleButton,
} from "@mui/material";
import { OpenInNew, Refresh, Tune } from "@mui/icons-material";
import CanvasLibraryViewer from "./CanvasLibraryViewer";
import { Game } from "../game/Game";
import ChitLibraryViewer from "./ChitLibraryViewer";
import Playground from "./Playground";
import { DemoWrapper } from "./DemoWrapper";
import { TutorialDevPanel } from "./Tutorial/TutorialDevPanel";

const NONE = "__none__";

/** The Demo tab: a demo game or any of the game's tutorials, with the tutorial workbench beside it. */
function DemoWorkbench({ game }: { game: Game<any, any> }) {
  const tutorials = game.tutorials ?? [];
  const [selected, setSelected] = useLocalStorageState<string>(`demo_${game.metadata.name}_tutorial`, {
    defaultValue: tutorials[0] ? `${tutorials[0].id}|${tutorials[0].locale}` : NONE,
  });
  const [showDev, setShowDev] = useLocalStorageState<boolean>(`demo_${game.metadata.name}_devPanel`, {
    defaultValue: true,
  });
  const [restartKey, setRestartKey] = useState(0);
  const [startAt, setStartAt] = useState(0);

  const [id, locale] = selected === NONE ? [undefined, undefined] : selected.split("|");
  const spec = id ? tutorials.find((t) => t.id === id && t.locale === locale) : undefined;
  const restart = (at = 0) => {
    setStartAt(at);
    setRestartKey((k) => k + 1);
  };

  const fullScreenUrl = spec ? `/demo?tutorial=${encodeURIComponent(spec.id)}&locale=${encodeURIComponent(spec.locale)}` : "/demo";

  return (
    <Stack sx={{ height: "100%", minHeight: 0 }}>
      <Paper elevation={3} sx={{ position: "relative", zIndex: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 1 }}>
          <FormControl sx={{ minWidth: 240 }}>
            <Select
              variant="standard"
              value={spec ? selected : NONE}
              onChange={(e) => {
                setSelected(e.target.value);
                restart(0);
              }}
            >
              <MenuItem value={NONE}>Demo (no tutorial)</MenuItem>
              {tutorials.map((t) => (
                <MenuItem key={`${t.id}|${t.locale}`} value={`${t.id}|${t.locale}`}>
                  {t.title} ({t.locale}) · {t.steps.length} steps
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Tooltip title="Restart">
            <IconButton size="small" onClick={() => restart(0)}>
              <Refresh />
            </IconButton>
          </Tooltip>
          <Tooltip title="Open full screen">
            <IconButton size="small" component="a" href={fullScreenUrl} target="_blank">
              <OpenInNew />
            </IconButton>
          </Tooltip>
          <Box flex={1} />
          {spec && (
            <Tooltip title="Tutorial workbench">
              <ToggleButton size="small" value="dev" selected={showDev} onChange={() => setShowDev(!showDev)}>
                <Tune fontSize="small" />
              </ToggleButton>
            </Tooltip>
          )}
        </Stack>
      </Paper>
      <Stack direction="row" sx={{ flex: 1, minHeight: 0 }}>
        <Box sx={{ flex: 1, minWidth: 0, position: "relative" }}>
          <DemoWrapper key={`${selected}-${restartKey}`} game={game} tutorial={spec} startAt={startAt}>
            {spec && showDev && (
              <Box
                sx={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  bottom: 0,
                  width: 360,
                  background: "background.paper",
                  bgcolor: "background.paper",
                  borderLeft: "1px solid rgba(0,0,0,0.12)",
                  zIndex: 2,
                  overflow: "hidden",
                }}
              >
                <TutorialDevPanel onRestart={restart} />
              </Box>
            )}
          </DemoWrapper>
        </Box>
      </Stack>
    </Stack>
  );
}

export function GameDesigner({ game }: { game: Game<any, any> }) {
  const [tabIndex, setTabIndex] = useLocalStorageState("selectedMainTab", {
    defaultValue: 2,
  });

  const isDemo = window.location.pathname.endsWith("/demo");

  if (isDemo) {
    const params = new URLSearchParams(window.location.search);
    const tutorial = params.get("tutorial") ?? undefined;
    const locale = params.get("locale") ?? undefined;
    return (
      <Stack sx={{ height: "100vh", maxHeight: "-webkit-fill-available", width: "100vw" }}>
        <DemoWrapper
          game={game}
          tutorial={tutorial}
          locale={locale}
          onBack={() => {
            window.history.back();
          }}
        />
      </Stack>
    );
  }

  return (
    <Stack sx={{ height: "100vh", maxHeight: "-webkit-fill-available", width: "100vw" }}>
      <CssBaseline />

      <AppBar position="static">
        <Tabs
          value={tabIndex}
          onChange={(e, newValue) => setTabIndex(newValue)}
          indicatorColor="secondary"
          textColor="inherit"
          variant="fullWidth"
        >
          <Tab label="Canvas" />
          <Tab label="Chits" />
          <Tab label="Playground" />
          <Tab label="Demo" />
        </Tabs>
      </AppBar>
      {tabIndex === 0 && <CanvasLibraryViewer library={game.canvasLibrary} />}
      {tabIndex === 1 && <ChitLibraryViewer library={game.chitLibrary} />}
      {tabIndex === 2 && <Playground game={game} />}
      {tabIndex === 3 && <DemoWorkbench game={game} />}
    </Stack>
  );
}
