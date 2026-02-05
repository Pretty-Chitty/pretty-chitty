import React from "react";
import useLocalStorageState from "use-local-storage-state";
import { AppBar, Tabs, Tab, CssBaseline, Stack } from "@mui/material";
import CanvasLibraryViewer from "./CanvasLibraryViewer";
import { Game } from "../game/Game";
import ChitLibraryViewer from "./ChitLibraryViewer";
import Playground from "./Playground";
import DemoWrapper from "./DemoWrapper";

export function GameDesigner({ game }: { game: Game<any, any> }) {
  const [tabIndex, setTabIndex] = useLocalStorageState("selectedMainTab", {
    defaultValue: 2,
  });

  const isDemo = window.location.pathname.endsWith("/demo");

  if (isDemo) {
    return (
      <Stack sx={{ height: "100vh", maxHeight: "-webkit-fill-available", width: "100vw" }}>
        <DemoWrapper game={game} />
      </Stack>
    );
  }

  return (
    <Stack sx={{ height: "100vh", maxHeight: "-webkit-fill-available", width: "100vw" }}>
      <CssBaseline />

      <AppBar position="static">
        <Tabs
          value={tabIndex}
          onChange={(e, newValue) => {
            if (newValue === 3) {
              document.location.pathname = "/demo";
            } else {
              setTabIndex(newValue);
            }
          }}
          indicatorColor="secondary"
          textColor="inherit"
          variant="fullWidth"
        >
          <Tab label="Canvas" />
          <Tab label="Chits" />
          <Tab label="Playground" />
          <Tab label="Demo" />
          {/* <Tab label="Gallery" /> */}
        </Tabs>
      </AppBar>
      {tabIndex === 0 && <CanvasLibraryViewer library={game.canvasLibrary} />}
      {tabIndex === 1 && <ChitLibraryViewer library={game.chitLibrary} />}
      {tabIndex === 2 && <Playground game={game} />}
      {/* {tabIndex === 3 && <GalleryPlayground game={game} />} */}
    </Stack>
  );
}
