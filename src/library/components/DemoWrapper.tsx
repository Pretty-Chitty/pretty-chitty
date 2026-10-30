import React, { useCallback, useEffect, useRef, useState } from "react";

import { Chit } from "../game/Chit";
import { MatchViewer } from "./MatchViewer";
import { Game } from "../game/Game";
import { GameProvider } from "../hooks/useGame";
import { ConnectionProvider } from "../hooks/useConnection";
import { Connection } from "../game/Connection";
import { LocalConnectionTransport } from "../game/ConnectionTransport";
import { Match } from "../game/Match";
import { PlayerProvider } from "../hooks/usePlayer";
import { LoadingStateProvider, LoadingStates } from "../hooks/useLoadingStates";
import { TutorialSpec, findTutorial } from "../game/tutorial/defineTutorial";
import { createDemoMatch, DemoMatch } from "../game/tutorial/createDemoMatch";
import { TutorialProvider } from "../hooks/useTutorial";
import { TutorialTheme } from "../game/tutorial/TutorialTheme";
import { TutorialEvent } from "../game/tutorial/TutorialController";

export interface IChitLibrary {
  [key: string]: new () => Chit;
}

function PlayerEditor({
  playerId,
  match,
  onBack,
  skipReplay,
}: {
  onBack?: () => void;
  playerId: string;
  match: Match<any, any>;
  skipReplay?: boolean;
}) {
  const [localConnection, setLocalConnection] = useState<Connection | undefined>();

  useEffect(() => {
    const newRemoteConnection = new LocalConnectionTransport();
    const newConnection = new Connection(new LocalConnectionTransport());
    (newConnection.transport as LocalConnectionTransport).connect(newRemoteConnection);
    match.connect(newRemoteConnection, playerId);

    setLocalConnection(newConnection);
    return () => {
      newConnection.dispose();
    };
  }, [match, playerId]);

  if (!localConnection) {
    return null;
  }

  return (
    <ConnectionProvider connection={localConnection}>
      <PlayerProvider playerId={playerId}>
        <MatchViewer onBack={onBack} skipReplay={skipReplay} />
      </PlayerProvider>
    </ConnectionProvider>
  );
}

export type DemoWrapperProps = {
  game: Game<any, any>;
  /**
   * Run a tutorial: its id (looked up on `game.tutorials`, with `locale` when given) or the spec
   * itself. Without one this is a plain demo game: the same match, no overlay.
   */
  tutorial?: string | TutorialSpec<any, any>;
  locale?: string;
  /** Colour overrides for the overlay, on top of the game's and the spec's */
  tutorialTheme?: Partial<TutorialTheme>;
  onTutorialEvent?: (e: TutorialEvent) => void;
  /** Shown as the back button; with a tutorial whose last step ends with "back", called when it finishes */
  onBack?: () => void;
  /** Start the tutorial at this step (the Playground's "restart at step") */
  startAt?: number;
  /** Rendered alongside the match once it exists (the Playground's dev panel) */
  children?: React.ReactNode;
};

/**
 * Runs a demo game in this tab: an ephemeral match with one human seat and a bot in every other
 * seat. With `tutorial`, the same match runs the given script on top. A demo is a tutorial with no
 * steps, so both go through `createDemoMatch`.
 */
export function DemoWrapper({
  game,
  tutorial,
  locale,
  tutorialTheme,
  onTutorialEvent,
  onBack,
  startAt = 0,
  children,
}: DemoWrapperProps) {
  const [loadingStates] = useState<LoadingStates>(new LoadingStates());
  const [demo, setDemo] = useState<DemoMatch<any, any> | null>(null);
  const demoRef = useRef<DemoMatch<any, any> | null>(null);
  // Where the script (re)starts and whether it needs the Start tap: a rewind restarts at the step it
  // went back to, without the tap
  const [start] = useState<{ at: number; auto: boolean; paused: boolean }>({
    at: startAt,
    auto: false,
    paused: false,
  });

  const spec = typeof tutorial === "string" ? findTutorial(game, tutorial, locale) : tutorial;
  if (typeof tutorial === "string" && !spec) {
    console.warn(`Tutorial "${tutorial}" not found on ${game.metadata.name}; running a plain demo`);
  }

  useEffect(() => {
    let cancelled = false;
    createDemoMatch(game, spec).then((d) => {
      if (cancelled) {
        d.match.dispose();
        return;
      }
      demoRef.current?.match.dispose();
      demoRef.current = d;
      d.match.start();
      setDemo(d);
    });
    return () => {
      cancelled = true;
      demoRef.current?.match.dispose();
      demoRef.current = null;
    };
  }, [game, spec]);

  // Back in a tutorial: put the match back to the snapshot taken when that step went live. The
  // match reruns from it in place (saved decisions replay deterministically; the pinned draws and
  // forced moves rewind with it) and the viewer animates to the old board without remounting.
  const snapshot = useCallback(() => JSON.parse(JSON.stringify(demoRef.current?.match.state ?? {})), []);
  const rewind = useCallback(async (stepId: string) => {
    const current = demoRef.current;
    if (!current) return false;
    const state = current.runtime.restoreSnapshot(stepId);
    if (state === undefined) return false;
    await current.replaceState(state);
    return true;
  }, []);

  if (!demo) {
    return null;
  }

  const onFinished = (e: TutorialEvent) => {
    onTutorialEvent?.(e);
    if (e.type === "completed" && e.end === "back") {
      onBack?.();
    }
  };

  const viewer = (
    <PlayerEditor key={demo.key} playerId={demo.playerId} match={demo.match} onBack={onBack} skipReplay={start.auto} />
  );

  return (
    <LoadingStateProvider loadingStates={loadingStates}>
      <GameProvider game={game}>
        {spec && spec.steps.length > 0 ? (
          <TutorialProvider
            spec={spec}
            runtime={demo.runtime}
            themeOverrides={tutorialTheme}
            ai={demo.match.ai}
            onEvent={onFinished}
            startAt={start.at}
            autoStart={start.auto}
            startPaused={start.paused}
            snapshot={snapshot}
            rewind={rewind}
          >
            {viewer}
            {children}
          </TutorialProvider>
        ) : (
          <>
            {viewer}
            {children}
          </>
        )}
      </GameProvider>
    </LoadingStateProvider>
  );
}
