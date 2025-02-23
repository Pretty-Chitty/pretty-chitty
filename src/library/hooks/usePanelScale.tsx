import React, { useContext, createContext, ReactNode, useState } from "react";

const PanelScaleContext = createContext<{ scale: number; setScale: (n: number) => void }>({
  scale: 1,
  setScale: () => {},
});

export function usePanelScale(): number {
  return useContext(PanelScaleContext).scale;
}
export function usePanelSetScale(): (n: number) => void {
  return useContext(PanelScaleContext).setScale;
}

export function PanelScaleProvider({ children }: { children: ReactNode }) {
  const initialScale = parseFloat(localStorage["panelScale"] ?? "1") || 1;
  const [scale, setScaleState] = useState<number>(initialScale);
  const setScale = (n: number) => {
    localStorage["panelScale"] = n;
    setScaleState(n);
  };
  return <PanelScaleContext.Provider value={{ scale, setScale }}>{children}</PanelScaleContext.Provider>;
}
