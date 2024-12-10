import React from 'react';
import { Box, Stack } from '@mui/material';
import { FastForward, Settings, FastRewind, SkipNext, Speed } from '@mui/icons-material';

import { useTimeController, useTimeState } from '../hooks/useTimeController';
import { useEventChannelState } from '../hooks/useEventChannelState';
import BottomBarButton from './BottomBarButton';
import { useGameTheme } from '../hooks/useGameTheme';

const SPEEDS = [1, 0.5, 0.25, 0.125, 2];

export default function TimeControlBar() {
  const theme = useGameTheme();
  const timeController = useTimeController();
  const timeState = useTimeState();
  const [speed, setSpeed] = useEventChannelState(timeState.targetAnimationSpeedMultiplier);
  const [targetClock, setTargetClock] = useEventChannelState(timeState.targetClock);
  const [maxClock] = useEventChannelState(timeController.maxClock);
  const [, setLive] = useEventChannelState(timeState.live);

  const toggleSpeed = () => {
    const currentIndex = SPEEDS.indexOf(speed);
    setSpeed(SPEEDS[(currentIndex + 1) % SPEEDS.length]);
  };

  return (
    <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
      <Box sx={{ position: 'absolute', width: '100%' }}>
        <Box
          sx={{
            width: `${(targetClock / maxClock.clock) * 100}%`,
            background: theme.barHighlightTextColor,
            transition: 'width linear 0.25s',
            height: '6px',
          }}
        />
      </Box>

      <Stack direction="row" sx={{ width: '100%', height: '100%', pl: 1, pr: 1 }}>
        <BottomBarButton icon={Settings} label="Menu" />
        <BottomBarButton icon={Speed} label={`${1 / speed}x`} onClick={toggleSpeed} />
        <Box flex={1} />
        <BottomBarButton icon={FastRewind} label="Back" whileHolding={(n: number) => setTargetClock(targetClock - n)} />
        <BottomBarButton
          icon={FastForward}
          label="Forward"
          whileHolding={(n: number) => setTargetClock(targetClock + n)}
        />
        <Box flex={1} />
        <BottomBarButton
          icon={SkipNext}
          label="Live"
          onClick={() => {
            setTargetClock(maxClock.clock);
            setLive(true);
          }}
        />
      </Stack>
    </Box>
  );
}
