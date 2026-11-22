import React, { useEffect, useRef, useState } from "react";
import { Box, Stack, Slider, Typography, Button, Checkbox, FormControlLabel, Divider } from "@mui/material";
import { GameModalDialog } from "./GameModalDialog";
import { useModalState } from "../hooks/useModalState";
import { useEventChannelState } from "../hooks/useEventChannelState";
import { useGameTheme } from "../hooks/useGameTheme";
import { useTimeState } from "../hooks/useTimeController";
import { useDisplaySettings } from "../hooks/useDisplaySettings";
import {
  ANIMATION_SPEEDS,
  DISPLAY_SECTIONS,
  DISPLAY_STEP_COUNT,
  DISPLAY_STEP_LABELS,
  NORMAL_STEP,
  allAtStep,
  animationSpeedStep,
  overallStep,
} from "../game/DisplaySettings";

/** How long the dialog stays see-through after a size change, so the player can see the result */
const PREVIEW_MS = 2000;

interface StepSliderProps {
  label: string;
  valueLabel: string;
  step: number;
  onChange: (step: number) => void;
  lowHint: string;
  highHint: string;
  markLabels?: string[];
  compact?: boolean;
  /** No step is selected (Display Size when the parts are set differently): no handle and no filled track */
  unset?: boolean;
}

function StepSlider({ label, valueLabel, step, onChange, lowHint, highHint, markLabels, compact, unset }: StepSliderProps) {
  const theme = useGameTheme();
  const marks = Array.from({ length: DISPLAY_STEP_COUNT }, (_, i) => ({ value: i, label: markLabels?.[i] }));

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline">
        <Typography sx={{ color: theme.actionLogTextColor, fontWeight: "bold", fontSize: compact ? 14 : 16 }}>
          {label}
        </Typography>
        <Typography sx={{ color: theme.barHighlightTextColor, fontSize: compact ? 13 : 14 }}>{valueLabel}</Typography>
      </Stack>
      <Box sx={{ px: 1 }}>
        <Slider
          value={step}
          onChange={(_, value) => onChange(value as number)}
          min={0}
          max={DISPLAY_STEP_COUNT - 1}
          step={1}
          marks={marks}
          size={compact ? "small" : "medium"}
          sx={{
            color: theme.barHighlightTextColor,
            mb: markLabels ? 1 : 0,
            "& .MuiSlider-rail": { backgroundColor: theme.actionLogTextColor, opacity: 0.3 },
            "& .MuiSlider-mark": { backgroundColor: theme.actionLogTextColor, opacity: 0.5, width: 4, height: 4, borderRadius: 2 },
            "& .MuiSlider-markActive": { backgroundColor: theme.actionLogDialogBackgroundColor, opacity: 0.8 },
            "& .MuiSlider-markLabel": { color: theme.actionLogTextColor, opacity: 0.7, fontSize: 12 },
            ...(unset && {
              "& .MuiSlider-thumb, & .MuiSlider-track": { display: "none" },
              "& .MuiSlider-markActive": { backgroundColor: theme.actionLogTextColor, opacity: 0.5 },
            }),
          }}
        />
      </Box>
      {!markLabels && (
        <Stack direction="row" justifyContent="space-between" sx={{ mt: -0.5 }}>
          <Typography sx={{ color: theme.actionLogTextColor, opacity: 0.5, fontSize: 12 }}>{lowHint}</Typography>
          <Typography sx={{ color: theme.actionLogTextColor, opacity: 0.5, fontSize: 12 }}>{highHint}</Typography>
        </Stack>
      )}
    </Box>
  );
}

function ThemedCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (c: boolean) => void }) {
  const theme = useGameTheme();
  return (
    <FormControlLabel
      control={
        <Checkbox
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          sx={{ color: theme.actionLogTextColor, "&.Mui-checked": { color: theme.barHighlightTextColor } }}
        />
      }
      label={<Typography sx={{ color: theme.actionLogTextColor }}>{label}</Typography>}
    />
  );
}

