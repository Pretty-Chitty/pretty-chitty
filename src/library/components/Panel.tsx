import React, { useCallback, useEffect, useState } from 'react';
import base64 from 'base-64';
import { Box, Stack } from '@mui/material';
import { useDebounce } from '@react-hook/debounce';

import { Chit } from '../game/Chit';
import Viewer from './Viewer';
import { PanelLayoutResult, PanelChit } from '../game/PanelChit';
import { useGameTheme } from '../hooks/useGameTheme';
import { useTimeState } from '../hooks/useTimeController';
import { usePanelStates } from '../hooks/usePanelStates';
import { RootChitRenderInstance } from '../rendering/RootChitRenderInstance';
import { useEventChannelState } from '../hooks/useEventChannelState';
import PanelSpark from './PanelSpark';
import { useChit } from '../hooks/useChits';
import { ZINDEX_PANEL_CUTOUTS, ZINDEX_SPARKS } from '../utilities/zIndex';

const Cutout = `data:image/svg+xml;base64,${base64.encode(
  `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg
   width="40"
   height="20"
   version="1.1"
   id="svg4"
   sodipodi:docname="cutout.svg"
   viewport="0 0 40 20"
   inkscape:version="1.3.1 (9b9bdc1480, 2023-11-25, custom)"
   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
   xmlns="http://www.w3.org/2000/svg"
   xmlns:svg="http://www.w3.org/2000/svg">
  <rect
     style="fill:#000000;stroke-width:1.58232"
     id="rect4"
     width="34"
     height="8"
     x="3"
     y="6"
     ry="4" />
</svg>`,
)}`;

function ViewerWrapper({
  chit,
  w,
  h,
  paused,
  panCallback,
}: {
  chit: Chit;
  w: number;
  h: number;
  paused: boolean;
  panCallback?: (direction: 'left' | 'right') => void;
}) {
  const chitInstance = useChit(chit.id ?? 'nochit');

  const sparks = chitInstance?.getSparks('panel') ?? [];

  return (
    <>
      <Stack direction="row-reverse" sx={{ position: 'absolute', zIndex: ZINDEX_SPARKS }}>
        {sparks
          .concat()
          .reverse()
          .map((spark) => (
            <PanelSpark key={spark.id} chit={spark} paused={paused} />
          ))}
      </Stack>
      <Viewer paused={paused} chit={chit} w={w} h={h} panCallback={panCallback} />
    </>
  );
}

function SinglePanel({ chit, x, y, w, h }: { chit: Chit; x: number; y: number; w: number; h: number }) {
  const theme = useGameTheme();
  return (
    <Box
      sx={{
        overflow: 'hidden',
        width: `${w}px`,
        height: `${h}px`,
        left: `${x}px`,
        top: `${y}px`,
        position: 'absolute',
        p: `${theme.spacing}px`,
      }}
    >
      <Box sx={{ width: '100%', height: '100%', position: 'relative', borderRadius: '10px', overflow: 'hidden' }}>
        <ViewerWrapper chit={chit} w={w - theme.spacing * 2} h={h - theme.spacing * 2} paused={false} />
      </Box>
    </Box>
  );
}

