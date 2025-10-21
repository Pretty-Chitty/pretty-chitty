import React from "react";
import { Box, Stack, Slider, Typography, Button, Checkbox, FormControlLabel } from "@mui/material";
import { GameModalDialog } from "./GameModalDialog";
import { useModalState } from "../hooks/useModalState";
import { useEventChannelState } from "../hooks/useEventChannelState";
import { useGameTheme } from "../hooks/useGameTheme";
import { useTimeState } from "../hooks/useTimeController";
import { usePanelScale, usePanelSetScale } from "../hooks/usePanelScale";

interface SettingSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
}

function SettingSlider({ label, value, onChange, min, max }: SettingSliderProps) {
  const theme = useGameTheme();

  return (
    <Box>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
        <Typography sx={{ color: theme.actionLogTextColor, fontWeight: "bold", minWidth: 120 }}>{label}</Typography>
        <Typography sx={{ color: theme.actionLogTextColor, minWidth: 40, textAlign: "right" }}>
          {value.toFixed(2)}
        </Typography>
        <Button
          variant="outlined"
          size="small"
          onClick={() => onChange(1)}
          sx={{
            color: theme.actionLogTextColor,
            borderColor: theme.actionLogTextColor,
            "&:hover": {
              borderColor: theme.actionLogTextColor,
              backgroundColor: "rgba(255,255,255,0.1)",
            },
          }}
        >
          Reset
        </Button>
      </Stack>
      <Slider
        value={value}
        onChange={(_, value) => onChange(value as number)}
        min={min}
        max={max}
        step={0.01}
        sx={{
          color: theme.actionLogTextColor,
          "& .MuiSlider-thumb": {
            backgroundColor: theme.actionLogTextColor,
          },
          "& .MuiSlider-track": {
            backgroundColor: theme.actionLogTextColor,
          },
          "& .MuiSlider-rail": {
            backgroundColor: "rgba(255,255,255,0.3)",
          },
        }}
      />
    </Box>
  );
}

export function SettingsDisplay() {
  const modalState = useModalState();
  const theme = useGameTheme();

  const scale = usePanelScale();
  const setScale = usePanelSetScale();

  const timeState = useTimeState();
  const [speed, setSpeed] = useEventChannelState(timeState.animationSpeedMultiplier);
  const [skipReplay, setSkipReplay] = useEventChannelState(timeState.skipReplay);
  const [showLog, setShowLog] = useEventChannelState(timeState.showLog);

  const [visible, setVisible] = useEventChannelState(modalState.settingsVisible);

  return (
    <GameModalDialog visible={visible} onClose={() => setVisible(false)} title="Settings">
      <Box sx={{ p: 3, overflowY: "auto" }}>
        <Stack spacing={4}>
          <SettingSlider label="Scale" value={scale} onChange={setScale} min={0.5} max={3} />
          <SettingSlider
            label="Animation Speed"
            value={1 / speed}
            onChange={(value) => setSpeed(1 / value)}
            min={0.25}
            max={8}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={skipReplay}
                onChange={(e) => setSkipReplay(e.target.checked)}
                sx={{
                  color: theme.actionLogTextColor,
                  "&.Mui-checked": {
                    color: theme.actionLogTextColor,
                  },
                }}
              />
            }
            label={<Typography sx={{ color: theme.actionLogTextColor }}>Skip Replay</Typography>}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={showLog}
                onChange={(e) => setShowLog(e.target.checked)}
                sx={{
                  color: theme.actionLogTextColor,
                  "&.Mui-checked": {
                    color: theme.actionLogTextColor,
                  },
                }}
              />
            }
            label={<Typography sx={{ color: theme.actionLogTextColor }}>Show Log (on larger screens)</Typography>}
          />
        </Stack>
      </Box>
    </GameModalDialog>
  );
}
