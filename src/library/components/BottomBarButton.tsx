import { Box, Stack, SvgIconTypeMap, Typography } from "@mui/material";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useGameTheme } from "../hooks/useGameTheme";
import { LongPressEventType, useLongPress } from "use-long-press";
import useHover from "@react-hook/hover";
import { OverridableComponent } from "@mui/material/OverridableComponent";
import { useInterval } from "react-interval-hook";
import { ZINDEX_BOTTOM_BAR_BUTTON_LABEL, ZINDEX_BOTTOM_BAR_BUTTON_LONG_CLICK } from "../utilities/zIndex";

// eslint-disable-next-line @typescript-eslint/ban-types
export type BottomBarButtonIcon = OverridableComponent<SvgIconTypeMap<{}, "svg">> & { muiName: string };

export default function BottomBarButton({
  icon,
  label,
  highlight = false,
  disabled = false,
  removeLabel = false,
  invisible = false,
  onClick,
  onLongClick,
  whileHolding,
}: {
  icon: BottomBarButtonIcon;
  label?: string;
  disabled?: boolean;
  removeLabel?: boolean;
  invisible?: boolean;
  highlight?: boolean;
  onClick?: () => void;
  onLongClick?: () => void;
  whileHolding?: (steps: number) => void;
}) {
  if (disabled) {
    onClick = undefined;
    onLongClick = undefined;
    whileHolding = undefined;
  }

  const theme = useGameTheme();
  const ref = useRef(null);
  const hovered = useHover(ref);

  let listenForLongPress = true;

  const INTERVAL = 400;
  const [holdStart, setHoldStart] = useState(0);
  const holdFn = useCallback(() => {
    const steps = holdStart ? Math.round((Date.now() - holdStart) / INTERVAL) : 0;
    if (whileHolding) {
      whileHolding(Math.round(Math.pow(steps + 1, 1.5)));
    }
  }, [whileHolding, holdStart]);

  if (!whileHolding) {
    listenForLongPress = false;
  }

  const { start, stop } = useInterval(holdFn, INTERVAL, {
    autoStart: false,
    immediate: true,
    selfCorrecting: false,
  });

  // eslint-disable-next-line prefer-const
  let [isPressed, setIsPressed] = useState(false);

  // Stop interval and reset state when button becomes disabled
  useEffect(() => {
    if (disabled) {
      setIsPressed(false);
      setHoldStart(0);
      stop();
    }
  }, [disabled, stop]);

  const LONG_PRESS_SECONDS = 1.25;
  const bind = useLongPress(
    () => {
      // long press done!
      onLongClick && onLongClick();
    },
    {
      onStart: () => {
        setIsPressed(true);
        if (listenForLongPress) {
          setHoldStart(Date.now());
          start();
        }
      },
      onFinish: () => {
        setIsPressed(false);
        if (listenForLongPress) {
          setHoldStart(0);
          stop();
        }
      },
      onCancel: () => {
        setIsPressed(false);
        if (listenForLongPress) {
          setHoldStart(0);
          stop();
        }
      },
      onMove: () => {
        // console.log("Detected mouse or touch movement"),
      },
      filterEvents: () => true,
      threshold: LONG_PRESS_SECONDS * 1000,
      captureEvent: true,
      cancelOnMovement: 25,
      cancelOutsideElement: true,
      detect: LongPressEventType.Pointer,
    },
  );

  label = label?.toUpperCase();
  let color = theme.barTextColor;
  let textShadowColor: string | null = null;
  if (hovered) {
    color = theme.barActiveTextColor;
    textShadowColor = theme.barActiveTextColor;
  }
  if (disabled) {
    color = theme.barDisabledTextColor;
    textShadowColor = null;
    isPressed = false;
  }
  const IconType = icon;

  const iconColor = highlight ? theme.barTextHighlightColor : color;

  return (
    <Box
      ref={ref}
      onClick={() => {
        if (onClick) {
          onClick();
        }
      }}
      {...bind()}
      sx={{
        position: "relative",
        top: isPressed ? 1 : 0,
        left: isPressed ? 1 : 0,
        userSelect: "none",
        opacity: invisible ? 0 : 1,
        cursor: !disabled ? "pointer" : undefined,
        p: 1,
        height: "100%",
        textShadow: textShadowColor && `0 0 4px ${textShadowColor}`,
        color,
        transition: "color linear 0.25s, left linear 0.05s, top linear 0.05s",
      }}
    >
      {onLongClick && (
        <Box
          sx={{
            background: theme.fullResetColor,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: ZINDEX_BOTTOM_BAR_BUTTON_LONG_CLICK,
            borderRadius: "200px",
            position: "absolute",
            transition: `transform ease-out ${isPressed ? LONG_PRESS_SECONDS : 0.1}s`,
            transform: isPressed ? "scale(1.1)" : "scale(0)",
            top: 0,
          }}
        />
      )}
      <Stack sx={{ position: "relative", zIndex: ZINDEX_BOTTOM_BAR_BUTTON_LABEL, height: "100%" }}>
        <Box flex={1} />
        <Box
          sx={{
            color: iconColor,
            fontSize: 30,
            lineHeight: "30px",
            height: "30px",
            textAlign: "center",
          }}
        >
          <IconType fontSize="inherit" />
        </Box>
        {!removeLabel && (
          <Typography
            sx={{
              fontFamily: theme.bottomBarFontFamily ?? theme.fontFamily,
              textAlign: "center",
              mt: 0.5,
              fontSize: 12 * theme.bottomBarFontScalar,
            }}
          >
            {label ?? "\u00a0"}
          </Typography>
        )}
        <Box flex={1} />
      </Stack>
    </Box>
  );
}
