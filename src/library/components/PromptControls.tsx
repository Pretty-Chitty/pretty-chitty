import React, { useEffect, useState } from "react";
import { ChevronRight, ChevronLeft, Replay } from "@mui/icons-material";
import { Box, Stack } from "@mui/material";
import BottomBarButton from "./BottomBarButton";
import { useGameTheme } from "../hooks/useGameTheme";
import BottomBarBreak from "./BottomBarBreak";
import { useEventChannelState } from "../hooks/useEventChannelState";
import { useAnimationSpeedMultiplier, useClientPrompts, useTimeState } from "../hooks/useTimeController";
import { usePlayerId } from "../hooks/usePlayer";
import { ZINDEX_PROMPT_CONTROLS } from "../utilities/zIndex";
import { GameButton, ToggleGalleryButton } from "../game/GameButton";
import { useModalState } from "../hooks/useModalState";
import { ContextGalleryDisplay } from "./ContextGalleryDisplay";
import { NoValidMovesPrompt } from "../game/Prompt";
import { useButtonGalleriesOptions } from "../hooks/useButtonGalleriesOptions";

function SimpleToggle({ checked }: { checked: boolean }) {
  const gameTheme = useGameTheme();
  const trackWidth = 28;
  const trackHeight = 10;
  const thumbSize = 6;

  return (
    <Box
      sx={{
        width: trackWidth,
        height: trackHeight,
        borderRadius: trackHeight / 2,
        backgroundColor: checked ? gameTheme.actionBarToggleSelectedColor : "rgba(0,0,0,.25)",
        position: "relative",
        transition: "background-color 0.2s ease",
      }}
    >
      <Box
        sx={{
          width: thumbSize,
          height: thumbSize,
          borderRadius: "50%",
          backgroundColor: gameTheme.barTextColor,
          boxShadow: "0 2px 4px 0 rgb(0 35 11 / 20%)",
          position: "absolute",
          top: (trackHeight - thumbSize) / 2,
          left: checked ? trackWidth - thumbSize - 2 : 2,
          transition: "left 0.2s ease",
        }}
      />
    </Box>
  );
}

function GameButtonWrapper({ button }: { button: GameButton }) {
  const modalState = useModalState();
  const [source, setSource] = useEventChannelState(modalState.gallerySource);
  const [inlineSource, setInlineSource] = useEventChannelState(modalState.inlineGallerySource);
  const [galleryDisplayMode] = useButtonGalleriesOptions();

  if (button instanceof ToggleGalleryButton) {
    let highlight = false;
    let cb = button.cb;

    if (
      (button.galleryItemSource === inlineSource && inlineSource) ||
      (inlineSource?.backingObject && button.galleryItemSource?.backingObject === inlineSource.backingObject)
    ) {
      highlight = true;
      cb = () => setInlineSource(undefined);
    } else if (
      (button.galleryItemSource === source && source) ||
      (source?.backingObject && button.galleryItemSource?.backingObject === source.backingObject)
    ) {
      highlight = true;
      cb = () => setSource(undefined);
    } else if (button.galleryItemSource) {
      const source = button.galleryItemSource;
      cb = () => (galleryDisplayMode === "inline" ? setInlineSource(source) : setSource(source));
    }

    return (
      <Box sx={{ position: "relative" }}>
        <BottomBarButton icon={button.icon} label={button.label} onClick={cb} />

        <Stack direction={"row"} sx={{ fontSize: 5, zIndex: -1, position: "absolute", bottom: 4, left: 0, right: 0 }}>
          <Box flex={1} />
          <SimpleToggle checked={highlight} />
          <Box flex={1} />
        </Stack>
      </Box>
    );
  }

  return <BottomBarButton icon={button.icon} label={button.label} onClick={button.cb} />;
}

export default function PromptControls({ collapsible }: { collapsible?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const timeState = useTimeState();
  const playerId = usePlayerId();
  const speed = useAnimationSpeedMultiplier();
  const clientPrompt = useClientPrompts();
  const [prompt] = useEventChannelState(clientPrompt.currentPrompt);
  const [promptSpec] = useEventChannelState(clientPrompt.getPromptEventChannelForPlayer(playerId));
  const [expandedBecauseOfPrompt, setExpandedBecauseOfPrompt] = useState(!!prompt);
  const [live] = useEventChannelState(timeState.live);
  const theme = useGameTheme();

  useEffect(() => {
    setExpanded(true);
    if (!live) {
      setExpandedBecauseOfPrompt(false);
    } else if (prompt) {
      if (prompt instanceof NoValidMovesPrompt) {
        setShowHelp(true);
      }

      setExpandedBecauseOfPrompt(true);
    } else {
      const to = setTimeout(() => setExpandedBecauseOfPrompt(false), promptSpec ? 4000 : 400);
      return () => clearTimeout(to);
    }
  }, [prompt, live, promptSpec]);

  if (!prompt && showHelp) {
    setShowHelp(false);
  }

  return (
    <Stack
      direction="row"
      sx={{
        position: collapsible ? "absolute" : "static",
        overflow: "hidden",
        zIndex: ZINDEX_PROMPT_CONTROLS,
        background: theme.actionBarColor,
        maxWidth: collapsible ? "calc(100% - 30px)" : undefined,
        width: collapsible ? "97%" : "100%",
        minWidth: "100px",
        height: theme.bottomBarHeight,
        transform: collapsible
          ? expandedBecauseOfPrompt
            ? `translateX(${expanded ? "0px" : "calc(100% - 55px)"})`
            : "translateX(100%)"
          : "",
        opacity: !collapsible ? (expandedBecauseOfPrompt ? 1 : 0.4) : 1,
        transition: `transform ease-in-out ${theme.actionBarAnimationDuration * speed}s, opacity linear ${theme.actionBarAnimationDuration * speed}s`,
        pr: 1,
        pl: collapsible ? 0 : 1,
        right: 0,
        boxShadow: "-2px -2px 10px 0px rgba(0,0,0,0.2)",
      }}
    >
      {collapsible && (
        <>
          <BottomBarButton
            removeLabel
            icon={expanded ? ChevronRight : ChevronLeft}
            onClick={() => setExpanded(!expanded)}
          />
          <BottomBarBreak />
        </>
      )}

      {/* {prompt && <BottomBarButton icon={QuestionMark} label="Help" onClick={() => setShowHelp(true)} />} */}
      {/* {prompt && (
        <GameDialog onClose={() => setShowHelp(false)} open={showHelp}>
          <Markdown>{prompt.formatHelpText()}</Markdown>
        </GameDialog>
      )} */}

      {prompt?.canReset && (
        <BottomBarButton
          icon={Replay}
          label="Undo"
          onClick={() => prompt.stepBack()}
          onLongClick={() => prompt.stepBack(true)}
        />
      )}
      <Box flex={1} />
      {prompt?.buttons.map((button, idx) => (
        <GameButtonWrapper key={idx} button={button} />
      ))}
      <ContextGalleryDisplay size={theme.bottomBarHeight - theme.spacing * 2} />
    </Stack>
  );
}
