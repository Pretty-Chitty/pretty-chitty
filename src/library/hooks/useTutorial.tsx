import React, { createContext, ReactNode, useContext, useMemo, useState } from "react";
import { EventChannel } from "../utilities/EventChannel";
import { TutorialSpec } from "../game/tutorial/defineTutorial";
import { TutorialController, TutorialEvent } from "../game/tutorial/TutorialController";
import { TutorialRuntime } from "../game/tutorial/TutorialRuntime";
import { TutorialTheme } from "../game/tutorial/TutorialTheme";
import { MatchAiControls } from "../game/Match";

export type TutorialDevSettings = {
  showTargetRects: boolean;
};

export type TutorialContextValue = {
  spec: TutorialSpec<any, any>;
  runtime: TutorialRuntime<any, any>;
  themeOverrides?: Partial<TutorialTheme>;
  ai?: MatchAiControls;
  onEvent?: (e: TutorialEvent) => void;
  /** Set by the overlay once it has built the controller (it needs the match view, which lives inside MatchViewer) */
  controller: EventChannel<TutorialController<any, any> | undefined>;
  dev: EventChannel<TutorialDevSettings>;
  /** Start muted (dev panel toggle) */
  muted: EventChannel<boolean>;
  /** Step to start on (dev panel restarts, rewinds) */
  startAt: number;
  /** Start the script without the Start tap (after a rewind or a dev restart) */
  autoStart: boolean;
  /** Start held (after Back): silent until the player presses Play */
  startPaused: boolean;
  /** Serializes the match for a step snapshot; undefined when the host cannot rebuild the match */
  snapshot?: () => unknown;
  /** Puts the match back to the snapshot taken when `stepId` went live; false when there is none */
  rewind?: (stepId: string) => Promise<boolean>;
};

const TutorialContext = createContext<TutorialContextValue | undefined>(undefined);

/** The running tutorial, or undefined when the match has none. */
export function useTutorial(): TutorialContextValue | undefined {
  return useContext(TutorialContext);
}

export function TutorialProvider({
  spec,
  runtime,
  themeOverrides,
  ai,
  onEvent,
  startAt = 0,
  autoStart = false,
  startPaused = false,
  snapshot,
  rewind,
  children,
}: {
  spec: TutorialSpec<any, any>;
  runtime: TutorialRuntime<any, any>;
  themeOverrides?: Partial<TutorialTheme>;
  ai?: MatchAiControls;
  onEvent?: (e: TutorialEvent) => void;
  startAt?: number;
  autoStart?: boolean;
  startPaused?: boolean;
  snapshot?: () => unknown;
  rewind?: (stepId: string) => Promise<boolean>;
  children: ReactNode;
}) {
  const [controller] = useState(() => new EventChannel<TutorialController<any, any> | undefined>(undefined));
  const [dev] = useState(() => new EventChannel<TutorialDevSettings>({ showTargetRects: false }));
  const [muted] = useState(() => new EventChannel<boolean>(false));
  const value = useMemo<TutorialContextValue>(
    () => ({ spec, runtime, themeOverrides, ai, onEvent, controller, dev, muted, startAt, autoStart, startPaused, snapshot, rewind }),
    [spec, runtime, themeOverrides, ai, onEvent, controller, dev, muted, startAt, autoStart, startPaused, snapshot, rewind],
  );
  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
}
