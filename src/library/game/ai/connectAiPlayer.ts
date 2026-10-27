import { Connection } from "../Connection";
import { LocalConnectionTransport } from "../ConnectionTransport";
import type { Match } from "../Match";
import { PlayerChit } from "../PlayerChit";
import { RootChit } from "../RootChit";
import { ClientStatus } from "../clientTransport/ClientStatus";
import { AiClientPrompts, AiPlayerOptions } from "./AiClientPrompts";
import { AiPlayerView } from "./AiPlayerView";
import { AiLiveView } from "./AiLiveView";

export type ConnectAiPlayerOptions = AiPlayerOptions & {
  /** Max simulated transport latency in ms. Default 0 (the bot is in-process) */
  latencyMs?: number;
  /**
   * How the bot reads the board. "live" (the default, unless the game's AI sets `serializedView`)
   * reads the match's own objects in place: fast, but rules can see hidden information.
   * "serialized" rebuilds exactly what the server sends this seat: fair, but every prompt costs a
   * full redacted snapshot.
   */
  view?: "live" | "serialized";
};

export type AiPlayerHandle = {
  playerId: string;
  prompts: AiClientPrompts<any, any, any>;
  status: ClientStatus<any, any>;
  dispose: () => void;
};

/**
 * Seats an AI player in a match.  The bot connects like any other client, so it only ever sees
 * what the server sends to `playerId`.  Uses `match.game.ai` rules if the game defines them.
 *
 * This is the low-level primitive: it seats exactly one bot with exactly these options, which is
 * what harnesses want (forced moves, per-seat params, a different AI per seat).  Hosts that just
 * want every seat flagged `ai` on its `PlayerInfo` played by the engine call
 * {@link Match.seatAiPlayers} instead; it calls this for each such seat and skips seats already
 * taken by a bot connected here.
 *
 * The bot's plan memory is kept in the match's saved state (see `AiMemoryStore`), so a bot
 * re-seated after a reload continues its plan.  It also follows `match.ai.enabled`.
 *
 * ```ts
 * connectAiPlayer(match, "p2", { params: { weights }, onDecision: log });
 * ```
 *
 * @group AI
 */
export function connectAiPlayer<P extends PlayerChit, R extends RootChit<P>>(
  match: Match<P, R>,
  playerId: string,
  options: ConnectAiPlayerOptions = {},
): AiPlayerHandle {
  const latency = options.latencyMs ?? 0;
  const serverSide = new LocalConnectionTransport(latency);
  const clientSide = new LocalConnectionTransport(latency);
  const connection = new Connection(clientSide);

  const mode = options.view ?? (match.game.ai?.serializedView ? "serialized" : "live");
  const view = mode === "live" ? new AiLiveView(match) : new AiPlayerView(connection, match.game);
  const status = new ClientStatus<any, any>(connection);
  const prompts = new AiClientPrompts<P, R>(playerId, connection, match.game, view, {
    ...options,
    difficulty: options.difficulty ?? match.players.find((p) => p.id === playerId)?.ai?.difficulty,
    memoryStore: options.memoryStore === undefined ? match.aiMemoryStore(playerId) : options.memoryStore,
    disabled: options.disabled || !match.ai.enabled,
  });

  connection.register(view, "ClientTime");
  connection.register(status, "ClientStatus");
  connection.register(prompts, "ClientPrompts");

  clientSide.connect(serverSide);
  const serverConnection = match.connect(serverSide, playerId);

  const handle: AiPlayerHandle = {
    playerId,
    prompts,
    status,
    dispose: () => {
      match.ai.unregister(handle);
      connection.dispose();
      serverConnection.dispose();
    },
  };
  match.ai.register(handle);
  return handle;
}
