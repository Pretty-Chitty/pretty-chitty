import React, { useEffect, useState, useRef } from "react";
import { Box, IconButton } from "@mui/material";
import { useEventChannelState } from "../hooks/useEventChannelState";
import { useModalState } from "../hooks/useModalState";
import { GalleryItem, GalleryViewer } from "./GalleryViewer";
import useSize from "@react-hook/size";
import { useAnimationSpeedMultiplier } from "../hooks/useTimeController";
import { useGameTheme } from "../hooks/useGameTheme";
import { GameModalBackdrop } from "./GameModalBackdrop";
import useLocalStorageState from "use-local-storage-state";
import { CloseFullscreen, KeyboardDoubleArrowDown, OpenInFull } from "@mui/icons-material";

const DELAY = 300;

export function FullScreenGalleryDisplay() {
  const theme = useGameTheme();
  const animationSpeedMultiplier = useAnimationSpeedMultiplier();
  const ref = useRef(null);
  const [width, height] = useSize(ref);
  const modalState = useModalState();
  const [items, setItems] = useState<GalleryItem[] | undefined>(undefined);
  const [source, setSource] = useEventChannelState(modalState.gallerySource);
  const [galleryFullScreen, setGalleryFullScreen] = useLocalStorageState<boolean>("galleryFullScreen", {
    defaultValue: false,
  });
  const inlineGallerySize = source?.inlineGallerySize;

  const hasItems = !(inlineGallerySize && !galleryFullScreen) && items && items?.length > 0;

  useEffect(() => {
    if (inlineGallerySize && !galleryFullScreen) {
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
  }, [source, setItems, inlineGallerySize, galleryFullScreen]);

  return (
    // This has to be outside of the modal backdrop so we can get the size correctly
    <Box ref={ref} sx={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      <GameModalBackdrop visible={!!hasItems}>
        {inlineGallerySize && (
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
              setGalleryFullScreen(false);
            }}
          >
            <KeyboardDoubleArrowDown sx={{ color: theme.inlineGalleryButtonForegroundColor }} />
          </IconButton>
        )}
        <GalleryViewer
          onClose={() => {
            setSource(undefined);
          }}
          items={items ?? []}
          tweenDuration={DELAY * animationSpeedMultiplier * 0.8}
          galleryItemWidth={theme.galleryItemWidth}
          galleryItemHeight={theme.galleryItemHeight}
          itemSpacing={theme.galleryItemSpacing}
          showSummary="full"
          w={width}
          h={height}
        />
      </GameModalBackdrop>
    </Box>
  );
}
