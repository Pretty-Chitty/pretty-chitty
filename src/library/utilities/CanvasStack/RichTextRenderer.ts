export type Align = "left" | "center" | "right";
export type IconBaseline = "text" | "middle" | "bottom";
export type VerticalAlign = "top" | "middle" | "bottom";

/** A single sprite inside a larger sprite sheet image */
export interface SpriteRef {
  image: HTMLImageElement; // the full spritemap image
  x: number; // source x within the spritemap
  y: number; // source y within the spritemap
  width: number; // source width of the sprite
  height: number; // source height of the sprite
}

export interface IconMap {
  [name: string]: SpriteRef | undefined;
}

export type RichTextRenderOptionsParameters = {
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number; // multiplier (e.g., 1.25)
  align?: Align;
  verticalAlign?: VerticalAlign;
  color?: string;
  iconMap?: IconMap;
  iconBaseline?: IconBaseline;
  iconScale?: number; // 1.0 = same height as text
};

export interface RenderOptions extends RichTextRenderOptionsParameters {
  x?: number;
  y?: number;
  maxWidth: number; // required
  height?: number; // optional container height for vertical alignment
  debug?: boolean;
}

export interface RenderResult {
  height: number;
  lines: number;
  lastBaselineY: number;
}

type Token =
  | { type: "text"; text: string; bold: boolean; italic: boolean }
  | { type: "icon"; name: string }
  | { type: "break" };

type Run =
  | { kind: "text"; text: string; bold: boolean; italic: boolean }
  | { kind: "icon"; name: string }
  | { kind: "space"; text: string; bold: boolean; italic: boolean }
  | { kind: "break" };

type Segment =
  | { kind: "text"; text: string; width: number; style: { bold: boolean; italic: boolean } }
  | { kind: "icon"; width: number; height: number; sprite: SpriteRef | null; name: string }
  | { kind: "space"; width: number };

interface Line {
  width: number;
  segments: Segment[];
}

interface Metrics {
  fontFamily: string;
  fontSize: number;
  lineHeightPx: number;
  iconScale: number;
  iconBaseline: IconBaseline;
}

export class RichTextRenderer {
  render(ctx: CanvasRenderingContext2D, text: string, opts: RenderOptions): RenderResult {
    const {
      x = 0,
      y = 0,
      maxWidth,
      height,
      fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
      fontSize = 16,
      lineHeight = 1.25,
      align = "left",
      verticalAlign = "top",
      color = "#000",
      iconMap = {},
      iconBaseline = "text",
      iconScale = 1.0,
      debug = false,
    } = opts;

    if (!maxWidth || maxWidth <= 0) {
      throw new Error("RichTextRenderer: opts.maxWidth is required and must be > 0.");
    }

    const metrics: Metrics = {
      fontFamily,
      fontSize,
      lineHeightPx: fontSize * lineHeight,
      iconScale,
      iconBaseline,
    };

    const tokens = this.tokenize(text);
    const runs = this.expandRuns(tokens);
    const lines = this.layoutRunsToLines(ctx, runs, metrics, maxWidth, iconMap);

    // Draw
    ctx.save();
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = color;

    const totalHeight = lines.length * metrics.lineHeightPx;
    // Compute initial Y based on vertical alignment if a container height was provided.
    let startY = y;
    if (verticalAlign === "middle" && typeof height === "number") {
      startY = y + Math.round(Math.max(0, (height - totalHeight) / 2));
    } else if (verticalAlign === "bottom" && typeof height === "number") {
      startY = y + Math.round(Math.max(0, height - totalHeight));
    }
    let cursorY = startY;
    for (const line of lines) {
      let offsetX = 0;
      if (align === "center") offsetX = (maxWidth - line.width) / 2;
      else if (align === "right") offsetX = maxWidth - line.width;

      let cursorX = x + offsetX;
      const baselineY = cursorY + metrics.fontSize;

      if (debug) {
        ctx.save();
        ctx.strokeStyle = "rgba(0,0,255,0.25)";
        ctx.strokeRect(x + offsetX, cursorY, line.width, metrics.lineHeightPx);
        ctx.restore();
      }

      for (const seg of line.segments) {
        if (seg.kind === "text") {
          ctx.font = this.makeFont(seg.style, metrics);
          ctx.fillText(seg.text, cursorX, baselineY);
          cursorX += seg.width;
        } else if (seg.kind === "icon") {
          const sprite = seg.sprite;
          const { drawY } = this.iconBaselinePosition(baselineY, metrics, seg.height);

          if (
            sprite &&
            sprite.image &&
            sprite.image.complete &&
            sprite.image.naturalWidth > 0 &&
            sprite.image.naturalHeight > 0 &&
            sprite.width > 0 &&
            sprite.height > 0
          ) {
            ctx.drawImage(
              sprite.image,
              sprite.x,
              sprite.y,
              sprite.width,
              sprite.height, // source rect
              Math.round(cursorX),
              Math.round(drawY),
              Math.round(seg.width),
              Math.round(seg.height), // destination rect (aspect preserved)
            );
          } else {
            // Placeholder box with preserved layout size
            ctx.save();
            ctx.strokeStyle = "rgba(0,0,0,0.35)";
            ctx.strokeRect(Math.round(cursorX), Math.round(drawY), Math.round(seg.width), Math.round(seg.height));
            ctx.restore();
          }
          cursorX += seg.width;
        } else if (seg.kind === "space") {
          cursorX += seg.width;
        }
      }

      cursorY += metrics.lineHeightPx;
    }

    ctx.restore();

    return {
      height: lines.length * metrics.lineHeightPx,
      lines: lines.length,
      lastBaselineY: startY + (lines.length - 1) * metrics.lineHeightPx + metrics.fontSize,
    };
  }

