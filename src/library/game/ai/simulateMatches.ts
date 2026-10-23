import { Game } from "../Game";
import { Match } from "../Match";
import { EphemeralMatchStorage } from "../MatchStorage";
import { PlayerChit } from "../PlayerChit";
import { PlayerInfo } from "../PlayerInfo";
import { RootChit } from "../RootChit";
import { AiPlayerStats } from "./AiClientPrompts";
import { AiPlayerHandle, connectAiPlayer } from "./connectAiPlayer";

export type SimulateMatchesOptions = {
  /** Number of seats. Default: whatever `Root.setupDemoGame()` returns */
  players?: number;
  /** Number of matches to play. Default 1 */
  games?: number;
  /** Stop a match after this many answered prompts (all bots combined). Default 5000 */
  maxPrompts?: number;
  /** Stop a match if nothing happens for this long. Default 5000ms */
  stallMs?: number;
  /** Stop a match after this long. Default 120000ms */
  timeoutMs?: number;
  /** Options passed to the match. Default: `Root.getCurrentlySelectedMatchOptions()` after `setupDemoGame()` */
  matchOptions?: any;
  difficulty?: number;
  /** Let bots log untagged prompts and warnings. Default false */
  log?: boolean;
  /** How the bots read the board (see ConnectAiPlayerOptions.view). Default: the game's choice */
  view?: "live" | "serialized";
};

export type SimulatedMatch = {
  outcome: "finished" | "stalled" | "error" | "maxPrompts" | "timeout";
  prompts: number;
  durationMs: number;
  winners: string[];
  error?: string;
  stats: { [playerId: string]: AiPlayerStats };
};

export type SimulationReport = {
  matches: SimulatedMatch[];
  finished: number;
  averagePrompts: number;
  stepBacks: number;
  rejections: number;
  stalls: number;
  stuck: number;
  ruleErrors: number;
  /** Untagged pick messages the bots hit, with counts: a to-do list for writing rules */
  untagged: { [message: string]: number };
};

/**
 * Plays whole matches with an AI in every seat, headlessly, and reports whether they finish.
 * Use it in a test to check that a game's AI never gets stuck:
 *
 * ```ts
 * test("bots can finish a game", async () => {
 *   const report = await simulateMatches(new MyGame(), { players: 3, games: 5 });
 *   expect(report.finished).toBe(5);
 * });
 * ```
 *
 * @group AI
 */
export async function simulateMatches<P extends PlayerChit, R extends RootChit<P>>(
  game: Game<P, R>,
  options: SimulateMatchesOptions = {},
): Promise<SimulationReport> {
  const matches: SimulatedMatch[] = [];
  for (let i = 0; i < (options.games ?? 1); i++) {
    matches.push(await simulateOne(game, options, i));
  }

  const all = matches.flatMap((m) => Object.values(m.stats));
  const sum = (f: (s: AiPlayerStats) => number) => all.reduce((acc, s) => acc + f(s), 0);
  const untagged: { [message: string]: number } = {};
  all.forEach((s) =>
    Object.entries(s.untagged).forEach(([message, count]) => (untagged[message] = (untagged[message] ?? 0) + count)),
  );

  return {
    matches,
    finished: matches.filter((m) => m.outcome === "finished").length,
    averagePrompts: matches.length ? matches.reduce((acc, m) => acc + m.prompts, 0) / matches.length : 0,
    stepBacks: sum((s) => s.stepBacks),
    rejections: sum((s) => s.rejections),
    stalls: sum((s) => s.stalls),
    stuck: sum((s) => s.stuck),
    ruleErrors: sum((s) => s.ruleErrors),
    untagged,
  };
}

async function simulateOne<P extends PlayerChit, R extends RootChit<P>>(
  game: Game<P, R>,
  options: SimulateMatchesOptions,
  index: number,
): Promise<SimulatedMatch> {
  const started = Date.now();
  const tempRoot = new game.chitLibrary.Root() as R;
  const defaultPlayers = tempRoot.setupDemoGame();
  const matchOptions = options.matchOptions ?? tempRoot.getCurrentlySelectedMatchOptions();

  const players: PlayerInfo[] = [];
  for (let i = 0; i < (options.players ?? defaultPlayers); i++) {
    const info = new PlayerInfo(`p${i}`, `Bot ${i + 1}`);
    info.ai = { difficulty: options.difficulty };
    players.push(info);
  }

  const match = new Match(game, players, new EphemeralMatchStorage(`simulation-${index}`, true), matchOptions);
  match.immediateNotify = true; // headless: see Match.immediateNotify
  await match.load();

  const stallMs = options.stallMs ?? 5000;
  const bots: AiPlayerHandle[] = players.map((p) =>
    connectAiPlayer(match, p.id, { log: options.log ?? false, stallWarningMs: stallMs, view: options.view }),
  );
  const prompts = () => bots.reduce((acc, b) => acc + b.prompts.stats.promptsAnswered, 0);
  const progress = () => bots.reduce((acc, b) => acc + b.prompts.stats.promptsAnswered + b.prompts.stats.stepBacks, 0);

  let error: string | undefined;
  const run = match.start().catch((e) => {
    error = e instanceof Error ? e.message : String(e);
  });

  const outcome = await new Promise<SimulatedMatch["outcome"]>((resolve) => {
    let lastProgress = -1;
    let lastProgressAt = Date.now();
    const timer = setInterval(() => {
      const finish = (o: SimulatedMatch["outcome"]) => {
        clearInterval(timer);
        resolve(o);
      };
      if (match.result.value) return finish("finished");
      if (error || match.errorState.value) return finish("error");
      if (prompts() > (options.maxPrompts ?? 5000)) return finish("maxPrompts");
      if (Date.now() - started > (options.timeoutMs ?? 120000)) return finish("timeout");

      const p = progress();
      if (p !== lastProgress) {
        lastProgress = p;
        lastProgressAt = Date.now();
      } else if (Date.now() - lastProgressAt > stallMs && bots.every((b) => b.prompts.idle || b.prompts.stalled)) {
        // Idle bots have nothing to answer; stalled ones answered and the server never reacted
        return finish("stalled");
      }
    }, 20);
  });

  if (outcome === "finished") {
    await run;
  }

  // Let in-flight answers settle so disposing doesn't reject them mid-flight
  const settleUntil = Date.now() + 1000;
  while (Date.now() < settleUntil && !bots.every((b) => b.prompts.idle || b.prompts.stalled)) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  await new Promise((resolve) => setTimeout(resolve, 10));

  const result: SimulatedMatch = {
    outcome,
    prompts: prompts(),
    durationMs: Date.now() - started,
    winners: match.result.value?.winners.map((w) => w.id ?? "") ?? [],
    error: error ?? match.errorState.value,
    stats: Object.fromEntries(bots.map((b) => [b.playerId, b.prompts.stats])),
  };
  bots.forEach((b) => b.dispose());
  return result;
}
