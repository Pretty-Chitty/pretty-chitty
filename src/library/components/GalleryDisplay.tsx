import React, { useEffect, useState } from "react";
import { Box } from "@mui/material";
import { useEventChannelState } from "../hooks/useEventChannelState";
import { useGalleryState } from "../hooks/useGalleryState";
import { GalleryViewer } from "./GalleryViewer";
import { useRef } from "react";
import useSize from "@react-hook/size";
import { ZINDEX_GALLERY_INVISIBLE, ZINDEX_GALLERY_VISIBLE } from "../utilities/zIndex";

const DELAY = 300;

export function GalleryDisplay() {
  const ref = useRef(null);
  const [hasItemsDelayed, setHasItemsDelayed] = useState(false);
  const [width, height] = useSize(ref);
  const galleryState = useGalleryState();
  const [items] = useEventChannelState(galleryState.items);
  const hasItems = items && items?.length > 0;

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
              galleryState.items.value = undefined;
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