function MultiPanel({ chits, x, y, w, h }: { chits: Chit[]; x: number; y: number; w: number; h: number }) {
  const theme = useGameTheme();
  // const clientPrompt = useClientPrompts();
  // const [prompt] = useEventChannelState(clientPrompt.currentPrompt);
  const timeState = useTimeState();
  const [isSliding, setIsSliding] = useState(false);
  const [targetAnimationSpeed] = useEventChannelState(timeState.targetAnimationSpeedMultiplier);
  const [actualAnimationSpeed] = useEventChannelState(timeState.animationSpeedMultiplier);
  const [selectedIndex, setSelectedIndex] = useDebounce(0);
  const rootRenders = chits.map((c) =>
    c.renderInstance instanceof RootChitRenderInstance ? c.renderInstance : undefined,
  );
  const panelStates = usePanelStates(rootRenders);
  const CUTOUT_WIDTH = Math.min(40, (w - theme.spacing * 2) / chits.length);
  const CUTOUT_HEIGHT = 20;
  const ANIMATION_DURATION = 0.25;

  // if animation speeds aren't in sync, we are probably trying to fast forward (at the beginning of loading)
  const isAnimationSpeedLinedUp = targetAnimationSpeed === actualAnimationSpeed;

  // useEffect(() => {
  //   rootRenders.forEach((r) => r?.resetMarks());
  // }, [prompt, rootRenders]);

  // panel selection magic...
  // if (prompt) {
  //   // show the correct stuff for prompts?
  // } else
  // if (panelStates[selectedIndex]?.state === "inactive") {
  // check to see if there is a panel that is "leaving"
  const leavingIndex = panelStates.findIndex((p) => p.state === 'leaving');
  const enteringIndex = panelStates.findIndex((p) => p.state === 'entering');
  const pendingIndex = panelStates.findIndex((p) => p.state === 'pending');
  if (leavingIndex >= 0) {
    // console.log("leaving", leavingIndex);
    setSelectedIndex(leavingIndex);
  } else if (enteringIndex >= 0) {
    // console.log("enterin", enteringIndex);
    setSelectedIndex(enteringIndex);
  } else if (pendingIndex >= 0) {
    // console.log("pending", pendingIndex);
    setSelectedIndex(pendingIndex);
  }
  // }

  const key = `panel--${chits.map((c) => c.id).join('-')}`;
  useEffect(() => {
    setIsSliding(true);
    timeState.setAnimationState(key, true);
    const to = setTimeout(
      () => {
        timeState.setAnimationState(key, false);
        setIsSliding(false);
      },
      ANIMATION_DURATION * 1000 + 200,
    );
    return () => clearTimeout(to);
  }, [selectedIndex, key, timeState]);

  const panCallback = useCallback(
    (direction: 'left' | 'right') => {
      if (direction === 'left') {
        setSelectedIndex((chits.length + selectedIndex - 1) % chits.length);
      } else {
        setSelectedIndex((chits.length + selectedIndex + 1) % chits.length);
      }
    },
    [selectedIndex, chits.length, setSelectedIndex],
  );

  return (
    <Stack
      sx={{
        overflow: 'hidden',
        width: `${w}px`,
        height: `${h}px`,
        left: `${x}px`,
        top: `${y}px`,
        position: 'absolute',
        p: `${theme.spacing}px`,
      }}
    >
      <Box sx={{ width: '100%', flex: 1, position: 'relative', borderRadius: '10px', overflow: 'hidden' }}>
        {chits.map((chit, index) => (
          <Box
            key={chit.id}
            sx={{
              width: '100%',
              height: '100%',
              transition: `transform ease-in-out ${ANIMATION_DURATION}s`,
              position: 'absolute',
              left: 0,
              top: 0,
              transform:
                index === selectedIndex ? `translateX(0)` : `translateX(${index > selectedIndex ? '110%' : '-110%'})`,
            }}
          >
            <ViewerWrapper
              paused={isSliding ? true : isAnimationSpeedLinedUp ? selectedIndex !== index : false}
              chit={chit}
              w={w - theme.spacing * 2}
              h={h - CUTOUT_HEIGHT - theme.spacing * 2}
              panCallback={panCallback}
            />
          </Box>
        ))}
      </Box>

      <Stack direction="row" sx={{ height: CUTOUT_HEIGHT }}>
        <Box flex={1} />
        <Box
          sx={{
            width: CUTOUT_WIDTH * chits.length,
            position: 'relative',
            mask: `url(${Cutout})`,
            maskSize: `${CUTOUT_WIDTH}px ${CUTOUT_HEIGHT}px`,
          }}
        >
          {chits.map((chit, index) => (
            <Box
              onClick={() => setSelectedIndex(index)}
              key={chit.id}
              sx={{
                zIndex: ZINDEX_PANEL_CUTOUTS,
                cursor: 'pointer',
                height: CUTOUT_HEIGHT,
                width: CUTOUT_WIDTH,
                position: 'absolute',
                top: 0,
                left: index * CUTOUT_WIDTH,
              }}
            />
          ))}
          <Box sx={{ height: CUTOUT_HEIGHT, width: '100%', background: theme.panelSelectionCutoutBackground }} />
          <Box
            sx={{
              height: CUTOUT_HEIGHT,
              width: CUTOUT_WIDTH,
              transition: `left ease-in-out ${ANIMATION_DURATION}s`,
              background: theme.panelSelectionCutoutSelected,
              position: 'absolute',
              top: 0,
              left: selectedIndex * CUTOUT_WIDTH,
            }}
          />
        </Box>
        <Box flex={1} />
      </Stack>
    </Stack>
  );
}

export default function Panel({
  chit,
  x,
  y,
  w,
  h,
}: {
  chit: Chit | Chit[];
  x: number;
  y: number;
  w: number;
  h: number;
}) {
  const [layout, setLayout] = useState<PanelLayoutResult[]>([]);

  useEffect(() => {
    if (!chit) {
      return;
    }

    if (chit instanceof PanelChit) {
      const newLayout = chit.getFlatLayout(w, h);
      setLayout(newLayout);
    } else {
      setLayout([{ chit, x: 0, y: 0, w, h }]);
    }
  }, [chit, w, h, setLayout]);

  if (layout.length > 1) {
    return (
      <>
        {layout.map((cell) => (
          <Panel key={cell.id} chit={cell.chit} x={x + cell.x} y={y + cell.y} w={cell.w} h={cell.h} />
        ))}
      </>
    );
  }

  if (layout.length === 0) {
    return null;
  }

  if (Array.isArray(layout[0].chit)) {
    return <MultiPanel chits={layout[0].chit} w={w} h={h} x={x} y={y} />;
  } else {
    return <SinglePanel chit={layout[0].chit} w={w} h={h} x={x} y={y} />;
  }
}
