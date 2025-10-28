import React, { useEffect, useRef, useState } from "react";
import { Box, Stack } from "@mui/material";
import { ZoomIn, ZoomInMap } from "@mui/icons-material";
import { useGameTheme } from "../../hooks/useGameTheme";
import { ZINDEX_PINCH_OUT } from "../../utilities/zIndex";

interface ViewerZoomControlsProps {
  onZoomOut: () => void;
  onZoomIn: () => void;
  onZoomChange: (delta: number, totalDelta: number) => void;
}

export function ViewerZoomControls({ onZoomOut, onZoomIn, onZoomChange }: ViewerZoomControlsProps) {
  const theme = useGameTheme();
  const sliderRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef<number>(0);
  const totalDeltaRef = useRef<number>(0);
  const hasDraggedRef = useRef<boolean>(false);

  const handleSliderStart = (clientY: number) => {
    setIsDragging(true);
    startYRef.current = clientY;
    hasDraggedRef.current = false;
  };

  const handleSliderMove = (clientY: number) => {
    if (!isDragging) return;

    const deltaY = startYRef.current - clientY; // positive = up = zoom in

    // If there's any movement, mark that we've dragged
    if (Math.abs(deltaY) > 2) {
      hasDraggedRef.current = true;
    }

    totalDeltaRef.current += deltaY;

    const sensitivity = 0.05; // Adjust this to control zoom sensitivity
    onZoomChange(deltaY * sensitivity, totalDeltaRef.current * sensitivity);

    startYRef.current = clientY;
  };

  const handleSliderEnd = () => {
    setIsDragging(false);
  };

  // Add global mouse/touch move and up listeners when dragging
  useEffect(() => {
    if (!isDragging) return;

    totalDeltaRef.current = 0;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      handleSliderMove(e.clientY);
    };

    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) {
        handleSliderMove(e.touches[0].clientY);
      }
    };

    const handleGlobalEnd = () => {
      handleSliderEnd();
    };

    window.addEventListener("mousemove", handleGlobalMouseMove);
    window.addEventListener("mouseup", handleGlobalEnd);
    window.addEventListener("touchmove", handleGlobalTouchMove);
    window.addEventListener("touchend", handleGlobalEnd);

    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalEnd);
      window.removeEventListener("touchmove", handleGlobalTouchMove);
      window.removeEventListener("touchend", handleGlobalEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging]);

  return (
    <Stack
      direction="column"
      sx={{
        position: "absolute",
        bottom: `${theme.spacing}px`,
        left: `${theme.spacing}px`,
        zIndex: ZINDEX_PINCH_OUT,
        opacity: 0.5,
      }}
    >
      {/* Zoom In Button */}
      <Box
        sx={{
          cursor: "pointer",
          backgroundColor: theme.barColor,
          color: theme.barTextColor,
          p: `${theme.spacing / 2}px`,
          borderTopRightRadius: `${theme.spacing}px`,
          borderTopLeftRadius: `${theme.spacing}px`,
          height: `${theme.spacing * 4}px`,
          width: `${theme.spacing * 4}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          userSelect: "none",
        }}
        onClick={() => {
          if (!hasDraggedRef.current) {
            onZoomIn();
          }
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          handleSliderStart(e.clientY);
        }}
        onTouchStart={(e) => {
          e.preventDefault();
          if (e.touches[0]) {
            handleSliderStart(e.touches[0].clientY);
          }
        }}
      >
        <ZoomIn sx={{ width: `${theme.spacing * 1.5}px` }} />
      </Box>

      {/* Zoom Slider */}
      <Box
        ref={sliderRef}
        sx={{
          cursor: "ns-resize",
          backgroundColor: theme.barColor,
          color: theme.barTextColor,
          width: `${theme.spacing * 4}px`,
          height: `${theme.spacing * 8}px`, // 4x taller than wide
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          userSelect: "none",
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          handleSliderStart(e.clientY);
        }}
        onTouchStart={(e) => {
          e.preventDefault();
          if (e.touches[0]) {
            handleSliderStart(e.touches[0].clientY);
          }
        }}
      >
        {/* Visual indicator lines */}
        <Box
          sx={{
            width: "60%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-around",
            py: `${theme.spacing}px`,
          }}
        >
          {[...Array(5)].map((_, i) => (
            <Box
              key={i}
              sx={{
                width: "100%",
                height: "2px",
                backgroundColor: theme.barTextColor,
                opacity: 0.2,
              }}
            />
          ))}
        </Box>
      </Box>

      {/* Zoom Out Button */}
      <Box
        sx={{
          cursor: "pointer",
          backgroundColor: theme.barColor,
          color: theme.barTextColor,
          p: `${theme.spacing / 2}px`,
          height: `${theme.spacing * 4}px`,
          width: `${theme.spacing * 4}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          userSelect: "none",
          borderBottomRightRadius: `${theme.spacing}px`,
          borderBottomLeftRadius: `${theme.spacing}px`,
        }}
        onClick={() => {
          if (!hasDraggedRef.current) {
            onZoomOut();
          }
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          handleSliderStart(e.clientY);
        }}
        onTouchStart={(e) => {
          e.preventDefault();
          if (e.touches[0]) {
            handleSliderStart(e.touches[0].clientY);
          }
        }}
      >
        <ZoomInMap sx={{ width: `${theme.spacing * 1.5}px` }} />
      </Box>
    </Stack>
  );
}
