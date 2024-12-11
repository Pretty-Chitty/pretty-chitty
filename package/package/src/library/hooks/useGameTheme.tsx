import React, { useContext, createContext, ReactNode } from 'react';

import { GameTheme as Theme } from '../game/GameTheme';

const ThemeContext = createContext<Theme>(new Theme());

export function useGameTheme(): Theme {
  return useContext(ThemeContext);
}

export function GameThemeProvider({ theme, children }: { theme: Theme; children: ReactNode }) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
