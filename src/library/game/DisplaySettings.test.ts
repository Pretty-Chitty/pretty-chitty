import { describe, expect, it } from "vitest";
import { GameTheme } from "./GameTheme";
import {
  DEFAULT_DISPLAY_SETTINGS,
  allAtStep,
  animationSpeedStep,
  loadDisplaySettings,
  overallStep,
  scaledTheme,
  sectionMultiplier,
} from "./DisplaySettings";

function storage(values: Record<string, string>) {
  return { getItem: (key: string) => values[key] ?? null };
}

describe("DisplaySettings", () => {
  it("leaves the theme alone at normal size", () => {
    const theme = new GameTheme();
    for (const section of ["panelPadding", "topBar", "actionLog", "bottomBar"] as const) {
      expect(scaledTheme(theme, section, DEFAULT_DISPLAY_SETTINGS)).toBe(theme);
    }
  });

  it("scales only the section's own sizes, from the game's theme", () => {
    const theme = GameTheme.withDefaults("#224466", "#ff8800");
    theme.topBarHeight = 50;
    theme.fontFamily = "Serif";
    const bigger = allAtStep(4);

    const top = scaledTheme(theme, "topBar", bigger);
    expect(top).toBeInstanceOf(GameTheme);
    expect(top.topBarHeight).toBeCloseTo(70);
    expect(top.bottomBarHeight).toBe(theme.bottomBarHeight);
    expect(top.barColor).toBe(theme.barColor);
    expect(top.fontFamily).toBe("Serif");
    expect(theme.topBarHeight).toBe(50);

    const bottom = scaledTheme(theme, "bottomBar", allAtStep(0));
    expect(bottom.bottomBarHeight).toBeLessThan(theme.bottomBarHeight);
    expect(bottom.bottomBarIconSize).toBeLessThan(theme.bottomBarIconSize);
  });

  it("scales the panel gap without touching spacing used inside panels", () => {
    const theme = new GameTheme();
    const tight = scaledTheme(theme, "panelPadding", allAtStep(0));
    expect(tight.getPanelSpacing()).toBeLessThan(theme.spacing);
    expect(tight.spacing).toBe(theme.spacing);
  });

  it("fits fewer panels as the layout gets bigger", () => {
    expect(sectionMultiplier("panelLayout", allAtStep(0))).toBeGreaterThan(1);
    expect(sectionMultiplier("panelLayout", allAtStep(4))).toBeLessThan(1);
  });

  it("knows when every section is at the same step", () => {
    expect(overallStep(allAtStep(3))).toBe(3);
    expect(overallStep({ ...allAtStep(3), topBar: 1 })).toBeUndefined();
  });

  it("loads saved settings, clamping bad values", () => {
    const loaded = loadDisplaySettings(storage({ displaySettings: JSON.stringify({ topBar: 9, actionLog: 1 }) }));
    expect(loaded).toEqual({ ...DEFAULT_DISPLAY_SETTINGS, topBar: 4, actionLog: 1 });
    expect(loadDisplaySettings(storage({ displaySettings: "not json" }))).toEqual(DEFAULT_DISPLAY_SETTINGS);
  });

  it("carries over the old free-form panel scale", () => {
    expect(loadDisplaySettings(storage({ panelScale: "1" })).panelLayout).toBe(2);
    expect(loadDisplaySettings(storage({ panelScale: "3" })).panelLayout).toBe(0);
    expect(loadDisplaySettings(storage({ panelScale: "0.5" })).panelLayout).toBe(4);
  });

  it("maps animation duration multipliers to the nearest speed", () => {
    expect(animationSpeedStep(1)).toBe(1);
    expect(animationSpeedStep(1 / 8)).toBe(4);
    expect(animationSpeedStep(1 / 4)).toBe(3);
    expect(animationSpeedStep(1 / 2)).toBe(2);
    expect(animationSpeedStep(4)).toBe(0);
  });
});
