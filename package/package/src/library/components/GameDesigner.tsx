import React from 'react';
import useLocalStorageState from 'use-local-storage-state';
import { AppBar, Tabs, Tab, CssBaseline, Stack } from '@mui/material';

import CanvasLibraryViewer from './CanvasLibraryViewer';
import { Game } from '../game/Game';
import ChitLibraryViewer from './ChitLibraryViewer';
import Playground from './Playground';

export function GameDesigner({ game }: { game: Game<any, any> }) {
  const [tabIndex, setTabIndex] = useLocalStorageState('selectedMainTab', {
    defaultValue: 2,
  });

  return (
    <Stack sx={{ height: '100vh', maxHeight: '-webkit-fill-available', width: '100vw' }}>
      <CssBaseline />

      <AppBar position="static">
        <Tabs
          value={tabIndex}
          onChange={(_e, newValue) => setTabIndex(newValue)}
          indicatorColor="secondary"
          textColor="inherit"
          variant="fullWidth"
        >
          <Tab label="Canvas" />
          <Tab label="Chits" />
          <Tab label="Playground" />
        </Tabs>
      </AppBar>
      {tabIndex === 0 && <CanvasLibraryViewer library={game.canvasLibrary} />}
      {tabIndex === 1 && <ChitLibraryViewer library={game.chitLibrary} />}
      {tabIndex === 2 && <Playground game={game} />}
    </Stack>
  );
}