  // ---------------------- Parsing / Tokenizing ----------------------

  /** Supports **bold** / __bold__ / *italic* / _italic_ / ***bold-italic*** and :icon: */
  private tokenize(input: string): Token[] {
    const out: Token[] = [];
    const push = (t: Token) => out.push(t);

    let i = 0;
    const len = input.length;

    const style = { bold: false, italic: false };
    let buf = "";

    const flushText = (b: string) => {
      if (!b) return;
      push({ type: "text", text: b, bold: style.bold, italic: style.italic });
    };

    const peek = (n = 0) => input[i + n];
    const consume = (n = 1) => {
      i += n;
    };
    const toggle = (what: "bold" | "italic") => {
      style[what] = !style[what];
    };

    while (i < len) {
      const ch = peek();

      if (ch === "\n") {
        flushText(buf);
        buf = "";
        push({ type: "break" });
        consume();
        continue;
      }

      if (ch === "\\") {
        const next = peek(1);
        if (next) {
          buf += next;
          consume(2);
          continue;
        }
        buf += ch;
        consume();
        continue;
      }

      if (ch === ":") {
        let j = i + 1;
        while (j < len && input[j] !== ":") j++;
        const maybeName = input.slice(i + 1, j);
        if (j < len && maybeName && /^[a-zA-Z0-9_-]+$/.test(maybeName)) {
          flushText(buf);
          buf = "";
          push({ type: "icon", name: maybeName });
          consume(maybeName.length + 2);
          continue;
        }
        buf += ch;
        consume();
        continue;
      }

      if (ch === "*" || ch === "_") {
        const mark = ch;
        let count = 1;
        while (peek(count) === mark) count++;
        const use = Math.min(count, 3);
        flushText(buf);
        buf = "";

        if (use === 3) {
          toggle("bold");
          toggle("italic");
        } else if (use === 2) {
          toggle("bold");
        } else {
          toggle("italic");
        }

        consume(use);
        continue;
      }

      buf += ch!;
      consume();
    }

    flushText(buf);
    return out;
  }

  /** Split text tokens into runs by whitespace, preserving spaces as runs for measurement. */
  private expandRuns(tokens: Token[]): Run[] {
    const runs: Run[] = [];
    const pushText = (text: string, bold: boolean, italic: boolean) => {
      if (text.length === 0) return;
      runs.push({ kind: "text", text, bold, italic });
    };

    for (const t of tokens) {
      if (t.type === "break") {
        runs.push({ kind: "break" });
      } else if (t.type === "icon") {
        runs.push({ kind: "icon", name: t.name });
      } else if (t.type === "text") {
        const parts = t.text.split(/(\s+)/);
        for (const p of parts) {
          if (!p) continue;
          if (/^\s+$/.test(p)) runs.push({ kind: "space", text: p, bold: t.bold, italic: t.italic });
          else pushText(p, t.bold, t.italic);
        }
      }
    }
    return runs;
  }

