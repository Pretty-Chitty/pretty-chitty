import React, { useEffect, useState } from "react";
import { Box } from "@mui/material";
import { useEventChannelState } from "../hooks/useEventChannelState";
import { useGalleryState } from "../hooks/useGalleryState";
import { GalleryItem, GalleryViewer } from "./GalleryViewer";
import { useRef } from "react";
import useSize from "@react-hook/size";
import { ZINDEX_GALLERY_INVISIBLE, ZINDEX_GALLERY_VISIBLE } from "../utilities/zIndex";
import { usePlayerId } from "../hooks/usePlayer";
import { useClientPrompts } from "../hooks/useTimeController";

const DELAY = 300;

export function GalleryDisplay() {
  const ref = useRef(null);
  const [hasItemsDelayed, setHasItemsDelayed] = useState(false);
  const [width, height] = useSize(ref);
  const galleryState = useGalleryState();
  const [items, setItems] = useState<GalleryItem[] | undefined>(undefined);
  const [source, setSource] = useEventChannelState(galleryState.source);
  const hasItems = items && items?.length > 0;

  const playerId = usePlayerId();
  const clientPrompt = useClientPrompts();
  const [promptSpec] = useEventChannelState(clientPrompt.getPromptEventChannelForPlayer(playerId));

  // any time prompts change - if that prompt isn't changing the source of what we are looking at at all,
  // we should close it - but debounce it
  useEffect(() => {
    const currentSource = galleryState.source.value;
    const to = setTimeout(() => {
      if (currentSource === galleryState.source.value) {
        galleryState.source.value = undefined;
      }
    }, 500);
    return () => clearTimeout(to);

    // we don't want to re-run this on setSource changing...
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptSpec, galleryState]);

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
      const to = setTimeout(() => setHasItemsDelayed(false), DELAY);
      return () => clearTimeout(to);
    }
  }, [hasItems]);

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
        background: hasItems ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0)",
        transition: `background linear ${DELAY / 1000}s`,
      }}
    >
      {hasItemsDelayed && (
        <Box sx={{ width, height }}>
          <GalleryViewer
            onClose={() => {
              setSource(undefined);
            }}
            items={items ?? []}
            galleryItemWidth={150}
            itemSpacing={20}
            w={width}
            h={height}
          />
        </Box>
      )}
    </Box>
  );
}
