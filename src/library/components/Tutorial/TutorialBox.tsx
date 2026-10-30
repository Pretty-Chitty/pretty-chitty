import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import {
  ArrowBack,
  ArrowForward,
  Close,
  DragIndicator,
  Pause,
  PlayArrow,
  SkipNext,
  VolumeOff,
  VolumeUp,
} from "@mui/icons-material";
import { TutorialTheme } from "../../game/tutorial/TutorialTheme";
import { TutorialController, TutorialStatus } from "../../game/tutorial/TutorialController";
import { useEventChannelState } from "../../hooks/useEventChannelState";
import { TokenizedMarkdown } from "../TokenizedMarkdown";
import { TokenMap } from "../../utilities/TokenizedText";

export type BoxPosition = { x: number; y: number };

export function TutorialBox({
  controller,
  theme,
  tokenMap,
  position,
  width,
  narrow = false,
  onDrag,
  onMeasure,
  started,
  onStart,
  hasNarration,
  resolveImage,
}: {
  controller: TutorialController<any, any>;
  theme: TutorialTheme;
  tokenMap: TokenMap;
  position: BoxPosition;
  width: number;
  /** Narrow screen: tighter padding and type so the box covers less */
  narrow?: boolean;
  onDrag: (pos: BoxPosition) => void;
  onMeasure: (size: { width: number; height: number }) => void;
  started: boolean;
  onStart: () => void;
  hasNarration: boolean;
  resolveImage?: (src: string) => string;
}) {
  const [index] = useEventChannelState(controller.index);
  const [status] = useEventChannelState(controller.status);
  const [hint] = useEventChannelState(controller.hint);
  const [sentence] = useEventChannelState(controller.sentence);
  const [narrating] = useEventChannelState(controller.narrating);
  const [paused] = useEventChannelState(controller.paused);
  const [rate] = useEventChannelState(controller.rate);
  const [rewinding] = useEventChannelState(controller.rewinding);
  const [muted] = useEventChannelState(controller.muted);
  const [check] = useEventChannelState(controller.check);
  const [reviewing] = useEventChannelState(controller.reviewing);
  const [frontier] = useEventChannelState(controller.frontier);
  const [blockedCount] = useEventChannelState(controller.blocked);
  const [blockedFlash, setBlockedFlash] = useState(false);
  useEffect(() => {
    if (blockedCount === 0) return;
    setBlockedFlash(true);
    const to = setTimeout(() => setBlockedFlash(false), 1800);
    return () => clearTimeout(to);
  }, [blockedCount]);
  const ref = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [confirmSkip, setConfirmSkip] = useState(false);

  const step = controller.step;
  const total = controller.steps.length;
  const fontSize = (narrow ? 13.5 : 15) * theme.fontScalar;
  // On a phone the text gets about four lines, and follows the voice (below)
  const bodyMaxHeight = narrow ? Math.round(fontSize * 1.35 * 4.2) : undefined;

  // Keep the sentence being read in view, like a teleprompter: a long text scrolls under it. A step
  // starts at the top; once the narration ends the whole text can be scrolled freely.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    if (sentence < 0) return;
    const el = body.querySelector(`[data-sentence="${sentence}"]`) as HTMLElement | null;
    if (!el) return;
    const top = el.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
    // a sliver of the line before, so the reader keeps their place
    body.scrollTo({ top: Math.max(0, top - fontSize * 0.5), behavior: "smooth" });
  }, [sentence, fontSize]);
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [index]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => onMeasure({ width: el.offsetWidth, height: el.offsetHeight });
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onMeasure, index, hint, started]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragRef.current = { startX: e.clientX, startY: e.clientY, originX: position.x, originY: position.y };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      setDragging(true);
      e.stopPropagation();
      e.preventDefault();
    },
    [position.x, position.y],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      onDrag({ x: d.originX + (e.clientX - d.startX), y: d.originY + (e.clientY - d.startY) });
      e.stopPropagation();
    },
    [onDrag],
  );
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    setDragging(false);
    e.stopPropagation();
  }, []);

  useEffect(() => {
    setConfirmSkip(false);
  }, [index]);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const waiting = status === "waiting" && !reviewing;
  const satisfied = status === "satisfied" && !reviewing;
  const done = status === "done";
  const canAdvance = controller.canAdvance;
  // Does this step want something from the player, or is it waiting on the bots/the world?
  const allow = step?.allow;
  const playerActs = !!step?.waitFor && !!allow && (!Array.isArray(allow) || allow.length > 0);
  const statusLabel = rewinding
    ? "Going back…"
    : reviewing
      ? "Reviewing"
      : paused && !(waiting && playerActs)
        ? "Paused"
        : statusText(status, check, playerActs);

  return (
    <Box
      ref={ref}
      onPointerDown={stop}
      onPointerUp={stop}
      onClick={stop}
      onTouchStart={stop}
      onMouseDown={stop}
      sx={{
        position: "absolute",
        left: position.x,
        top: position.y,
        width,
        maxWidth: "calc(100% - 16px)",
        maxHeight: narrow ? "45%" : "60%",
        display: "flex",
        flexDirection: "column",
        pointerEvents: "auto",
        background: theme.boxBackground,
        color: theme.boxTextColor,
        borderRadius: `${theme.borderRadius}px`,
        boxShadow: theme.boxShadow,
        fontFamily: theme.fontFamily,
        transition: dragging
          ? "none"
          : "left 0.35s cubic-bezier(.2,.8,.2,1), top 0.35s cubic-bezier(.2,.8,.2,1), bottom 0.35s cubic-bezier(.2,.8,.2,1)",
        overflow: "hidden",
        userSelect: "none",
        touchAction: "none",
        border: `1px solid ${blockedFlash ? theme.accent : theme.highlightGlow}`,
        animation: blockedFlash ? "tutorialShake 0.4s ease-in-out" : undefined,
        "@keyframes tutorialShake": {
          "0%, 100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-6px)" },
          "75%": { transform: "translateX(6px)" },
        },
      }}
    >
      {/* Title row / drag handle */}
      <Stack
        direction="row"
        alignItems="center"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        sx={{ px: 1.5, pt: narrow ? 0.5 : 1, pb: 0.5, cursor: dragging ? "grabbing" : "grab" }}
      >
        <DragIndicator sx={{ opacity: 0.4, fontSize: 18, mr: 0.5 }} />
        <Typography sx={{ fontSize: 12 * theme.fontScalar, opacity: 0.7, flex: 1, fontFamily: "inherit" }}>
          {done ? controller.spec.title : `${controller.spec.title} · ${index + 1} / ${total}`}
        </Typography>
        {!done && (
          <Tooltip title={confirmSkip ? "Tap again to leave the tutorial" : "Skip tutorial"}>
            <IconButton
              size="small"
              onClick={() => (confirmSkip ? controller.skip() : setConfirmSkip(true))}
              sx={{ color: confirmSkip ? theme.accent : theme.boxTextColor, opacity: confirmSkip ? 1 : 0.6, p: 0.25 }}
            >
              <Close fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      {/* Progress */}
      {!done && (
        <Box sx={{ height: 3, mx: 1.5, borderRadius: 2, background: "rgba(255,255,255,0.12)" }}>
          <Box
            sx={{
              height: "100%",
              borderRadius: 2,
              background: theme.accent,
              width: `${((index + 1) / total) * 100}%`,
              transition: "width 0.3s ease-out",
            }}
          />
        </Box>
      )}

      {/* Body */}
      <Box
        ref={bodyRef}
        sx={{ px: 1.5, pt: narrow ? 0.75 : 1.25, pb: narrow ? 0.5 : 1, overflowY: "auto", flex: 1, minHeight: 0, maxHeight: bodyMaxHeight }}
      >
        {!started ? (
          <TokenizedMarkdown
            text={controller.spec.intro ?? controller.spec.steps[0]?.text ?? ""}
            fontSize={fontSize}
            tokenMap={tokenMap}
            color={theme.boxTextColor}
            resolveImage={resolveImage}
          />
        ) : step ? (
          <TokenizedMarkdown
            text={step.text}
            fontSize={fontSize}
            tokenMap={tokenMap}
            color={theme.boxTextColor}
            activeSentence={sentence}
            accent={theme.accent}
            resolveImage={resolveImage}
          />
        ) : null}
        {blockedFlash && (
          <Box
            sx={{
              mt: 1,
              px: 1,
              py: 0.75,
              borderRadius: 1.5,
              fontSize: 13 * theme.fontScalar,
              background: "rgba(255,255,255,0.08)",
              borderLeft: `3px solid ${theme.accent}`,
            }}
          >
            {waiting
              ? (typeof step?.hint === "object" ? step.hint.text : step?.hint) ?? "Not that: follow the instructions above."
              : "Not yet: the tutorial will tell you when it's your move."}
          </Box>
        )}
        {hint && waiting && !blockedFlash && (
          <Box
            sx={{
              mt: 1,
              px: 1,
              py: 0.75,
              borderRadius: 1.5,
              fontSize: 13 * theme.fontScalar,
              background: "rgba(255,255,255,0.08)",
              borderLeft: `3px solid ${theme.accent}`,
            }}
          >
            {hint}
          </Box>
        )}
      </Box>

      {/* Footer */}
      <Stack direction="row" alignItems="center" sx={{ px: 1, pb: 0.75, pt: 0.25 }}>
        {!started ? (
          <>
            <Box flex={1} />
            <PrimaryButton theme={theme} onClick={onStart} label="Start" icon={<PlayArrow fontSize="small" />} />
          </>
        ) : (
          <>
            <Tooltip title={controller.rewinds ? "Previous step (←, puts the game back as it was)" : "Previous step (←)"}>
              <span>
                <IconButton
                  size="small"
                  disabled={index <= 0}
                  onClick={() => controller.back()}
                  sx={{ color: theme.boxTextColor, opacity: index <= 0 ? 0.3 : 0.8 }}
                >
                  <ArrowBack fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={narrating && !paused ? "Pause (Space)" : "Play (Space)"}>
              <IconButton
                size="small"
                onClick={() => controller.toggleNarration()}
                sx={{
                  color: paused ? theme.accent : theme.boxTextColor,
                  opacity: paused ? 1 : 0.8,
                }}
              >
                {narrating && !paused ? <Pause fontSize="small" /> : <PlayArrow fontSize="small" />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Narration speed">
              <Box
                component="button"
                onClick={() => controller.setRate(nextRate(rate))}
                sx={{
                  border: "none",
                  background: rate === 1 ? "transparent" : "rgba(255,255,255,0.12)",
                  color: rate === 1 ? theme.boxTextColor : theme.accent,
                  opacity: rate === 1 ? 0.8 : 1,
                  fontFamily: "inherit",
                  fontWeight: 700,
                  fontSize: 12 * theme.fontScalar,
                  minWidth: 38,
                  height: 26,
                  px: 0.75,
                  borderRadius: 999,
                  cursor: "pointer",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatRate(rate)}
              </Box>
            </Tooltip>
            {hasNarration && (
              <>
                <Tooltip title={muted ? "Unmute" : "Mute"}>
                  <IconButton
                    size="small"
                    onClick={() => controller.setMuted(!muted)}
                    sx={{ color: theme.boxTextColor, opacity: 0.8 }}
                  >
                    {muted ? <VolumeOff fontSize="small" /> : <VolumeUp fontSize="small" />}
                  </IconButton>
                </Tooltip>
              </>
            )}
            {reviewing && (
              <Tooltip title={`Back to step ${frontier + 1}`}>
                <IconButton size="small" onClick={() => controller.resume()} sx={{ color: theme.accent, opacity: 0.9 }}>
                  <SkipNext fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Box flex={1} />
            {statusLabel && (
              <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mr: 1 }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: theme.accent,
                    animation: waiting && !paused ? "tutorialPulse 1.2s ease-in-out infinite" : undefined,
                    opacity: reviewing ? 0.5 : 1,
                    "@keyframes tutorialPulse": {
                      "0%": { transform: "scale(0.8)", opacity: 0.5 },
                      "50%": { transform: "scale(1.3)", opacity: 1 },
                      "100%": { transform: "scale(0.8)", opacity: 0.5 },
                    },
                  }}
                />
                <Typography sx={{ fontSize: 12 * theme.fontScalar, opacity: 0.8, fontFamily: "inherit" }}>
                  {statusLabel}
                </Typography>
              </Stack>
            )}
            {/* Paused: Resume is the way on (Next stays as a small arrow to step through silently).
                Otherwise Next shows only when there is something to move on to: while the step waits
                for the player's move the status says "Your move" and Next appears once it is done */}
            {paused && !rewinding ? (
              <>
                {canAdvance && (
                  <Tooltip title={controller.isLast ? "Finish (→)" : "Next step (→, stays paused)"}>
                    <IconButton
                      size="small"
                      onClick={() => controller.next()}
                      sx={{ color: theme.boxTextColor, opacity: 0.8, mr: 0.5 }}
                    >
                      <ArrowForward fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                <PrimaryButton
                  theme={theme}
                  onClick={() => controller.play()}
                  label="Resume"
                  icon={<PlayArrow fontSize="small" />}
                />
              </>
            ) : (
              (canAdvance || satisfied) && (
                <PrimaryButton
                  theme={theme}
                  onClick={() => controller.next()}
                  label={controller.isLast ? "Finish" : "Next"}
                  icon={<ArrowForward fontSize="small" />}
                />
              )
            )}
          </>
        )}
      </Stack>
    </Box>
  );
}

const RATES = [1, 1.25, 1.5, 2];

function nextRate(rate: number) {
  const i = RATES.findIndex((r) => Math.abs(r - rate) < 0.001);
  return RATES[(i + 1) % RATES.length];
}

function formatRate(rate: number) {
  return `${Number.isInteger(rate) ? rate : rate.toFixed(rate * 100 % 10 === 0 ? 1 : 2)}×`;
}

function statusText(status: TutorialStatus, check: boolean | string | undefined, playerActs: boolean) {
  if (status === "waiting") return check === true ? "Nice!" : playerActs ? "Your move" : "Watch the table";
  if (status === "satisfied") return "Nice!";
  return undefined;
}

function PrimaryButton({
  theme,
  onClick,
  label,
  icon,
  disabled,
}: {
  theme: TutorialTheme;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <Box
      component="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        border: "none",
        cursor: disabled ? "default" : "pointer",
        borderRadius: 999,
        px: 1.5,
        py: 0.5,
        fontFamily: "inherit",
        fontSize: 13 * theme.fontScalar,
        fontWeight: 700,
        letterSpacing: 0.3,
        color: disabled ? theme.boxTextColor : contrastText(theme.accent),
        background: disabled ? "rgba(255,255,255,0.12)" : theme.accent,
        opacity: disabled ? 0.6 : 1,
        transition: "background 0.2s, opacity 0.2s, transform 0.1s",
        "&:active": { transform: disabled ? "none" : "scale(0.97)" },
      }}
    >
      {label}
      {icon}
    </Box>
  );
}

function contrastText(background: string) {
  try {
    // tiny luminance check without pulling in color for every render
    const m = background.replace("#", "");
    const hex = m.length >= 6 ? m : m.replace(/(.)/g, "$1$1");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#111" : "#fff";
  } catch {
    return "#fff";
  }
}