  // --------------------------- Layout ---------------------------

  private layoutRunsToLines(
    ctx: CanvasRenderingContext2D,
    runs: Run[],
    metrics: Metrics,
    maxWidth: number,
    iconMap: IconMap,
  ): Line[] {
    const lines: Line[] = [];
    let line: Line = this.newLine();
    let cursorW = 0;

    const HYPH_RATIO = 1 / 3; // hyphenate mid-line only if word width > this * maxWidth
    const hyphenWidthCache = new Map<string, number>();

    const hyphenWidth = (styleKey: string) => {
      if (hyphenWidthCache.has(styleKey)) return hyphenWidthCache.get(styleKey)!;
      const w = this.measureText(ctx, "-", styleKey, metrics);
      hyphenWidthCache.set(styleKey, w);
      return w;
    };

    const spaceWidthCache = new Map<string, number>();
    const measureSpace = (sp: string, styleKey: string) => {
      const k = sp + "|" + styleKey;
      if (spaceWidthCache.has(k)) return spaceWidthCache.get(k)!;
      const w = this.measureText(ctx, sp, styleKey, metrics);
      spaceWidthCache.set(k, w);
      return w;
    };

    const flushLine = (allowEmpty = false) => {
      if (allowEmpty || line.segments.length > 0) {
        lines.push(line);
      }
      line = this.newLine();
      cursorW = 0;
    };

    for (const r of runs) {
      if (r.kind === "break") {
        flushLine(true);
        continue;
      }

      if (r.kind === "space") {
        const styleKey = this.styleKey(r);
        const w = measureSpace(r.text, styleKey);
        if (cursorW + w > maxWidth) {
          flushLine(true);
          continue;
        }
        line.segments.push({ kind: "space", width: w });
        cursorW += w;
        continue;
      }

      if (r.kind === "icon") {
        const sprite = iconMap[r.name] ?? null;
        const drawH = metrics.fontSize * metrics.iconScale;
        let drawW = drawH; // default square if missing/invalid

        if (sprite && sprite.width > 0 && sprite.height > 0) {
          drawW = drawH * (sprite.width / sprite.height); // preserve aspect ratio from sprite rect
        }

        if (cursorW > 0 && cursorW + drawW > maxWidth) {
          flushLine(true);
        }
        line.segments.push({
          kind: "icon",
          width: drawW,
          height: drawH,
          sprite,
          name: r.name,
        });
        cursorW += drawW;
        continue;
      }

      // ---- Text run (single "word" or punctuation chunk) ----
      if (r.kind === "text") {
        const styleKey = this.styleKey(r);
        const wordWidth = this.measureText(ctx, r.text, styleKey, metrics);
        const avail = maxWidth - cursorW;
        const threshold = maxWidth * HYPH_RATIO;

        // Fits in remaining space: place and continue.
        if (wordWidth <= avail) {
          line.segments.push({
            kind: "text",
            text: r.text,
            width: wordWidth,
            style: { bold: r.bold, italic: r.italic },
          });
          cursorW += wordWidth;
          continue;
        }

        // If it doesn't fit the tail…
        if (cursorW > 0) {
          // …and the word is "long" (over threshold), try hyphenating into the remaining space.
          if (wordWidth > threshold) {
            const res = this.hyphenateIntoLines(
              ctx,
              r.text,
              r,
              styleKey,
              metrics,
              maxWidth,
              lines,
              line,
              cursorW,
              avail, // first chunk limited by remaining space
              hyphenWidth(styleKey),
            );
            line = res.line;
            cursorW = res.cursorW;
            continue;
          } else {
            // Short word: move intact to next line (no hyphen).
            flushLine(true);
            line.segments.push({
              kind: "text",
              text: r.text,
              width: wordWidth,
              style: { bold: r.bold, italic: r.italic },
            });
            cursorW = wordWidth;
            continue;
          }
        }

        // We're at line start and word still doesn't fit -> must hyphenate across lines.
        if (wordWidth > maxWidth) {
          const res = this.hyphenateIntoLines(
            ctx,
            r.text,
            r,
            styleKey,
            metrics,
            maxWidth,
            lines,
            line,
            cursorW,
            maxWidth, // first chunk uses full width
            hyphenWidth(styleKey),
          );
          line = res.line;
          cursorW = res.cursorW;
          continue;
        }

        // Otherwise: we were at line start and it fits a fresh line.
        line.segments.push({ kind: "text", text: r.text, width: wordWidth, style: { bold: r.bold, italic: r.italic } });
        cursorW += wordWidth;
      }
    }

    // Push the last line (may be empty when text ends with \n; keep parity with original behavior)
    lines.push(line);

    // Compute final widths
    for (const L of lines) {
      L.width = L.segments.reduce((a, s) => a + s.width, 0);
    }
    return lines;
  }

