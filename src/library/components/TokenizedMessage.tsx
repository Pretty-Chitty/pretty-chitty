import React from "react";
import { Box } from "@mui/material";
import Color from "color";
import { ImageSpec } from "../utilities/CanvasStack/CanvasOperations";
import { UpdatingCanvasImage } from "./UpdatingCanvasImage";
import { StaticImage } from "../utilities/StaticImage";
import { TokenDefinition, parseMessageTokens } from "../utilities/TokenizedText";

export type { TokenDefinition } from "../utilities/TokenizedText";

export interface TokenizedMessageProps {
  message: string;
  fontSize: number;
  tokenMap?: Record<string, TokenDefinition>;
}

// Color utility function
function calculateBackgroundColor(textColor: string): string {
  const color = Color(textColor);
  const lightness = color.lightness();
  return lightness > 45
    ? color.lightness(5).hex() // 5% brightness for light colors
    : color.lightness(95).hex(); // 95% brightness for dark colors
}

const LINE_HEIGHT = 1.1;
const DEFAULT_IMAGE_BLEED = 0.1;

// Token Image Component
interface TokenImageProps {
  src: string | ImageSpec;
  alt: string;
  fontSize: number;
  bleed: number;
}

function TokenImage({ src, alt, fontSize, bleed }: TokenImageProps) {
  // grow past the line box, then cancel the extra height with negative margins so lines don't get pushed apart
  const bleedPx = bleed * fontSize;
  const style = {
    height: `${fontSize * LINE_HEIGHT + bleedPx * 2}px`,
    marginTop: `${-bleedPx}px`,
    marginBottom: `${-bleedPx}px`,
    marginLeft: "1px",
    marginRight: "3px",
    position: "relative" as const,
  };

  if (typeof src !== "string") {
    const updatingCanvas = new StaticImage(src).get();
    return <UpdatingCanvasImage image={updatingCanvas} style={style} />;
  } else {
    return <Box component="img" src={src} alt={alt} sx={style} />;
  }
}

// Token Label Component
interface TokenLabelProps {
  label: string;
  color?: string;
  fontSize: number;
}

function TokenLabel({ label, color, fontSize }: TokenLabelProps) {
  return (
    <Box
      component="strong"
      sx={{
        color,
        fontSize: `${fontSize}px`,
        lineHeight: 1,
      }}
    >
      {label}
    </Box>
  );
}

// Token Component
interface TokenProps {
  name: string;
  definition?: TokenDefinition;
  fontSize: number;
}

function Token({ name, definition, fontSize }: TokenProps) {
  if (!definition) {
    return <>{`:${name}:`}</>;
  }

  const backgroundColor = definition.color ? calculateBackgroundColor(definition.color) : undefined;

  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        whiteSpace: "nowrap",
        // an image has no text baseline, so center image tokens on the text instead
        verticalAlign: definition.image ? "middle" : "baseline",
        backgroundColor,
        padding: backgroundColor ? "1px 2px" : 0,
        margin: backgroundColor ? "-1px 0" : 0,
        borderRadius: "4px",
      }}
    >
      {definition.image && (
        <TokenImage
          src={definition.image}
          alt={name}
          fontSize={fontSize}
          bleed={definition.imageBleed ?? (backgroundColor ? 0 : DEFAULT_IMAGE_BLEED)}
        />
      )}
      {definition.label && <TokenLabel label={definition.label} color={definition.color} fontSize={fontSize} />}
    </Box>
  );
}

// Main Component
export function TokenizedMessage({ message, fontSize, tokenMap = {} }: TokenizedMessageProps) {
  const elements = parseMessageTokens(message, tokenMap);

  return (
    <Box
      sx={{
        fontSize: `${fontSize}px`,
        lineHeight: `${fontSize * LINE_HEIGHT}px`,
      }}
    >
      {elements.map((element) =>
        element.type === "token" ? (
          <Token key={element.key} name={element.name} definition={element.definition} fontSize={fontSize} />
        ) : (
          <React.Fragment key={element.key}>{element.content}</React.Fragment>
        ),
      )}
    </Box>
  );
}
