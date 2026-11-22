import React, { useContext, createContext, ReactNode, useState, useMemo, useCallback } from "react";
import {
  DEFAULT_DISPLAY_SETTINGS,
  DisplaySection,
  DisplaySettings,
  loadDisplaySettings,
  saveDisplaySettings,
  scaledTheme,
  sectionMultiplier,
} from "../game/DisplaySettings";
import { GameThemeProvider, useGameTheme } from "./useGameTheme";

function browserStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

const DisplaySettingsContext = createContext<{
  settings: DisplaySettings;
  setSettings: (settings: DisplaySettings) => void;
}>({
  settings: DEFAULT_DISPLAY_SETTINGS,
  setSettings: () => {},
});

export function useDisplaySettings(): [DisplaySettings, (settings: DisplaySettings) => void] {
  const { settings, setSettings } = useContext(DisplaySettingsContext);
  return [settings, setSettings];
}

/** The scale the panel layout is worked out at: above 1 fits more panels on screen, below 1 fewer */
export function usePanelScale(): number {
  return sectionMultiplier("panelLayout", useContext(DisplaySettingsContext).settings);
}

export function DisplaySettingsProvider({ children }: { children: ReactNode }) {
  // Not per game: a player's screen and eyesight are the same whatever they play
  const [settings, setSettingsState] = useState<DisplaySettings>(() => loadDisplaySettings(browserStorage()));
  const setSettings = useCallback((next: DisplaySettings) => {
    saveDisplaySettings(browserStorage(), next);
    setSettingsState(next);
  }, []);
  const value = useMemo(() => ({ settings, setSettings }), [settings, setSettings]);
  return <DisplaySettingsContext.Provider value={value}>{children}</DisplaySettingsContext.Provider>;
}

/** Gives everything inside the game theme sized by the player's setting for `section` */
export function DisplaySectionTheme({ section, children }: { section: DisplaySection; children: ReactNode }) {
  const theme = useGameTheme();
  const { settings } = useContext(DisplaySettingsContext);
  const sectionStep = settings[section];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scaled = useMemo(() => scaledTheme(theme, section, settings), [theme, section, sectionStep]);
  return <GameThemeProvider theme={scaled}>{children}</GameThemeProvider>;
}
