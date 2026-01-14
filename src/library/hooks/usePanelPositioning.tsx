import { createContext, useContext } from "react";

export interface ViewerPosition {
  chitId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  paused: boolean;
  front: boolean;
  panCallback?: (direction: "left" | "right") => void;
  visible: boolean; // For MultiPanel sliding animations
  transition?: string | null; // CSS transition for animated position changes
}

interface PanelPositioningContextValue {
  positions: Map<string, ViewerPosition>;
  registerPosition: (chitId: string, position: ViewerPosition) => void;
  unregisterPosition: (chitId: string) => void;
}

export const PanelPositioningContext = createContext<PanelPositioningContextValue | null>(null);

export function usePanelPositioning() {
  const context = useContext(PanelPositioningContext);
  if (!context) {
    throw new Error("usePanelPositioning must be used within PanelPositioningContext.Provider");
  }
  return context;
}
