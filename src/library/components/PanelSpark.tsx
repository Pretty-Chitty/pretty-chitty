import Color from "color";
import React, { useEffect, useRef, useState } from "react";
import { useGameTheme } from "../hooks/useGameTheme";
import { Box, Typography } from "@mui/material";
import { useChit } from "../hooks/useChits";
import { SparkChit } from "../game/SparkChit";
import { useTimeState } from "../hooks/useTimeController";
import { ParameterizedCanvas } from "../utilities/ParameterizedCanvas";
import { Image, Player } from "../utilities/CanvasStack/ReactCanvas";
import { ImageSpec } from "../utilities/CanvasStack/CanvasOperations";
import { UpdatingCanvasImage } from "./UpdatingCanvasImage";
import { PlayerChit } from "../game/PlayerChit";

class IconCanvas extends ParameterizedCanvas {
  constructor(
    public width: number,
    public height: number,
    private image: ImageSpec,
  ) {
    super();
  }

  protected render() {
    return <Image fill image={this.image} />;
  }
}

class PlayerCanvas extends ParameterizedCanvas {
  constructor(
    public width: number,
    public height: number,
    private player: PlayerChit,
  ) {
    super();
  }

  protected render() {
    return <Player player={this.player} />;
  }
}

export default function PanelSpark({ chit, paused }: { chit: SparkChit; paused: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const timeState = useTimeState();
  const sparkChit = useChit<SparkChit>(chit.id ?? "no id");

  const [value, setValue] = useState(sparkChit?.value ?? Number.MIN_SAFE_INTEGER);
  const targetValue = sparkChit?.value ?? Number.MIN_SAFE_INTEGER;

  const [flashed, setFlashed] = useState(false);
  const theme = useGameTheme();

  const BORDER_WIDTH = theme.sparkBorderWidth;
  const DURATION = theme.sparkDuration;

  if (ref) {
    chit.element = ref;
  }
  const HEIGHT = 20;

  useEffect(() => {
    if (targetValue !== value) {
      if (paused) {
        chit.parent?.renderInstance?.rootRenderInstance.markHasPendingChange();
        return;
      }

      setValue(targetValue);
      if (targetValue !== Number.MIN_SAFE_INTEGER && value !== Number.MIN_SAFE_INTEGER) {
        const key = `spark${chit.id ?? "no id"}`;
        timeState.setAnimationState(key, true);
        setFlashed(true);
        setTimeout(() => {
          setFlashed(false);
          timeState.setAnimationState(key, false);
        }, DURATION);
      }
    }
  }, [chit, timeState, paused, value, targetValue, DURATION]);

  if (!chit.icon) {
    return;
  }

  const image =
    chit.icon instanceof PlayerChit
      ? new PlayerCanvas(HEIGHT * 3, HEIGHT * 3, chit.icon).get()
      : new IconCanvas(HEIGHT * 3, HEIGHT * 3, chit.icon).get();

  const color = (chit.color.length > 0 ? chit.color : chit.icon?.color) ?? "#ffffff";

  if (value === Number.MIN_SAFE_INTEGER) {
    return null;
  }

  let backgroundColor = color;
  const borderColor = color;

  if (Color(color).isLight()) {
    backgroundColor = Color(color).darken(0.1).hex();
  } else {
    backgroundColor = Color(color).lighten(0.3).hex();
  }

  return (
    <Box
      ref={ref}
      sx={{
        position: "relative",
        background: flashed ? theme.sparkFlashColor : backgroundColor,
        transition: flashed ? "background linear 0.02s" : `background linear ${DURATION / 1000}s`,
        color: theme.sparkForegroundColor,
        p: `${theme.spacing * 0.75}px`,
        pt: 0.15,
        pb: 0.15,
        pl: `${theme.spacing * 0.75 + HEIGHT + BORDER_WIDTH * 2}px`,
        top: -BORDER_WIDTH,
        marginLeft: `${-BORDER_WIDTH * 2}px`,
        borderWidth: BORDER_WIDTH,
        borderStyle: "solid",
        borderColor: borderColor,
        borderBottomRightRadius: "10px",
        borderLeftWidth: 0,
        overflow: "hidden",
      }}
    >
      <UpdatingCanvasImage
        image={image}
        style={{ position: "absolute", left: BORDER_WIDTH * 2, top: 0, width: HEIGHT, height: HEIGHT }}
      />
      <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{value}</Typography>
    </Box>
  );
}