function speedLabel(speed: number) {
  return speed === 0.5 ? "½×" : `${speed}×`;
}

export function SettingsDisplay() {
  const modalState = useModalState();
  const theme = useGameTheme();

  const [display, setDisplay] = useDisplaySettings();
  const overall = overallStep(display);

  // See-through for a moment after a size change, so the player can see what it did behind the dialog
  const [previewing, setPreviewing] = useState(false);
  const lastDisplay = useRef(display);
  useEffect(() => {
    if (lastDisplay.current === display) {
      return;
    }
    lastDisplay.current = display;
    setPreviewing(true);
    const to = setTimeout(() => setPreviewing(false), PREVIEW_MS);
    return () => clearTimeout(to);
  }, [display]);

  const timeState = useTimeState();
  const [speed, setSpeed] = useEventChannelState(timeState.animationSpeedMultiplier);
  const [skipReplay, setSkipReplay] = useEventChannelState(timeState.skipReplay);
  const [showLog, setShowLog] = useEventChannelState(timeState.showLog);
  const speedStep = animationSpeedStep(speed);

  const [visible, setVisible] = useEventChannelState(modalState.settingsVisible);

  const averageStep = Math.round(
    DISPLAY_SECTIONS.reduce((sum, s) => sum + display[s.key], 0) / DISPLAY_SECTIONS.length,
  );

  return (
    <GameModalDialog
      visible={visible}
      opacity={previewing ? 0.3 : 1}
      onClose={() => setVisible(false)}
      title="Settings"
    >
      <Box sx={{ p: 3, overflowY: "auto" }}>
        <Stack spacing={3}>
          <Stack>
            <ThemedCheckbox label="Skip Replay" checked={skipReplay} onChange={setSkipReplay} />
            <ThemedCheckbox label="Show Log (on larger screens)" checked={showLog} onChange={setShowLog} />
          </Stack>

          <Divider sx={{ borderColor: "rgba(128,128,128,0.3)" }} />

          <StepSlider
            label="Animation Speed"
            valueLabel={speedLabel(ANIMATION_SPEEDS[speedStep])}
            step={speedStep}
            onChange={(step) => setSpeed(1 / ANIMATION_SPEEDS[step])}
            lowHint="Slower"
            highHint="Faster"
            markLabels={ANIMATION_SPEEDS.map(speedLabel)}
          />

          <Divider sx={{ borderColor: "rgba(128,128,128,0.3)" }} />

          <Stack spacing={1}>
            <StepSlider
              label="Display Size"
              valueLabel={overall === undefined ? "Custom" : DISPLAY_STEP_LABELS[overall]}
              step={overall ?? averageStep}
              unset={overall === undefined}
              onChange={(step) => setDisplay(allAtStep(step))}
              lowHint="Fit more on screen"
              highHint="Bigger everything"
            />
            <Stack direction="row" justifyContent="flex-end">
              <Button
                size="small"
                disabled={overall === NORMAL_STEP}
                onClick={() => setDisplay(allAtStep(NORMAL_STEP))}
                sx={{
                  color: theme.actionLogTextColor,
                  textTransform: "none",
                  "&.Mui-disabled": { color: theme.actionLogTextColor, opacity: 0.3 },
                }}
              >
                Reset
              </Button>
            </Stack>
            <Stack spacing={2} sx={{ pl: 2, pt: 1, borderLeft: "2px solid rgba(128,128,128,0.4)" }}>
              {DISPLAY_SECTIONS.map((section) => (
                <StepSlider
                  compact
                  key={section.key}
                  label={section.label}
                  valueLabel={DISPLAY_STEP_LABELS[display[section.key]]}
                  step={display[section.key]}
                  onChange={(step) => setDisplay({ ...display, [section.key]: step })}
                  lowHint={section.smallerHint}
                  highHint={section.biggerHint}
                />
              ))}
            </Stack>
          </Stack>
        </Stack>
      </Box>
    </GameModalDialog>
  );
}
