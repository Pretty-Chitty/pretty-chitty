import React, { createContext, useContext, useEffect, useState } from "react";
import { Chit } from "../game/Chit";
import { EventChannel } from "../utilities/EventChannel";

/**
 * Lets something outside the panels (the tutorial overlay) bring a chit on screen: switch the tab stack
 * that holds its panel, and leave a zoomed-in panel. Provided by `PanelContents`.
 */
export interface PanelNavigation {
  /** Resolves once the panel holding the chit is in front (after the slide), or false if it has no panel. */
  revealChit(chit: Chit): Promise<boolean>;
  /** Panel roots (chits that own a viewer) currently laid out, in layout order */
  panelRoots(): Chit[];
  /** @internal MultiPanel registers how to bring each of its panels to the front */
  registerSelector(chitId: string, select: () => void): () => void;
  /** @internal */
  isFront(chitId: string): boolean;
  /**
   * Keeps the panel holding `chit` in front for a while (it is in front already): its tab group does
   * not jump to another panel just because something changed there.
   */
  keepFront(chit: Chit): void;
  /** The panel shown full screen, with every panel as a tab (the player zoomed in, or a tutorial focused it) */
  focusedPanel(): Chit | undefined;
  /**
   * Shows the panel holding `chit` full screen, as zooming in does (undefined: back to the normal
   * layout). Resolves after the slide, or false if the chit has no panel.
   */
  focusPanelOf(chit: Chit | undefined): Promise<boolean>;
}

export const PanelNavigationContext = createContext<PanelNavigation | undefined>(undefined);

/**
 * Where `PanelContents` leaves its navigation for components that are not inside it (the tutorial
 * overlay is a sibling of the panels, not a child). Provided by the match viewer.
 */
const PanelNavigationHolderContext = createContext<EventChannel<PanelNavigation | undefined> | undefined>(undefined);

/** @internal Wraps a viewer so that anything in it can reach the panels' navigation */
export function PanelNavigationHolder({ children }: { children: React.ReactNode }) {
  const [holder] = useState(() => new EventChannel<PanelNavigation | undefined>(undefined));
  return <PanelNavigationHolderContext.Provider value={holder}>{children}</PanelNavigationHolderContext.Provider>;
}

/** @internal `PanelContents` publishes its navigation to the viewer's holder */
export function usePublishPanelNavigation(navigation: PanelNavigation) {
  const holder = useContext(PanelNavigationHolderContext);
  useEffect(() => {
    if (!holder) return;
    holder.value = navigation;
    return () => {
      if (holder.value === navigation) holder.value = undefined;
    };
  }, [holder, navigation]);
}

/** The panels' navigation, from inside the panels or from anywhere else in the viewer */
export function usePanelNavigation(): PanelNavigation | undefined {
  const direct = useContext(PanelNavigationContext);
  const holder = useContext(PanelNavigationHolderContext);
  const [held, setHeld] = useState(holder?.value);
  useEffect(() => (holder ? holder.on(setHeld) : undefined), [holder]);
  return direct ?? held;
}
