import { ClockDetails } from "../ClockDetails";
import { Connection } from "../Connection";
import { ConnectionObject } from "../ConnectionObject";
import { PickType } from "../Pick";
import { PlayerChit } from "../PlayerChit";
import { PromptSerialization } from "../Prompt";
import { RootChit } from "../RootChit";
import { ServerPrompts } from "../serverTransport/ServerPrompts";

export class BadAIClientPrompts<P extends PlayerChit, R extends RootChit<P>> extends ConnectionObject {
  private serverPrompts: ServerPrompts<P, R>;

  constructor(
    private playerId: string,
    private connection: Connection,
  ) {
    super();

    this.serverPrompts = connection.get<ServerPrompts<P, R>>("ServerPrompts");
  }

  public async setPromptForPlayer(playerId: string, prompt?: PromptSerialization, clockDetails?: ClockDetails) {
    console.log("Setting prompt for player", playerId, prompt, clockDetails);
    if (prompt && playerId === this.playerId) {
      if (prompt.type === "PickPrompt") {
        const picks = prompt.details.picks;
        const pickIndex = Math.floor(Math.random() * picks.length);
        const pick = picks[pickIndex];
        switch (pick.type as PickType) {
          case "ButtonPick": {
            await this.serverPrompts.resolvePrompt(prompt.id, {
              idx: pickIndex,
              pickType: "ButtonPick",
            });
            break;
          }
          case "ChitPick": {
            await this.serverPrompts.resolvePrompt(prompt.id, {
              idx: pickIndex,
              pickType: "ChitPick",
              value: pick.details.c[Math.floor(Math.random() * pick.details.c.length)],
            });
            break;
          }
          case "DragPick": {
            const target = pick.details.d[Math.floor(Math.random() * pick.details.d.length)];
            await this.serverPrompts.resolvePrompt(prompt.id, {
              idx: pickIndex,
              pickType: "DragPick",
              value: {
                chitId: pick.details.c[Math.floor(Math.random() * pick.details.c.length)],
                targetChitId: target[Math.floor(Math.random() * target.length)],
              },
            });
            break;
          }
        }
      } else if (prompt.type === "NoValidMovesPrompt") {
        await this.serverPrompts.stepBackPrompt(false);
      }
    }
  }
}
