import Color from "color";
import { GameTheme } from "../GameTheme";

/**
 * Colours and type for the tutorial overlay. Defaults are derived from the game's theme; a game can
 * set `GameTheme.tutorial`, a spec can set `theme`, and a host can pass `tutorialTheme`, in that order
 * of precedence (last wins).
 *
 * @group Tutorials
 */
export type TutorialTheme = {
  boxBackground: string;
  boxTextColor: string;
  /** Buttons, progress, the emphasised sentence */
  accent: string;
  boxShadow: string;
  borderRadius: number;
  arrowColor: string;
  highlightColor: string;
  highlightGlow: string;
  dimColor: string;
  dimOpacity: number;
  fontFamily: string;
  fontScalar: number;
  /** Width of the box on large screens, in px */
  boxWidth: number;
};

export function defaultTutorialTheme(theme: GameTheme): TutorialTheme {
  const text = theme.barActiveTextColor;
  const accent = theme.chitHighlightColor;
  let background: string;
  try {
    background = Color(theme.barColor).alpha(0.96).hexa();
  } catch {
    background = "rgba(20,20,30,0.96)";
  }
  return {
    boxBackground: background,
    boxTextColor: text,
    accent,
    boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
    borderRadius: 14,
    arrowColor: accent,
    highlightColor: accent,
    highlightGlow: (() => {
      try {
        return Color(accent).alpha(0.55).hexa();
      } catch {
        return accent;
      }
    })(),
    dimColor: "#000000",
    dimOpacity: 0.55,
    fontFamily: theme.fontFamily,
    fontScalar: theme.fontScalar,
    boxWidth: 360,
    ...(theme.tutorial ?? {}),
  };
}

export function resolveTutorialTheme(
  gameTheme: GameTheme,
  ...overrides: (Partial<TutorialTheme> | undefined)[]
): TutorialTheme {
  return overrides.reduce<TutorialTheme>((acc, o) => ({ ...acc, ...(o ?? {}) }), defaultTutorialTheme(gameTheme));
}
