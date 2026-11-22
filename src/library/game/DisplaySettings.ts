import { GameTheme } from "./GameTheme";

/** The parts of the match screen a player can size on their own */
export type DisplaySection = "panelLayout" | "panelPadding" | "topBar" | "actionLog" | "bottomBar";

/** A step per section: 0 (smallest) to 4 (biggest), 2 being the game's own theme */
export type DisplaySettings = Record<DisplaySection, number>;

export const DISPLAY_STEP_COUNT = 5;
export const NORMAL_STEP = 2;
export const DISPLAY_STEP_LABELS = ["Smallest", "Smaller", "Normal", "Bigger", "Biggest"];

export const DISPLAY_SECTIONS: { key: DisplaySection; label: string; smallerHint: string; biggerHint: string }[] = [
  { key: "panelLayout", label: "Panel Layout", smallerHint: "More panels", biggerHint: "Bigger panels" },
  { key: "panelPadding", label: "Panel Padding", smallerHint: "Tighter", biggerHint: "Roomier" },
  { key: "topBar", label: "Top Bar", smallerHint: "Smaller", biggerHint: "Bigger" },
  { key: "actionLog", label: "Action Log", smallerHint: "Smaller", biggerHint: "Bigger" },
  { key: "bottomBar", label: "Bottom Bar", smallerHint: "Smaller", biggerHint: "Bigger" },
];

/**
 * What each step multiplies the theme's sizes by. Panel layout is the odd one out: it is the scale
 * the layout is worked out at, where a higher scale fits more (smaller) panels on screen, so it
 * runs downwards as the panels get bigger.
 */
const MULTIPLIERS: Record<DisplaySection, number[]> = {
  panelLayout: [1.8, 1.35, 1, 0.8, 0.65],
  panelPadding: [0.25, 0.5, 1, 1.75, 2.5],
  topBar: [0.75, 0.875, 1, 1.2, 1.4],
  actionLog: [0.8, 0.9, 1, 1.2, 1.4],
  bottomBar: [0.7, 0.85, 1, 1.15, 1.3],
};

/**
 * Animation playback speeds, slowest to fastest: one step below normal (the default) and three
 * doublings above it, up to 8x.
 */
export const ANIMATION_SPEEDS = [0.5, 1, 2, 4, 8];

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  panelLayout: NORMAL_STEP,
  panelPadding: NORMAL_STEP,
  topBar: NORMAL_STEP,
  actionLog: NORMAL_STEP,
  bottomBar: NORMAL_STEP,
};

const STORAGE_KEY = "displaySettings";
/** The free-form panel scale that came before these settings */
const LEGACY_PANEL_SCALE_KEY = "panelScale";

function clampStep(step: unknown): number {
  const n = typeof step === "number" && Number.isFinite(step) ? Math.round(step) : NORMAL_STEP;
  return Math.max(0, Math.min(DISPLAY_STEP_COUNT - 1, n));
}

/** The index of the value in `values` nearest to `value`, measured as a ratio (they are all scales) */
function nearestIndex(values: number[], value: number): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    if (Math.abs(Math.log(values[i] / value)) < Math.abs(Math.log(values[best] / value))) {
      best = i;
    }
  }
  return best;
}

export function sectionMultiplier(section: DisplaySection, settings: DisplaySettings): number {
  return MULTIPLIERS[section][clampStep(settings[section])];
}

/** The animation speed step nearest to a duration multiplier (1 / speed), as `ClientTimeState` keeps it */
export function animationSpeedStep(durationMultiplier: number): number {
  return nearestIndex(ANIMATION_SPEEDS, 1 / (durationMultiplier || 1));
}

/** The step every section shares, or undefined when they have been set individually */
export function overallStep(settings: DisplaySettings): number | undefined {
  const steps = DISPLAY_SECTIONS.map((s) => settings[s.key]);
  return steps.every((s) => s === steps[0]) ? steps[0] : undefined;
}

export function allAtStep(step: number): DisplaySettings {
  const result = { ...DEFAULT_DISPLAY_SETTINGS };
  for (const { key } of DISPLAY_SECTIONS) {
    result[key] = clampStep(step);
  }
  return result;
}

export function loadDisplaySettings(storage: Pick<Storage, "getItem"> | undefined): DisplaySettings {
  const result = { ...DEFAULT_DISPLAY_SETTINGS };
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const { key } of DISPLAY_SECTIONS) {
        result[key] = clampStep(parsed?.[key]);
      }
      return result;
    }
    const legacyScale = parseFloat(storage?.getItem(LEGACY_PANEL_SCALE_KEY) ?? "");
    if (legacyScale > 0) {
      result.panelLayout = nearestIndex(MULTIPLIERS.panelLayout, legacyScale);
    }
  } catch {
    // unreadable storage: everything stays at the game's own sizes
  }
  return result;
}

export function saveDisplaySettings(storage: Pick<Storage, "setItem"> | undefined, settings: DisplaySettings) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable: the setting lasts until the page closes
  }
}

/**
 * A copy of `theme` with the sizes that belong to `section` multiplied by the player's setting for
 * it. Returns `theme` itself when the section is at its normal size.
 */
export function scaledTheme(theme: GameTheme, section: DisplaySection, settings: DisplaySettings): GameTheme {
  const m = sectionMultiplier(section, settings);
  if (m === 1 || section === "panelLayout") {
    return theme;
  }
  // Copy the fields onto the same prototype, so getters (fontFamily) and methods still work and
  // no setter runs
  const result: GameTheme = Object.assign(Object.create(Object.getPrototypeOf(theme)), theme);
  switch (section) {
    case "panelPadding":
      result.panelSpacing = theme.getPanelSpacing() * m;
      break;
    case "topBar":
      result.topBarHeight = theme.topBarHeight * m;
      result.fontScalar = theme.fontScalar * m;
      result.spacing = theme.spacing * m;
      break;
    case "actionLog":
      result.fontScalar = theme.fontScalar * m;
      result.actionLogSidebarWidth = theme.actionLogSidebarWidth * m;
      break;
    case "bottomBar":
      result.bottomBarHeight = theme.bottomBarHeight * m;
      result.bottomBarFontScalar = theme.bottomBarFontScalar * m;
      result.bottomBarIconSize = theme.bottomBarIconSize * m;
      result.spacing = theme.spacing * m;
      break;
  }
  return result;
}
