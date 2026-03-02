import { Connection } from "../Connection";
import { ConnectionObject } from "../ConnectionObject";
import { Match } from "../Match";
import { PlayerChit } from "../PlayerChit";
import { PromptSerialization } from "../Prompt";
import { RootChit } from "../RootChit";
import { ClientPrompts } from "../clientTransport/ClientPrompts";

export class ServerPrompts<P extends PlayerChit, R extends RootChit<P>> extends ConnectionObject {
  private clientPrompts: ClientPrompts<P, R>;
  constructor(
    private playerId: string,
    private match: Match<P, R>,
    private connection: Connection,
  ) {
    super();

    this.clientPrompts = this.connection.get<ClientPrompts<P, R>>("ClientPrompts");

    // I HATE THIS
    // but it's fine? maybe?
    let unsubs: (() => void)[] = [];
    this.register(
      (() => {
        const cb = match.turn.on((newTurn) => {
          unsubs.forEach((cb) => cb());
          unsubs = [];

          if (newTurn) {
            unsubs = newTurn.rootChit.players.map((player) =>
              player.promptStatus.latestPrompt.on((latestPrompt: any) =>
                this.clientPrompts
                  .setPromptForPlayer(
                    player.playerId,
                    latestPrompt?.serialize(),
                    this.match.turn.value?.clockDetails(playerId),
                  )
                  .catch((e: any) => console.error("Failed to send prompt to client:", e)),
              ),
            );
          }
        });

        return () => {
          cb();
          unsubs.forEach((cb) => cb());
        };
      })(),
    );
  }

  private get playerChits() {
    return this.match.turn.value?.rootChit.players;
  }

  async resolvePrompt(promptId: string, response: any): Promise<void | PromptSerialization> {
    const player = this.playerChits?.find((p) => p.playerId === this.playerId);
    if (player && player.promptStatus.latestPrompt.value) {
      const currentPrompt = player.promptStatus.latestPrompt.value;

      if (currentPrompt.id !== promptId) {
        console.warn(
          `[ServerPrompts] Prompt ID mismatch for player ${this.playerId}: received "${promptId}", expected "${currentPrompt.id}". Ignoring resolution.`,
        );
        return currentPrompt.serialize();
      }

      if (!currentPrompt.canResolveResponse(response)) {
        console.warn(
          `[ServerPrompts] Prompt "${currentPrompt.id}" for player ${this.playerId} cannot resolve response (type=${currentPrompt.type}). Ignoring resolution.`,
        );
        return currentPrompt.serialize();
      }

      let cb: (() => void) | undefined;
      const p = new Promise((resolve) => {
        cb = this.match.onChange(() => resolve(0), false);
      });
      currentPrompt.resolve(response);
      await p;
      if (cb) {
        cb();
      }
      return player.promptStatus.latestPrompt.value?.serialize();
    }
  }

  async stepBackPrompt(fullReset: boolean = false) {
    const player = this.playerChits?.find((p) => p.playerId === this.playerId);
    if (player && player.promptStatus.latestPrompt.value && player.promptStatus.latestPrompt.value.canReset) {
      player.promptStatus.latestPrompt.value.stepBack(fullReset);
    }
  }
}
