import React, { useEffect, useState } from "react";
import { Box } from "@mui/material";
import { GalleryItem, GalleryViewer } from "./GalleryViewer";
import { useRef } from "react";
import { ZINDEX_CONTEXT_GALLERY_DISPLAY } from "../utilities/zIndex";
import { useGameTheme } from "../hooks/useGameTheme";
import { useClientPrompts } from "../hooks/useTimeController";
import { PickPrompt } from "../game/Prompt";
import { Chit } from "../game/Chit";
import { chitsToGalleryItems } from "../utilities/GalleryItemConversion";
import { useEventChannelState } from "../hooks/useEventChannelState";

export function ContextGalleryDisplay({ size }: { size: number }) {
  const theme = useGameTheme();
  const ref = useRef(null);
  const clientPrompts = useClientPrompts();
  const [currentPrompt] = useEventChannelState(clientPrompts.currentPrompt);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const hasItems = items && items?.length > 0;

  let targetChit: Chit | undefined = undefined;
  if (currentPrompt && currentPrompt instanceof PickPrompt) {
    const pickWithContext = currentPrompt.picks.find((p) => p.contextChit);
    if (pickWithContext) {
      targetChit = pickWithContext.contextChit;
    }
  }

  useEffect(() => {
    if (targetChit) {
      setItems(chitsToGalleryItems([targetChit]));
    } else {
      setItems([]);
    }
  }, [targetChit, setItems]);

  return (
    <Box sx={{ position: "relative" }}>
      <Box
        ref={ref}
        sx={{
          width: size,
          height: size,
          top: theme.spacing,
          position: hasItems ? "relative" : "absolute",
          ml: `${theme.spacing}px`,
          right: hasItems ? 0 : `${-size - theme.spacing}px`,
          zIndex: ZINDEX_CONTEXT_GALLERY_DISPLAY,
          borderRadius: "10px",
          background: theme.actionBarContextColor,
          boxShadow: `inset 0px 2px 3px 3px ${theme.actionBarContextShadow}`,
          transition: `right ease-in-out ${theme.actionBarContextAnimationDuration}`,
        }}
      >
        <GalleryViewer
          items={items ?? []}
          tweenDuration={0}
          galleryItemWidth={size - theme.spacing * 2}
          galleryItemHeight={size - theme.spacing * 2}
          itemSpacing={0}
          w={size}
          h={size}
        />
      </Box>
    </Box>
  );
}
