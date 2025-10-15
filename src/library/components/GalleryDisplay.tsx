import React, { useEffect, useState, useRef } from "react";
import { Box } from "@mui/material";
import { useEventChannelState } from "../hooks/useEventChannelState";
import { useModalState } from "../hooks/useModalState";
import { GalleryItem, GalleryViewer } from "./GalleryViewer";
import useSize from "@react-hook/size";
import { useAnimationSpeedMultiplier } from "../hooks/useTimeController";
import { useGameTheme } from "../hooks/useGameTheme";
import { GameModalBackdrop } from "./GameModalBackdrop";

const DELAY = 300;

export function GalleryDisplay() {
  const theme = useGameTheme();
  const animationSpeedMultiplier = useAnimationSpeedMultiplier();
  const ref = useRef(null);
  const [width, height] = useSize(ref);
  const modalState = useModalState();
  const [items, setItems] = useState<GalleryItem[] | undefined>(undefined);
  const [source, setSource] = useEventChannelState(modalState.gallerySource);
  const hasItems = items && items?.length > 0;

  useEffect(() => {
    if (source) {
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
  }, [source, setItems]);

  return (
    // This has to be outside of the modal backdrop so we can get the size correctly
    <Box ref={ref} sx={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      <GameModalBackdrop visible={!!hasItems}>
        <GalleryViewer
          onClose={() => {
            setSource(undefined);
          }}
          items={items ?? []}
          tweenDuration={DELAY * animationSpeedMultiplier * 0.8}
          galleryItemWidth={theme.galleryItemWidth}
          galleryItemHeight={theme.galleryItemHeight}
          itemSpacing={theme.galleryItemSpacing}
          w={width}
          h={height}
        />
      </GameModalBackdrop>
    </Box>
  );
}
