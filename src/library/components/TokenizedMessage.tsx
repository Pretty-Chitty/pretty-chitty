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

// Token Image Component
interface TokenImageProps {
  src: string | ImageSpec;
  alt: string;
  fontSize: number;
  hasLabel: boolean;
}

function TokenImage({ src, alt, fontSize, hasLabel }: TokenImageProps) {
  if (typeof src !== "string") {
    const updatingCanvas = new StaticImage(src).get();
    return (
      <UpdatingCanvasImage
        image={updatingCanvas}
        style={{
          height: `${fontSize - 4}px`,
          marginRight: "4px",
          transform: `scale(1.4)`,
          position: "relative",
          marginLeft: "2px",
        }}
      />
    );
  } else {
    return (
      <Box
        component="img"
        src={src}
        alt={alt}
        sx={{
          height: `${fontSize - 4}px`,
          marginRight: "4px",
          transform: `scale(1.4)`,
          position: "relative",
          marginLeft: "2px",
        }}
      />
    );
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
        verticalAlign: "baseline",
        backgroundColor,
        padding: backgroundColor ? "1px 2px" : 0,
        margin: backgroundColor ? "-1px 0" : 0,
        borderRadius: "4px",
      }}
    >
      {definition.image && (
        <TokenImage src={definition.image} alt={name} fontSize={fontSize} hasLabel={!!definition.label} />
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
        lineHeight: `${fontSize * 1.1}px`,
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
