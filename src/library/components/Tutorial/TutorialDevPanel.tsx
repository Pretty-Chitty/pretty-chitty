import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTutorial } from "../../hooks/useTutorial";
import { useEventChannelState } from "../../hooks/useEventChannelState";
import { TutorialController, TutorialStatus } from "../../game/tutorial/TutorialController";
import { EventChannel } from "../../utilities/EventChannel";

const mono = { fontFamily: "monospace", fontSize: 11 } as const;

function copy(text: string) {
  void navigator.clipboard?.writeText(text).catch(() => {});
}

/**
 * The Playground's tutorial workbench: step list with jump-to, live check result and hint, the RNG
 * and bot-decision logs with step attribution, warnings, a sentence-timing recorder and a few toggles.
 * Mount it next to a `DemoWrapper` that has a tutorial.
 */
export function TutorialDevPanel({ onRestart }: { onRestart?: (startAt: number) => void }) {
  const tutorial = useTutorial();
  const [controller] = useEventChannelState(tutorial?.controller ?? DUMMY);
  if (!tutorial) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2">No tutorial running.</Typography>
      </Box>
    );
  }
  return <Inner controller={controller} onRestart={onRestart} />;
}

const DUMMY = new EventChannel<TutorialController<any, any> | undefined>(undefined);
const DUMMY_CHECK = new EventChannel<boolean | string | undefined>(undefined);
const DUMMY_HINT = new EventChannel<string | undefined>(undefined);