  private newLine(): Line {
    return { width: 0, segments: [] };
  }

  private styleKey(run: { bold: boolean; italic: boolean }): string {
    return `${run.bold ? "b" : "n"}${run.italic ? "i" : "n"}`;
  }

  private makeFont(style: { bold?: boolean; italic?: boolean }, metrics: Metrics): string {
    const w = style?.bold ? "700" : "400";
    const it = style?.italic ? "italic " : "";
    return `${it}${w} ${metrics.fontSize}px ${metrics.fontFamily}`;
  }

  private measureText(ctx: CanvasRenderingContext2D, text: string, styleKey: string, metrics: Metrics): number {
    const bold = styleKey[0] === "b";
    const italic = styleKey[1] === "i";
    const font = this.makeFont({ bold, italic }, metrics);
    ctx.font = font;
    return ctx.measureText(text).width;
  }

  // --------------------------- Hyphenation ---------------------------

  /** Decide a chunk for the current line:
   * - If whole `word` fits in `limit`, return it (no hyphen).
   * - Else return the largest prefix that fits with a trailing "-" (requires at least 1 char left as rest).
   * - If even "a-" won't fit, returns { first: "", rest: word, addHyphen: false }.
   */
  private hyphenateChunk(
    ctx: CanvasRenderingContext2D,
    word: string,
    styleKey: string,
    metrics: Metrics,
    limit: number,
    hyphW: number,
  ): { first: string; rest: string; addHyphen: boolean } {
    // Don't attempt if no space
    if (limit <= 0) return { first: "", rest: word, addHyphen: false };

    const fullW = this.measureText(ctx, word, styleKey, metrics);
    if (fullW <= limit) {
      return { first: word, rest: "", addHyphen: false };
    }

    // Never split within the first or last MIN_EDGE characters.
    const MIN_EDGE = 3;
    const n = word.length;
    if (n <= MIN_EDGE * 2) {
      // Word too short to hyphenate while respecting edge constraints.
      return { first: "", rest: word, addHyphen: false };
    }

    const minFirst = MIN_EDGE;
    const maxFirst = n - MIN_EDGE; // inclusive

    // Prefer a near-50/50 split (balanced) subject to fitting in `limit`.
    const mid = Math.floor(n / 2);

    // Build candidate indices in increasing distance from mid, constrained to [minFirst, maxFirst].
    const candidates: number[] = [];
    for (let i = minFirst; i <= maxFirst; i++) candidates.push(i);
    candidates.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));

    for (const idx of candidates) {
      const prefix = word.slice(0, idx);
      const prefixW = this.measureText(ctx, prefix, styleKey, metrics);
      if (prefixW + hyphW <= limit) {
        return { first: prefix, rest: word.slice(idx), addHyphen: true };
      }
    }

    // If no balanced candidate fits, fallback to the largest prefix that fits within [minFirst, maxFirst].
    let lo = minFirst;
    let hi = maxFirst;
    let best = 0;
    while (lo <= hi) {
      const midIdx = (lo + hi) >> 1;
      const prefixW = this.measureText(ctx, word.slice(0, midIdx), styleKey, metrics);
      if (prefixW + hyphW <= limit) {
        best = midIdx;
        lo = midIdx + 1;
      } else {
        hi = midIdx - 1;
      }
    }

    if (best > 0) {
      return { first: word.slice(0, best), rest: word.slice(best), addHyphen: true };
    }

    // As a last resort, try splitting at an index >= 2 (avoid single-character prefixes).
    // This prevents infinite loops when a word cannot fit intact on a line but no balanced split was possible.
    lo = 2;
    hi = n - 1;
    best = 0;
    while (lo <= hi) {
      const midIdx = (lo + hi) >> 1;
      const prefixW = this.measureText(ctx, word.slice(0, midIdx), styleKey, metrics);
      if (prefixW + hyphW <= limit) {
        best = midIdx;
        lo = midIdx + 1;
      } else {
        hi = midIdx - 1;
      }
    }

    if (best <= 0) {
      return { first: "", rest: word, addHyphen: false };
    }

    return { first: word.slice(0, best), rest: word.slice(best), addHyphen: true };
  }

  /** Hyphenate `text` across one or more lines. Returns updated `line` and `cursorW`.
   *  - First piece is constrained by `firstLimit` (remaining width on current line).
   *  - Subsequent pieces use `maxWidth`.
   *  - Adds "-" to all but the last piece.
   */
  private hyphenateIntoLines(
    ctx: CanvasRenderingContext2D,
    text: string,
    run: { bold: boolean; italic: boolean },
    styleKey: string,
    metrics: Metrics,
    maxWidth: number,
    lines: Line[],
    line: Line,
    cursorW: number,
    firstLimit: number,
    hyphW: number,
  ): { line: Line; cursorW: number } {
    let remaining = text;
    let limit = firstLimit;

    const pushLine = () => {
      lines.push(line);
      line = this.newLine();
      cursorW = 0;
      limit = maxWidth;
    };

    while (remaining.length > 0) {
      // If we can place the remainder intact within the current limit, do it and finish.
      const wholeW = this.measureText(ctx, remaining, styleKey, metrics);
      if (wholeW <= limit) {
        line.segments.push({
          kind: "text",
          text: remaining,
          width: wholeW,
          style: { bold: run.bold, italic: run.italic },
        });
        cursorW += wholeW;
        remaining = "";
        break;
      }

      // Try to fit with hyphen within the current limit.
      const chunk = this.hyphenateChunk(ctx, remaining, styleKey, metrics, limit, hyphW);

      // If nothing (not even "a-") fits in the remaining tail, try to avoid infinite loops.
      if (!chunk.first) {
        // If we're already on a fresh line (limit == maxWidth) and still nothing fits,
        // force-placement of a single character so we always make progress.
        // This is a last-resort fallback to prevent infinite loops when hyphenation
        // can't produce any valid prefix for the current limit.
        if (limit === maxWidth) {
          // Try to place two characters if possible to avoid single-letter line breaks like "A-\nstronomy".
          const tryLen = Math.min(2, remaining.length);
          let forced = remaining.slice(0, tryLen);
          let forcedW = this.measureText(ctx, forced, styleKey, metrics);
          // If two characters don't fit, fall back to a single character.
          if (tryLen === 2 && forcedW + hyphW > limit) {
            forced = remaining.slice(0, 1);
            forcedW = this.measureText(ctx, forced, styleKey, metrics);
          }
          line.segments.push({
            kind: "text",
            text: forced,
            width: forcedW,
            style: { bold: run.bold, italic: run.italic },
          });
          cursorW += forcedW;
          remaining = remaining.slice(forced.length);
          if (remaining.length > 0) {
            pushLine();
          }
          continue;
        }

        // Otherwise move to a fresh line and try again.
        pushLine();
        continue;
      }

      // Place the piece (with hyphen if needed)
      const pieceText = chunk.addHyphen ? chunk.first + "-" : chunk.first;
      const pieceW = this.measureText(ctx, pieceText, styleKey, metrics);

      line.segments.push({
        kind: "text",
        text: pieceText,
        width: pieceW,
        style: { bold: run.bold, italic: run.italic },
      });
      cursorW += pieceW;

      if (chunk.rest.length === 0) {
        // Finished the word on this line.
        remaining = "";
        break;
      }

      // More remains -> push current line and continue on a fresh line.
      pushLine();
      remaining = chunk.rest;
      // limit already set to maxWidth by pushLine()
    }

    return { line, cursorW };
  }

  // --------------------------- Icon baseline ---------------------------

  private iconBaselinePosition(baselineY: number, metrics: Metrics, height: number): { drawY: number } {
    const ascent = metrics.fontSize * 0.8;
    const descent = metrics.fontSize * 0.2;
    let drawY = baselineY - height;

    if (metrics.iconBaseline === "text") {
      drawY = baselineY - ascent;
    } else if (metrics.iconBaseline === "middle") {
      const mid = baselineY - (ascent - descent) / 2;
      drawY = mid - height / 2;
    } else if (metrics.iconBaseline === "bottom") {
      drawY = baselineY - height + descent * 0.2;
    }
    return { drawY };
  }
}
