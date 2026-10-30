import { Game } from "../Game";
import { Match, SeatAiPlayersOptions } from "../Match";
import { EphemeralMatchStorage, IMatchStorage } from "../MatchStorage";
import { PlayerChit } from "../PlayerChit";
import { PlayerInfo } from "../PlayerInfo";
import { RootChit } from "../RootChit";
import { connectAiPlayer, AiPlayerHandle } from "../ai/connectAiPlayer";
import { TutorialSpec } from "./defineTutorial";
import { TutorialRuntime } from "./TutorialRuntime";

let DEMO_COUNTER = 0;

export type DemoMatch<P extends PlayerChit, R extends RootChit<P>> = {
  /** Unique per built match (a React key for the viewer) */
  key: string;
  match: Match<P, R>;
  /** The seat the person plays */
  playerId: string;
  players: PlayerInfo[];
  runtime: TutorialRuntime<P, R>;
  bots: AiPlayerHandle[];
  /**
   * Puts the running match back to a saved state in place: the match reruns from it (the same path
   * another tab's moves take in client-trust mode) and connected viewers animate to the new board
   * instead of remounting.
   */
  replaceState: (state: unknown) => Promise<void>;
};

export type CreateDemoMatchOptions = {
  storage?: IMatchStorage;
  /** Overrides the spec's bot options (think time, logging…) */
  ai?: SeatAiPlayersOptions;
  /** Headless runs: see `Match.immediateNotify` */
  immediateNotify?: boolean;
  /** Name for the human seat when the spec does not list players. Default "You" */
  humanName?: string;
  /** Rebuilding after a rewind: keep this runtime (its queues were rewound by `restoreSnapshot`) */
  runtime?: TutorialRuntime<any, any>;
  /** Rebuilding after a rewind: the saved match state to replay up to */
  state?: unknown;
};

/**
 * Builds the match a demo or a tutorial runs: ephemeral storage, one human seat, a bot in every other
 * seat, the spec's match options and pinned draws, and the bots' forced moves. With no spec this is
 * exactly what the demo did before tutorials existed. The match is loaded and seated but not started.
 *
 * @group Tutorials
 */
export async function createDemoMatch<P extends PlayerChit, R extends RootChit<P>>(
  game: Game<P, R>,
  spec?: TutorialSpec<P, R>,
  options: CreateDemoMatchOptions = {},
): Promise<DemoMatch<P, R>> {
  const tempRoot = new game.chitLibrary.Root() as R;
  const defaultCount = tempRoot.setupDemoGame();
  const matchOptions = spec?.match?.options ?? tempRoot.getCurrentlySelectedMatchOptions();

  const seats = spec?.match?.players;
  const humanSeat = spec?.match?.humanSeat ?? 0;
  const players: PlayerInfo[] = [];
  if (seats && seats.length > 0) {
    seats.forEach((seat, i) => {
      const info = new PlayerInfo(`p${i}`, seat.name);
      info.imageUrl = seat.imageUrl ?? info.imageUrl;
      info.ai = i === humanSeat ? undefined : (seat.ai ?? {});
      players.push(info);
    });
  } else {
    for (let i = 0; i < defaultCount; i++) {
      const info = new PlayerInfo(`p${i}`, i === humanSeat ? (options.humanName ?? "You") : `Robot ${i}`);
      info.ai = i === humanSeat ? undefined : {};
      players.push(info);
    }
  }
  const playerId = players[Math.min(humanSeat, players.length - 1)].id;

  const runtime = (options.runtime as TutorialRuntime<P, R> | undefined) ?? new TutorialRuntime<P, R>(spec);
  const storage = options.storage ?? new EphemeralMatchStorage(`demo-${spec?.id ?? "game"}-${Date.now()}`);
  if (options.state !== undefined) {
    await storage.saveState(options.state, [], "active");
  }
  const match = new Match<P, R>(game, players, storage, matchOptions, { rngSource: runtime.rngSource });
  if (options.immediateNotify) {
    match.immediateNotify = true;
  }
  await match.load();

  const aiOptions: SeatAiPlayersOptions = {
    temperature: 0,
    thinkMs: [500, 900],
    ...(spec?.match?.ai ?? {}),
    ...(options.ai ?? {}),
  };
  const bots = players
    .filter((p) => p.ai)
    .map((p) =>
      connectAiPlayer(match, p.id, {
        ...aiOptions,
        ...runtime.aiOptionsFor(p.id),
        difficulty: p.ai?.difficulty,
      }),
    );
  runtime.attachBots(bots);

  const replaceState = async (state: unknown) => {
    const notifying = storage as IMatchStorage & {
      saveState(s: any, p: any[], m: "active" | "finished", w?: any[], notify?: boolean): Promise<void>;
    };
    await notifying.saveState(JSON.parse(JSON.stringify(state)), [], "active", undefined, true);
  };

  return { key: `demo-${++DEMO_COUNTER}`, match, playerId, players, runtime, bots, replaceState };
}
