import React, { useMemo } from "react";
import Markdown, { Components } from "react-markdown";
import { Box } from "@mui/material";
import { Token } from "./TokenizedMessage";
import { TokenDefinition, TokenMap } from "../utilities/TokenizedText";
import { UpdatingCanvasImage } from "./UpdatingCanvasImage";
import { StaticImage } from "../utilities/StaticImage";

export interface TokenizedMarkdownProps {
  /** Markdown. `:token:` references render as the game's icons, like log lines. */
  text: string;
  fontSize: number;
  tokenMap?: TokenMap;
  color?: string;
  /** Sentence to emphasise (0-based, counted across the whole text); others are dimmed. -1 for none. */
  activeSentence?: number;
  /** Opacity of sentences other than the active one. Default 0.55 */
  dimmedOpacity?: number;
  /** Colour of the active sentence. Default: inherit */
  accent?: string;
  /** Resolves relative image URLs. Default: unchanged */
  resolveImage?: (src: string) => string;
}

const TOKEN_REGEX = /:([a-zA-Z0-9_-]+):/g;
const SENTENCE_END = /[.!?]+["')\]]*(?=\s|$)/g;

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

/**
 * A rehype plugin that turns `:token:` text into `<span data-token>` and wraps the text of each
 * sentence in `<span data-sentence>`, counting sentences in document order. Keeps the structure
 * react-markdown produced; only text nodes change.
 */
function rehypeTokensAndSentences(tokenMap: TokenMap) {
  return () => (tree: HastNode) => {
    let sentence = 0;
    const walk = (node: HastNode, insideCode: boolean) => {
      if (node.type === "element" && (node.tagName === "code" || node.tagName === "pre")) {
        insideCode = true;
      }
      if (!node.children) return;
      const next: HastNode[] = [];
      for (const child of node.children) {
        if (child.type === "text" && !insideCode && child.value) {
          next.push(...splitText(child.value));
        } else {
          walk(child, insideCode);
          next.push(child);
        }
      }
      node.children = next;
    };

    const span = (properties: Record<string, unknown>, children: HastNode[]): HastNode => ({
      type: "element",
      tagName: "span",
      properties,
      children,
    });

    const splitText = (value: string): HastNode[] => {
      const out: HastNode[] = [];
      let buffer = "";
      const flushText = () => {
        if (buffer) {
          out.push(span({ dataSentence: sentence }, [{ type: "text", value: buffer }]));
          buffer = "";
        }
      };
      // Tokens first, then sentence ends inside the plain runs
      let last = 0;
      const tokenRegex = new RegExp(TOKEN_REGEX.source, "g");
      let m: RegExpExecArray | null;
      const pushRun = (run: string) => {
        let runLast = 0;
        const endRegex = new RegExp(SENTENCE_END.source, "g");
        let e: RegExpExecArray | null;
        while ((e = endRegex.exec(run)) !== null) {
          buffer += run.substring(runLast, e.index + e[0].length);
          runLast = e.index + e[0].length;
          flushText();
          sentence++;
        }
        buffer += run.substring(runLast);
      };
      while ((m = tokenRegex.exec(value)) !== null) {
        const name = m[1];
        if (!tokenMap[name]) continue;
        pushRun(value.substring(last, m.index));
        flushText();
        out.push(span({ dataToken: name, dataSentence: sentence }, []));
        last = m.index + m[0].length;
      }
      pushRun(value.substring(last));
      flushText();
      return out;
    };

    walk(tree, false);
    // Trailing text with no terminal punctuation still counts as a sentence; nothing to do.
  };
}

function MarkdownImage({
  src,
  alt,
  tokenMap,
  resolveImage,
}: {
  src?: string;
  alt?: string;
  tokenMap: TokenMap;
  resolveImage?: (src: string) => string;
}) {
  if (!src) return null;
  if (src.startsWith("token:")) {
    const def: TokenDefinition | undefined = tokenMap[src.substring("token:".length)];
    if (!def?.image) return <>{alt}</>;
    if (typeof def.image === "string") {
      return <Box component="img" src={def.image} alt={alt} sx={{ maxWidth: "100%", display: "block", my: 1 }} />;
    }
    const canvas = new StaticImage(def.image).get();
    return (
      <Box sx={{ my: 1 }}>
        <UpdatingCanvasImage image={canvas} style={{ maxWidth: "100%", display: "block" }} />
      </Box>
    );
  }
  return (
    <Box
      component="img"
      src={resolveImage ? resolveImage(src) : src}
      alt={alt}
      sx={{ maxWidth: "100%", height: "auto", display: "block", my: 1, borderRadius: 1 }}
    />
  );
}

/**
 * Markdown with the game's `:token:` icons inline, rendered with the same token map and `Token`
 * component as the action log, plus optional per-sentence emphasis for narration. Images can be
 * URLs or `token:<name>` to show a token's art at image size.
 */
export function TokenizedMarkdown({
  text,
  fontSize,
  tokenMap = {},
  color,
  activeSentence = -1,
  dimmedOpacity = 0.55,
  accent,
  resolveImage,
}: TokenizedMarkdownProps) {
  const plugin = useMemo(() => rehypeTokensAndSentences(tokenMap), [tokenMap]);

  const components = useMemo<Components>(
    () => ({
      // eslint-disable-next-line react/prop-types
      span: (props) => {
        // eslint-disable-next-line react/prop-types
        const { node, children, ...rest } = props as any;
        // eslint-disable-next-line react/prop-types
        const p = node?.properties ?? {};
        const tokenName = p.dataToken as string | undefined;
        const sentence = p.dataSentence as number | undefined;
        const emphasised = activeSentence < 0 || sentence === undefined || sentence === activeSentence;
        const style: React.CSSProperties = {
          opacity: emphasised ? 1 : dimmedOpacity,
          color: emphasised && activeSentence >= 0 && accent ? accent : undefined,
          transition: "opacity 0.25s linear, color 0.25s linear",
        };
        if (tokenName) {
          return (
            <span style={style}>
              <Token name={tokenName} definition={tokenMap[tokenName]} fontSize={fontSize} />
            </span>
          );
        }
        return (
          <span {...rest} style={style}>
            {children}
          </span>
        );
      },
      // eslint-disable-next-line react/prop-types
      img: (props) => {
        // eslint-disable-next-line react/prop-types
        const { src, alt } = props as any;
        return <MarkdownImage src={src} alt={alt} tokenMap={tokenMap} resolveImage={resolveImage} />;
      },
      p: ({ children }) => <Box sx={{ my: 0.75, "&:first-of-type": { mt: 0 }, "&:last-of-type": { mb: 0 } }}>{children}</Box>,
      ul: ({ children }) => <Box component="ul" sx={{ my: 0.5, pl: 2.5 }}>{children}</Box>,
      ol: ({ children }) => <Box component="ol" sx={{ my: 0.5, pl: 2.5 }}>{children}</Box>,
      li: ({ children }) => <Box component="li" sx={{ my: 0.25 }}>{children}</Box>,
      h1: ({ children }) => <Box sx={{ fontSize: fontSize * 1.4, fontWeight: "bold", my: 0.5 }}>{children}</Box>,
      h2: ({ children }) => <Box sx={{ fontSize: fontSize * 1.25, fontWeight: "bold", my: 0.5 }}>{children}</Box>,
      h3: ({ children }) => <Box sx={{ fontSize: fontSize * 1.1, fontWeight: "bold", my: 0.5 }}>{children}</Box>,
      a: ({ children, href }) => (
        <a href={href} target="_blank" rel="noreferrer" style={{ color: accent ?? "inherit" }}>
          {children}
        </a>
      ),
      blockquote: ({ children }) => (
        <Box sx={{ borderLeft: `3px solid ${accent ?? "currentColor"}`, pl: 1.5, my: 0.75, opacity: 0.9 }}>{children}</Box>
      ),
    }),
    [activeSentence, dimmedOpacity, accent, tokenMap, fontSize, resolveImage],
  );

  return (
    <Box sx={{ fontSize: `${fontSize}px`, lineHeight: 1.35, color }}>
      <Markdown rehypePlugins={[plugin]} components={components} skipHtml>
        {text}
      </Markdown>
    </Box>
  );
}
