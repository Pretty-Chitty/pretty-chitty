import React, { useEffect, useState } from "react";
import { Box } from "@mui/material";

import { IUpdatingCanvas } from "../utilities/IUpdatingCanvas";

export type Size = "actual" | "fill" | "small" | "large" | "tile" | "small_tile";

export default function UpdatingCanvasViewer({
  updatingCanvas,
  size,
}: {
  size: Size;
  updatingCanvas: IUpdatingCanvas;
}) {
  const [dataUrl, setDataUrl] = useState("");

  let backgroundSize = undefined;
  let repeat: string | undefined = "no-repeat";
  let pixelate = false;
  let scale: number | undefined = undefined;
  let translate: number | undefined = undefined;
  if (size === "fill") {
    backgroundSize = "contain";
  } else if (size === "small") {
    scale = 0.25;
  } else if (size === "large") {
    scale = 2;
    translate = 50;
    pixelate = true;
  } else if (size === "tile") {
    repeat = undefined;
  } else if (size === "small_tile") {
    repeat = undefined;
    backgroundSize = "50px";
  }

  useEffect(() => {
    setDataUrl(updatingCanvas.canvas.toDataURL("image/png", 1));
    return updatingCanvas.onUpdate(() => {
      setDataUrl(updatingCanvas.canvas.toDataURL("image/png", 1));
    });
  }, [updatingCanvas.canvas, updatingCanvas]);

  // TODO: listen for updates!
  return (
    <Box
      style={{
        top: 0,
        left: 0,
        position: "absolute",
        width: `${Math.min(100, 100 / (scale ?? 1))}%`,
        height: `${Math.min(100, 100 / (scale ?? 1))}%`,
        imageRendering: pixelate ? "pixelated" : undefined,
        backgroundImage: `url(${dataUrl})`,
        backgroundRepeat: repeat,
        backgroundSize: backgroundSize,
        backgroundPosition: "center",
        transform: scale ? `translate(${translate ?? 0}%,${translate ?? 0}%) scale(${scale})` : undefined,
      }}
    />
  );
}
