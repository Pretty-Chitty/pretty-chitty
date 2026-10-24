import { ImageSpec } from "./CanvasStack/CanvasOperations";

/**
 * A `:token:` that can appear in game messages (prompts, log lines, etc.).
 *
 * `image`, `label` and `color` drive the "pretty" rendering in the UI. `text` is the plain-text stand-in used anywhere
 * a message has to be pure text (match storage, match lists, notifications). When `text` is omitted the `label` is
 * used, and when there is no label either the raw `:token:` is kept.
 */
export interface TokenDefinition {
  image?: string | ImageSpec;
  label?: string;
  color?: string;
  /** Plain-text representation of this token, for places that cannot render images or styling. */
  text?: string;
}

export type TokenMap = Record<string, TokenDefinition>;

export interface ParsedToken {
  type: "token";
  name: string;
  definition?: TokenDefinition;
  key: string;
}

export interface ParsedText {
  type: "text";
  content: string;
  key: string;
}

export type ParsedElement = ParsedToken | ParsedText;

const TOKEN_REGEX = /:([a-zA-Z0-9_-]+):/g;

/** Splits a message into literal text runs and `:token:` references. */
export function parseMessageTokens(message: string, tokenMap: TokenMap): ParsedElement[] {
  const elements: ParsedElement[] = [];
  const regex = new RegExp(TOKEN_REGEX.source, "g");
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(message)) !== null) {
    const tokenName = match[1];

    if (match.index > lastIndex) {
      elements.push({ type: "text", content: message.substring(lastIndex, match.index), key: `text-${lastIndex}` });
    }

    elements.push({ type: "token", name: tokenName, definition: tokenMap[tokenName], key: `token-${match.index}` });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < message.length) {
    elements.push({ type: "text", content: message.substring(lastIndex), key: `text-${lastIndex}` });
  }

  return elements;
}

/** The plain-text form of a single token. */
export function tokenToText(name: string, definition?: TokenDefinition): string {
  return definition?.text ?? definition?.label ?? `:${name}:`;
}

/**
 * Converts a tokenized message into plain text by replacing every `:token:` with its text representation.
 * Unknown tokens are left as-is.
 */
export function tokenizedMessageToText(message: string, tokenMap: TokenMap): string {
  return parseMessageTokens(message, tokenMap)
    .map((el) => (el.type === "token" ? tokenToText(el.name, el.definition) : el.content))
    .join("");
}

export interface TokenMapPlayer {
  playerId: string;
  name?: string;
  color?: string;
  imageUrl?: string;
}

/**
 * Builds the full token map for a match: the game's own tokens plus one token per player (keyed by player id) and the
 * built-in `:warning:` token. Shared by the UI hook and by server-side code so both agree on what a token means.
 */
export function buildTokenMap(gameTokenMap: TokenMap | undefined, players: TokenMapPlayer[], defaultColor?: string): TokenMap {
  const tokenMap: TokenMap = { ...(gameTokenMap ?? {}) };
  players.forEach((p) => {
    const name = p.name ?? "??";
    tokenMap[p.playerId] = { label: name, text: name, color: p.color ?? defaultColor, image: p.imageUrl };
  });
  tokenMap["warning"] = { label: "⚠️", text: "Warning:" };
  return tokenMap;
}
