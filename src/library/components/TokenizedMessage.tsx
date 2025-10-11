import React from "react";
import { Box } from "@mui/material";
import Color from "color";

export interface TokenDefinition {
  image?: string;
  label?: string;
  color?: string;
}

export interface TokenizedMessageProps {
  message: string;
  fontSize: number;
  tokenMap?: Record<string, TokenDefinition>;
}

// Token parsing types
interface ParsedToken {
  type: "token";
  name: string;
  definition?: TokenDefinition;
  key: string;
}

interface ParsedText {
  type: "text";
  content: string;
  key: string;
}

type ParsedElement = ParsedToken | ParsedText;

// Color utility function
function calculateBackgroundColor(textColor: string): string {
  const color = Color(textColor);
  const lightness = color.lightness();
  return lightness > 25
    ? color.lightness(5).hex() // 5% brightness for light colors
    : color.lightness(95).hex(); // 95% brightness for dark colors
}

// Token Image Component
interface TokenImageProps {
  src: string;
  alt: string;
  fontSize: number;
  hasLabel: boolean;
}

function TokenImage({ src, alt, fontSize, hasLabel }: TokenImageProps) {
  return (
    <Box
      component="img"
      src={src}
      alt={alt}
      sx={{
        height: `${fontSize - 4}px`,
        marginRight: hasLabel ? "4px" : 0,
        transform: `scale(1.2)`,
        top: "-1px",
        position: "relative",
        marginLeft: "2px",
      }}
    />
  );
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

// Parser function
function parseMessageTokens(message: string, tokenMap: Record<string, TokenDefinition>): ParsedElement[] {
  const elements: ParsedElement[] = [];
  const tokenRegex = /:([a-zA-Z0-9_-]+):/g;
  let lastIndex = 0;
  let match;

  while ((match = tokenRegex.exec(message)) !== null) {
    const tokenName = match[1];

    // Add text before the token
    if (match.index > lastIndex) {
      elements.push({
        type: "text",
        content: message.substring(lastIndex, match.index),
        key: `text-${lastIndex}`,
      });
    }

    // Add the token
    elements.push({
      type: "token",
      name: tokenName,
      definition: tokenMap[tokenName],
      key: `token-${match.index}`,
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after last token
  if (lastIndex < message.length) {
    elements.push({
      type: "text",
      content: message.substring(lastIndex),
      key: `text-${lastIndex}`,
    });
  }

  return elements;
}

// Main Component
export function TokenizedMessage({ message, fontSize, tokenMap = {} }: TokenizedMessageProps) {
  const elements = parseMessageTokens(message, tokenMap);

  return (
    <Box
      component="span"
      sx={{
        fontSize: `${fontSize}px`,
        lineHeight: 1,
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
