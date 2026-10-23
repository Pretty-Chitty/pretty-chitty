import { Connection } from "../Connection";
import { LocalConnectionTransport } from "../ConnectionTransport";
import { Match } from "../Match";
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
 * ```ts
 * match.players.filter((p) => p.ai).forEach((p) => connectAiPlayer(match, p.id, p.ai));
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
  });

  connection.register(view, "ClientTime");
  connection.register(status, "ClientStatus");
  connection.register(prompts, "ClientPrompts");

  clientSide.connect(serverSide);
  const serverConnection = match.connect(serverSide, playerId);

  return {
    playerId,
    prompts,
    status,
    dispose: () => {
      connection.dispose();
      serverConnection.dispose();
    },
  };
}
