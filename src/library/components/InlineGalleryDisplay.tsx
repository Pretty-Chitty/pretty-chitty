import React, { useEffect, useState, useRef } from "react";
import { Box, IconButton } from "@mui/material";
import { useEventChannelState } from "../hooks/useEventChannelState";
import { useModalState } from "../hooks/useModalState";
import { GalleryItem, GalleryViewer } from "./GalleryViewer";
import useSize from "@react-hook/size";
import { useAnimationSpeedMultiplier } from "../hooks/useTimeController";
import { useGameTheme } from "../hooks/useGameTheme";
import { KeyboardDoubleArrowUp } from "@mui/icons-material";
import useLocalStorageState from "use-local-storage-state";

const DELAY = 300;

export function InlineGalleryDisplay() {
  const theme = useGameTheme();
  const animationSpeedMultiplier = useAnimationSpeedMultiplier();
  const ref = useRef(null);
  const [width, height] = useSize(ref);
  const modalState = useModalState();
  const [items, setItems] = useState<GalleryItem[] | undefined>(undefined);
  const [source, setSource] = useEventChannelState(modalState.gallerySource);
  const inlineGallerySize = source?.inlineGallerySize;
  const [galleryFullScreen, setGalleryFullScreen] = useLocalStorageState<boolean>("galleryFullScreen", {
    defaultValue: false,
  });

  const [displaySize, setDisplaySize] = useState(0);

  useEffect(() => {
    if (!inlineGallerySize) {
      setItems(undefined);
    } else if (source) {
      setItems(source.items);
      const unSub = source.registerUpdateHandler(() => {
        setItems(source.items);
      });
      return () => {
        source.close();
        unSub();
      };
    } else {
      setItems(undefined);
    }
  }, [source, setItems, inlineGallerySize]);

  useEffect(() => {
    if (galleryFullScreen) {
      setDisplaySize(0);
    } else if (inlineGallerySize && items && items.length > 0) {
      setDisplaySize(inlineGallerySize);
    } else {
      const to = setTimeout(() => {
        setDisplaySize(0);
      }, 250);
      return () => clearTimeout(to);
    }
  }, [displaySize, galleryFullScreen, inlineGallerySize, items, setDisplaySize]);

  const hasItems = items && items?.length > 0;

  return (
    <Box
      sx={{
        position: "relative",
        background: theme.inlineGalleryBackgroundColor,
        height: `${displaySize}px`,
      }}
      ref={ref}
    >
      {hasItems && inlineGallerySize && !galleryFullScreen && (
        <>
          <IconButton
            sx={{
              backgroundColor: theme.inlineGalleryButtonBackgroundColor,
              position: "absolute",
              top: 4,
              right: 4,
              zIndex: 2,
            }}
            size="small"
            onClick={() => {
              setGalleryFullScreen(true);
            }}
          >
            <KeyboardDoubleArrowUp sx={{ color: theme.inlineGalleryButtonForegroundColor }} />
          </IconButton>

          <GalleryViewer
            zFactor={0}
            onClose={() => {
              setSource(undefined);
            }}
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
      )}
    </Box>
  );
}
