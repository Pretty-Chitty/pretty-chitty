import React, { useEffect, useState, useRef } from "react";
import { Box, IconButton } from "@mui/material";
import { useEventChannelState } from "../hooks/useEventChannelState";
import { useModalState } from "../hooks/useModalState";
import { GalleryItem, GalleryViewer } from "./GalleryViewer";
import useSize from "@react-hook/size";
import { useAnimationSpeedMultiplier, useOptionalClientPrompts } from "../hooks/useTimeController";
import { EventChannel } from "../utilities/EventChannel";
import { Prompt } from "../game/Prompt";
import { useGameTheme } from "../hooks/useGameTheme";
import { ScreenshotMonitor } from "@mui/icons-material";
import { useButtonGalleriesOptions } from "../hooks/useButtonGalleriesOptions";

const DELAY = 300;
const DEFAULT_INLINE_GALLERY_SIZE = 125;

export function InlineGalleryDisplay() {
  const theme = useGameTheme();
  const animationSpeedMultiplier = useAnimationSpeedMultiplier();
  const ref = useRef(null);
  const [width, height] = useSize(ref);
  const modalState = useModalState();
  const [items, setItems] = useState<GalleryItem[] | undefined>(undefined);
  const [_source, setSource] = useEventChannelState(modalState.gallerySource);
  const [inlineSource, setInlineSource] = useEventChannelState(modalState.inlineGallerySource);
  const inlineGallerySize = inlineSource ? (inlineSource.inlineGallerySize ?? DEFAULT_INLINE_GALLERY_SIZE) : 0;
  const [displaySize, setDisplaySize] = useState(0);
  const [_galleryDisplayMode, setGalleryDisplayMode] = useButtonGalleriesOptions();
  // A closed source that opted in to holdOnCloseMs leaves its items and height up for a while,
  // so a gallery that opens right after swaps in place instead of animating out and back.
  const lastSource = useRef<{ size: number; holdMs: number } | undefined>(undefined);
  const [heldSize, setHeldSize] = useState<number | undefined>(undefined);
  const shownSize = inlineGallerySize || heldSize || 0;
  const clientPrompts = useOptionalClientPrompts();
  const [noPrompts] = useState(() => new EventChannel<Prompt | undefined>(undefined));
  const [prompt] = useEventChannelState(clientPrompts?.currentPrompt ?? noPrompts);

  useEffect(() => {
    if (inlineSource) {
      lastSource.current = { size: inlineGallerySize, holdMs: inlineSource.inlineHoldOnCloseMs ?? 0 };
      setHeldSize(undefined);
      setItems(inlineSource.items);
      const unSub = inlineSource.registerUpdateHandler(() => {
        setItems(inlineSource.items);
      });
      return () => {
        inlineSource.close();
        unSub();
      };
    }
    const last = lastSource.current;
    lastSource.current = undefined;
    if (last && last.holdMs > 0) {
      setHeldSize(last.size);
      const to = setTimeout(() => {
        setHeldSize(undefined);
        setItems(undefined);
      }, last.holdMs);
      return () => clearTimeout(to);
    }
    setItems(undefined);
  }, [inlineSource, setItems, inlineGallerySize]);

  // The hold only bridges a wait for the next prompt: a prompt showing with no inline gallery
  // (or the gallery toggled shut on the same prompt) ends it at once.
  useEffect(() => {
    if (prompt && !inlineSource) {
      setHeldSize(undefined);
      setItems(undefined);
    }
  }, [prompt, inlineSource, setItems]);

  useEffect(() => {
    if (items && items.length > 0 && shownSize > 0) {
      setDisplaySize(shownSize);
    } else {
      const to = setTimeout(() => {
        setDisplaySize(0);
      }, 250);
      return () => clearTimeout(to);
    }
  }, [shownSize, items, setDisplaySize]);

  return (
    <Box
      sx={{
        position: "relative",
        background: theme.inlineGalleryBackgroundColor,
        height: `${displaySize}px`,
        overflow: "hidden",
      }}
      ref={ref}
    >
      {
        <>
          {inlineSource && (
          <IconButton
            data-tutorial-target="gallery:toFullscreen"
            sx={{
              backgroundColor: theme.inlineGalleryButtonBackgroundColor,
              position: "absolute",
              bottom: 4,
              right: 4,
              zIndex: 2,
            }}
            size="small"
            onClick={() => {
              setSource(inlineSource);
              setInlineSource(undefined);
              setGalleryDisplayMode("modal");
            }}
          >
            <ScreenshotMonitor sx={{ color: theme.inlineGalleryButtonForegroundColor }} />
          </IconButton>
          )}

          <GalleryViewer
            kind="inline"
            tutorialTarget="gallery:inline"
            zFactor={0}
            onClose={() => {}}
            onLongPress={() => {
              setSource(inlineSource);
              setInlineSource(undefined);
              setGalleryDisplayMode("modal");
            }}
            fov={5}
            items={items ?? []}
            tweenDuration={DELAY * animationSpeedMultiplier * 0.8}
            galleryItemWidth={theme.galleryItemWidth}
            galleryItemHeight={theme.galleryItemHeight}
            itemSpacing={theme.galleryItemSpacing}
            showSummary={"partial"}
            w={width}
            h={height}
          />
        </>
      }
    </Box>
  );
}