function Inner({
  controller,
  onRestart,
}: {
  controller: TutorialController<any, any> | undefined;
  onRestart?: (startAt: number) => void;
}) {
  const tutorial = useTutorial()!;
  const { runtime, spec } = tutorial;
  const [rngLog] = useEventChannelState(runtime.rngLog);
  const [decisions] = useEventChannelState(runtime.decisionLog);
  const [warnings] = useEventChannelState(runtime.warnings);
  const [activeStep] = useEventChannelState(runtime.activeStep);
  const [dev, setDev] = useEventChannelState(tutorial.dev);
  const [muted, setMuted] = useEventChannelState(tutorial.muted);
  const [index] = useEventChannelState(controller?.index ?? DUMMY_NUM);
  const [status] = useEventChannelState(controller?.status ?? DUMMY_STR);
  const [check] = useEventChannelState(controller?.check ?? DUMMY_CHECK);
  const [hint] = useEventChannelState(controller?.hint ?? DUMMY_HINT);
  const [time] = useEventChannelState(controller?.narrationTime ?? DUMMY_NUM);
  const [sentence] = useEventChannelState(controller?.sentence ?? DUMMY_NUM);
  const [boardClock] = useEventChannelState(controller?.boardClock ?? DUMMY_NUM);
  const [timelineHold] = useEventChannelState(controller?.timelineHold ?? DUMMY_HOLD);
  const [fastTarget] = useEventChannelState(controller?.fastForwardTarget ?? DUMMY_HOLD);
  const [marks, setMarks] = useState<number[]>([]);
  const [recording, setRecording] = useState(false);

  // Sentence-timing recorder: press space while the narration plays
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setMarks((m) => [...m, Math.round((controller?.narrationTime.value ?? 0) * 100) / 100]);
      }
    };
    // Capture phase, so the mark claims the space before the tutorial's play/pause shortcut sees it
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, controller]);

  const step = controller?.step;
  const rngByStep = (stepId: string) =>
    rngLog
      .filter((e) => e.activeStep === stepId)
      .map((e) => (e.count === 1 ? e.values[0] : e.values))
      .map((v) => (Array.isArray(v) ? `[${v.map((n) => n.toFixed(3)).join(", ")}]` : v.toFixed(3)));

  return (
    <Stack sx={{ height: "100%", overflow: "hidden", minWidth: 320 }}>
      <Box sx={{ p: 1.5, pb: 1 }}>
        <Typography variant="subtitle2">
          {spec.title} <Chip size="small" label={spec.locale} sx={{ ml: 0.5 }} />
        </Typography>
        <Typography variant="caption" sx={{ opacity: 0.7 }}>
          {controller ? status : "loading"} · active step: {activeStep} · rng left: {runtime.rngRemaining}
        </Typography>
        <Typography variant="caption" component="div" sx={{ opacity: 0.7 }}>
          board clock: {boardClock}
          {timelineHold !== undefined ? ` · held at ${timelineHold}` : " · playing"}
          {fastTarget !== undefined ? ` · fast-forwarding to step ${fastTarget + 1}` : ""}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
          <Button size="small" variant="outlined" onClick={() => onRestart?.(0)}>
            Restart
          </Button>
          <Button size="small" variant="outlined" disabled={!step} onClick={() => onRestart?.(index)}>
            Restart at step
          </Button>
          <Button size="small" variant="outlined" disabled={!controller} onClick={() => controller?.next()}>
            Force next
          </Button>
        </Stack>
        <Stack direction="row" flexWrap="wrap" useFlexGap>
          <FormControlLabel
            control={<Checkbox size="small" checked={muted} onChange={(e) => setMuted(e.target.checked)} />}
            label={<Typography variant="caption">Mute (reading clock)</Typography>}
          />
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={dev.showTargetRects}
                onChange={(e) => setDev({ ...dev, showTargetRects: e.target.checked })}
              />
            }
            label={<Typography variant="caption">Show target rects</Typography>}
          />
        </Stack>
      </Box>
      <Divider />

      <Box sx={{ flex: 1, overflowY: "auto" }}>
        <Typography variant="overline" sx={{ px: 1.5, opacity: 0.7 }}>
          Steps
        </Typography>
        <List dense disablePadding>
          {spec.steps.map((s, i) => {
            const values = rngByStep(s.id);
            return (
              <ListItemButton
                key={s.id}
                selected={i === index}
                onClick={(e) => {
                  // A later step plays through to it (moves made for the player); Alt-click just jumps
                  if (controller && i > index && !e.altKey) controller.fastForwardTo(i);
                  else controller?.jumpTo(i);
                }}
                title="Click: play through to this step · Alt-click: jump without playing"
                sx={{ py: 0.25 }}
              >
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        {i + 1}. {s.id}
                      </Typography>
                      {s.waitFor && <Chip size="small" label="do it" variant="outlined" />}
                      {s.waitFor && !s.allow && <Chip size="small" color="error" label="no allow" variant="outlined" />}
                      {s.rng && <Chip size="small" label={`rng ${s.rng.length}`} variant="outlined" />}
                      {s.ai && <Chip size="small" label="ai" variant="outlined" />}
                      {values.length > 0 && (
                        <Tooltip title={`Copy rng: [${values.join(", ")}]`}>
                          <Button
                            size="small"
                            sx={{ minWidth: 0, px: 0.5, ...mono }}
                            onClick={(e) => {
                              e.stopPropagation();
                              copy(`rng: [${values.join(", ")}],`);
                            }}
                          >
                            copy rng
                          </Button>
                        </Tooltip>
                      )}
                    </Stack>
                  }
                  secondary={
                    i === index ? (
                      <Typography variant="caption" component="div">
                        check: {check === undefined ? "—" : String(check)}
                        {hint ? ` · hint: ${hint}` : ""}
                      </Typography>
                    ) : undefined
                  }
                />
              </ListItemButton>
            );
          })}
        </List>

        <Divider sx={{ my: 1 }} />
        <Box sx={{ px: 1.5 }}>
          <Typography variant="overline" sx={{ opacity: 0.7 }}>
            Narration
          </Typography>
          <Typography variant="caption" component="div">
            t = {time.toFixed(2)}s · sentence {sentence}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
            <Button
              size="small"
              variant={recording ? "contained" : "outlined"}
              onClick={() => {
                if (!recording) setMarks([]);
                setRecording(!recording);
              }}
            >
              {recording ? "Stop (space = mark)" : "Record sentence times"}
            </Button>
            {marks.length > 0 && (
              <Button size="small" onClick={() => copy(`sentenceTimes: [${marks.join(", ")}],`)}>
                copy {marks.length}
              </Button>
            )}
          </Stack>
          {marks.length > 0 && (
            <Typography component="div" sx={{ ...mono, mt: 0.5 }}>
              sentenceTimes: [{marks.join(", ")}]
            </Typography>
          )}
        </Box>

        <Divider sx={{ my: 1 }} />
        <Box sx={{ px: 1.5 }}>
          <Typography variant="overline" sx={{ opacity: 0.7 }}>
            RNG log
          </Typography>
          {rngLog.length === 0 && (
            <Typography variant="caption" component="div">
              no draws yet
            </Typography>
          )}
          {rngLog.map((e) => (
            <Typography
              key={e.index}
              component="div"
              sx={{ ...mono, color: e.mismatch ? "error.main" : e.source === "random" ? "warning.main" : undefined }}
            >
              #{e.index} {e.count === 1 ? e.values[0]?.toFixed(3) : `[${e.values.map((v) => v.toFixed(3)).join(", ")}]`}{" "}
              · {e.source === "script" ? `from ${e.declaredBy}` : "random"} · during {e.activeStep}
            </Typography>
          ))}
        </Box>

        <Divider sx={{ my: 1 }} />
        <Box sx={{ px: 1.5 }}>
          <Typography variant="overline" sx={{ opacity: 0.7 }}>
            Bot decisions
          </Typography>
          {decisions.length === 0 && (
            <Typography variant="caption" component="div">
              none yet
            </Typography>
          )}
          {decisions.map((d, i) => (
            <Typography key={i} component="div" sx={{ ...mono, color: d.mismatch ? "error.main" : undefined }}>
              {d.playerId} · {d.activeStep} · {d.chosen}
              {d.forced ? ` · forced: ${d.forced} (${d.declaredBy})` : ""}
            </Typography>
          ))}
        </Box>

        {warnings.length > 0 && (
          <>
            <Divider sx={{ my: 1 }} />
            <Box sx={{ px: 1.5, pb: 2 }}>
              <Typography variant="overline" color="error">
                Warnings
              </Typography>
              {warnings.map((w, i) => (
                <Typography key={i} component="div" sx={{ ...mono, color: "error.main" }}>
                  {w}
                </Typography>
              ))}
            </Box>
          </>
        )}
      </Box>
    </Stack>
  );
}

const DUMMY_NUM = new EventChannel<number>(-1);
const DUMMY_HOLD = new EventChannel<number | undefined>(undefined);
const DUMMY_STR = new EventChannel<TutorialStatus>("idle");
