import React, { useEffect, useState } from "react";
import { ChevronRight, ChevronLeft, Replay, QuestionMark } from "@mui/icons-material";
import { Box, Stack } from "@mui/material";
import BottomBarButton from "./BottomBarButton";
import { useGameTheme } from "../hooks/useGameTheme";
import BottomBarBreak from "./BottomBarBreak";
import { useEventChannelState } from "../hooks/useEventChannelState";
import { useClientPrompts, useTimeState } from "../hooks/useTimeController";
import { usePlayerId } from "../hooks/usePlayer";
import GameDialog from "./GameDialog";
import Markdown from "react-markdown";
import { ZINDEX_PROMPT_CONTROLS } from "../utilities/zIndex";
import { GameButton, ToggleGalleryButton } from "../game/GameButton";
import { useGalleryState } from "../hooks/useGalleryState";
import { ContextGalleryDisplay } from "./ContextGalleryDisplay";

function GameButtonWrapper({ button }: { button: GameButton }) {
  const galleryState = useGalleryState();
  const [source, setSource] = useEventChannelState(galleryState.source);

  let highlight = false;
  let cb = button.cb;

  if (button instanceof ToggleGalleryButton) {
    if (
      (button.galleryItemSource === source && source) ||
      (source?.backingObject && button.galleryItemSource?.backingObject === source.backingObject)
    ) {
      highlight = true;
      cb = () => setSource(undefined);
    } else if (button.galleryItemSource) {
      const source = button.galleryItemSource;
      cb = () => setSource(source);
    }
  }

  return <BottomBarButton highlight={highlight} icon={button.icon} label={button.label} onClick={cb} />;
}

export default function PromptControls() {
  const [expanded, setExpanded] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const timeState = useTimeState();
  const playerId = usePlayerId();
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
        position: "absolute",
        zIndex: ZINDEX_PROMPT_CONTROLS,
        background: theme.actionBarColor,
        maxWidth: "390px",
        width: "97%",
        minWidth: "100px",
        height: theme.bottomBarHeight,
        transform: expandedBecauseOfPrompt
          ? `translateX(${expanded ? "0px" : "calc(100% - 55px)"})`
          : "translateX(100%)",
        transition: `transform ease-in-out ${theme.actionBarAnimationDuration}`,
        pr: 1,
        right: 0,
        boxShadow: "-2px -2px 10px 0px rgba(0,0,0,0.2)",
      }}
    >
      <BottomBarButton
        removeLabel
        icon={expanded ? ChevronRight : ChevronLeft}
        onClick={() => setExpanded(!expanded)}
      />
      <BottomBarBreak />

      {prompt && <BottomBarButton icon={QuestionMark} label="Help" onClick={() => setShowHelp(true)} />}
      {prompt && (
        <GameDialog onClose={() => setShowHelp(false)} open={showHelp}>
          <Markdown>{prompt.formatHelpText()}</Markdown>
        </GameDialog>
      )}

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
