import React, { useEffect, useState } from "react";
import { ChevronRight, ChevronLeft, Replay, QuestionMark } from "@mui/icons-material";
import { Box, Stack } from "@mui/material";
import BottomBarButton from "./BottomBarButton";
import { useGameTheme } from "../hooks/useGameTheme";
import BottomBarBreak from "./BottomBarBreak";
import { useEventChannelState } from "../hooks/useEventChannelState";
import { useAnimationSpeedMultiplier, useClientPrompts, useTimeState } from "../hooks/useTimeController";
import { usePlayerId } from "../hooks/usePlayer";
import GameDialog from "./GameDialog";
import Markdown from "react-markdown";
import { ZINDEX_PROMPT_CONTROLS } from "../utilities/zIndex";
import { GameButton, ToggleGalleryButton } from "../game/GameButton";
import { useModalState } from "../hooks/useModalState";
import { ContextGalleryDisplay } from "./ContextGalleryDisplay";
import { NoValidMovesPrompt } from "../game/Prompt";

function GameButtonWrapper({ button }: { button: GameButton }) {
  const modalState = useModalState();
  const [source, setSource] = useEventChannelState(modalState.gallerySource);

  let highlight = false;
  let cb = button.cb;

  if (button instanceof ToggleGalleryButton) {
    if (
      (button.$internal_galleryItemSource === source && source) ||
      (source?.backingObject && button.$internal_galleryItemSource?.backingObject === source.backingObject)
    ) {
      highlight = true;
      cb = () => setSource(undefined);
    } else if (button.$internal_galleryItemSource) {
      const source = button.$internal_galleryItemSource;
      cb = () => setSource(source);
    }
  }

  return <BottomBarButton highlight={highlight} icon={button.icon} label={button.label} onClick={cb} />;
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
