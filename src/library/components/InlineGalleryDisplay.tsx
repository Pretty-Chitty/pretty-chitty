import React, { useEffect, useState, useRef } from "react";
import { Box, IconButton } from "@mui/material";
import { useEventChannelState } from "../hooks/useEventChannelState";
import { useModalState } from "../hooks/useModalState";
import { GalleryItem, GalleryViewer } from "./GalleryViewer";
import useSize from "@react-hook/size";
import { useAnimationSpeedMultiplier } from "../hooks/useTimeController";
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
  const inlineGallerySize = inlineSource?.inlineGallerySize ?? DEFAULT_INLINE_GALLERY_SIZE;
  const [displaySize, setDisplaySize] = useState(0);
  const [_galleryDisplayMode, setGalleryDisplayMode] = useButtonGalleriesOptions();

  useEffect(() => {
    if (inlineSource) {
      setItems(inlineSource.items);
      const unSub = inlineSource.registerUpdateHandler(() => {
        setItems(inlineSource.items);
      });
      return () => {
        inlineSource.close();
        unSub();
      };
    } else {
      setItems(undefined);
    }
  }, [inlineSource, setItems, inlineGallerySize]);

  useEffect(() => {
    if (items && items.length > 0) {
      setDisplaySize(inlineGallerySize);
    } else {
      const to = setTimeout(() => {
        setDisplaySize(0);
      }, 250);
      return () => clearTimeout(to);
    }
  }, [inlineGallerySize, items, setDisplaySize]);

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
          <IconButton
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

          <GalleryViewer
            zFactor={0}
            onClose={() => {}}
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
