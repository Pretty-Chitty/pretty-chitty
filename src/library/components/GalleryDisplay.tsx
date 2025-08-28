import React, { useEffect, useState } from "react";
import { Box } from "@mui/material";
import { useEventChannelState } from "../hooks/useEventChannelState";
import { useGalleryState } from "../hooks/useGalleryState";
import { GalleryItem, GalleryViewer } from "./GalleryViewer";
import { useRef } from "react";
import useSize from "@react-hook/size";
import { ZINDEX_GALLERY_INVISIBLE, ZINDEX_GALLERY_VISIBLE } from "../utilities/zIndex";
import { useGame } from "../hooks/useGame";
import { useAnimationSpeedMultiplier } from "../hooks/useTimeController";
import { useGameTheme } from "../hooks/useGameTheme";

const DELAY = 300;

export function GalleryDisplay() {
  const game = useGame();
  const theme = useGameTheme();
  const animationSpeedMultiplier = useAnimationSpeedMultiplier();
  const ref = useRef(null);
  const [hasItemsDelayed, setHasItemsDelayed] = useState(false);
  const [width, height] = useSize(ref);
  const galleryState = useGalleryState();
  const [items, setItems] = useState<GalleryItem[] | undefined>(undefined);
  const [source, setSource] = useEventChannelState(galleryState.source);
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

  useEffect(() => {
    if (hasItems) {
      setHasItemsDelayed(true);
    } else {
      const to = setTimeout(() => setHasItemsDelayed(false), DELAY * animationSpeedMultiplier);
      return () => clearTimeout(to);
    }
  }, [hasItems, animationSpeedMultiplier]);

  return (
    <Box
      ref={ref}
      sx={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: hasItemsDelayed ? ZINDEX_GALLERY_VISIBLE : ZINDEX_GALLERY_INVISIBLE,
        background: hasItems ? theme.dialogBackgroundColor : "rgba(0,0,0,0)",
        transition: `background linear ${(DELAY / 1000) * animationSpeedMultiplier}s`,
      }}
    >
      {hasItemsDelayed && (
        <Box sx={{ width, height }}>
          <GalleryViewer
            onClose={() => {
              setSource(undefined);
            }}
            items={items ?? []}
            tweenDuration={DELAY * animationSpeedMultiplier * 0.8}
            galleryItemWidth={game.galleryItemWidth}
            itemSpacing={game.galleryItemSpacing}
            w={width}
            h={height}
          />
        </Box>
      )}
    </Box>
  );
}
