import { describe, expect, test } from "vitest";

import { Chit } from "./Chit";
import { AiPlayerView } from "./ai/AiPlayerView";
import { ClientStatus } from "./clientTransport/ClientStatus";
import { Connection } from "./Connection";
import { ConnectionObject } from "./ConnectionObject";
import { LocalConnectionTransport } from "./ConnectionTransport";
import { ClockDetails, samePasses } from "./ClockDetails";
import { Game } from "./Game";
import { GameButton } from "./GameButton";
import { Match } from "./Match";
import { EphemeralMatchStorage } from "./MatchStorage";
import { OrderedOutlet } from "./OrderedOutlet";
import { ButtonPick, ChitPick } from "./Pick";
import { PlayerChit } from "./PlayerChit";
import { PlayerInfo } from "./PlayerInfo";
import { PickPrompt } from "./Prompt";
import { RootChit } from "./RootChit";
import { Turn } from "./Turn";

//
// A player picks one of two options; the chosen option spawns a piece (which "comes from" the option, so it
// has a parentFallback) onto the first cell. The player then moves the piece to another cell and says they
// are done. Every step can be undone. In the "nested" game the spawn and the move happen in a sub-turn of
// the player's turn, so undoing the move's prompt bubbles up and restarts the player's turn.
//

class Piece extends Chit {}
class PieceA extends Piece {}
class PieceB extends Piece {}

class Option extends Chit {
  spawn(): Piece {
    const piece = this instanceof OptionA ? new PieceA() : new PieceB();
    piece.parentFallback = this;
    return piece;
  }
}
class OptionA extends Option {}
class OptionB extends Option {}

class Cell extends Chit {
  pieces = new OrderedOutlet<Piece>("pieces", this);
}

class Seat extends PlayerChit {}

class Board extends RootChit<Seat> {
  minPlayers = 1;
  options = new OrderedOutlet<Option>("options", this);
  cells = new OrderedOutlet<Cell>("cells", this);
}

class Done extends GameButton {
  label = "Done";
}
class Again extends GameButton {
  label = "Again";
}

function makeGame(nested: boolean): Game<Seat, Board> {
  return {
    chitLibrary: { Root: Board, Player: Seat, Board, Seat, Cell, OptionA, OptionB, PieceA, PieceB },
    buttonLibrary: { Done, Again },
    canvasLibrary: {},
    async run(setup: Turn<any, Seat, Board>, root: Board) {
      root.options.add(new OptionA());
      root.options.add(new OptionB());
      for (let i = 0; i < 3; i++) {
        root.cells.add(new Cell());
      }
      setup.flush();

      for (let round = 0; round < 3; round++) {
        for (const player of root.players.copy()) {
          await setup.createTurn([root], player, async (turn) => {
            let option: Option | undefined;
            await turn.pick(
              Chit.pick(root.options, (o: Option) => {
                option = o;
              }).message("choose an option"),
            );

            const play = async (turn: Turn<any, Seat, Board>) => {
              const piece = option!.spawn();
              root.cells.copy()[0].pieces.add(piece);
              await turn.pick(
                Chit.pick(root.cells.copy().slice(1), (cell: Cell) => cell.pieces.add(piece)).message("move the piece"),
              );
              await turn.pick([new Done(() => {}).pick().message("done"), new Again(() => {}).pick().message("again")]);
            };
            if (nested) {
              await turn.createTurn([root], player, play);
            } else {
              await play(turn);
            }
          });
        }
      }
      return { winners: [] };
    },
  } as unknown as Game<Seat, Board>;
}

/**
 * A client as the browser has one: the engine's headless ClientTime stand-in (`AiPlayerView`, which applies
 * each response exactly as ClientTime does) behind a real connection, plus ClientTime's clock walking on
 * top: a live client steps through every clock, and jumps to the latest one on a new pass.
 */
class SteppingView extends AiPlayerView {
  private target = 0;
  private walking: Promise<void> = Promise.resolve();
  /** Where every piece was after each response, oldest first */
  readonly timeline: string[] = [];

  override async newMaxClock(newMax: ClockDetails) {
    const old = this.maxClock;
    const isSamePass = samePasses(old, newMax);
    if (isSamePass && old.clock === newMax.clock) return;
    this.maxClock = newMax;
    this.walking = this.walking.then(async () => {
      if (!isSamePass) {
        this.target = newMax.clock;
        await this.step();
      }
      while (this.target < newMax.clock) {
        this.target++;
        await this.step();
      }
    });
    await this.walking;
  }

  private async step() {
    await this.sync(this.target);
    this.timeline.push(this.pieces());
  }

  /** Every piece on the client's board as "Type@parentId", sorted; "" when the board holds none */
  pieces(): string {
    const result: string[] = [];
    this.root?.walk((c) => {
      if (c instanceof Piece) result.push(`${c.chitTypeName().split("-")[0]}@${c.parent!.id}`);
    });
    return result.sort().join(" ");
  }
}

/** The prompt side of a client: ServerPrompts hands it each prompt with the clock it was asked at */
class PromptSink extends ConnectionObject {
  constructor(private view: SteppingView) {
    super();
  }
  async setPromptForPlayer(_playerId: string, _prompt?: unknown, clockDetails?: ClockDetails) {
    if (clockDetails) await this.view.newMaxClock(clockDetails);
  }
}

function connectClient(match: Match<Seat, Board>, game: Game<Seat, Board>, playerId: string): SteppingView {
  const serverSide = new LocalConnectionTransport(0);
  const clientSide = new LocalConnectionTransport(0);
  const connection = new Connection(clientSide);
  const view = new SteppingView(connection, game);
  connection.register(view, "ClientTime");
  connection.register(new ClientStatus<any, any>(connection), "ClientStatus");
  connection.register(new PromptSink(view), "ClientPrompts");
  clientSide.connect(serverSide);
  match.connect(serverSide, playerId);
  return view;
}

describe.each([
  ["in the player's turn", false],
  ["in a sub-turn of the player's turn", true],
])("undo, with the piece spawned %s", (_, nested) => {
  test("an undone move puts the piece straight back; an undone choice removes it on both sides", async () => {
    const game = makeGame(nested);
    const players = [new PlayerInfo("p0", "Player 0")];
    const match = new Match(game, players, new EphemeralMatchStorage(`undo-${nested}`), {});
    await match.load();
    match.immediateNotify = true;

    const turn = () => match.turn.value!;
    const root = () => turn().rootChit;
    const player = () => root().players.copy()[0];
    const client = connectClient(match, game, "p0");
    const finished = match.start();

    /** Waits until everything the server has sent has reached the client and been applied */
    const settle = async () => {
      for (let i = 0; i < 500; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2));
        if (JSON.stringify(client.maxClock) === JSON.stringify(turn().clockDetails("p0"))) {
          await client.sync();
          return;
        }
      }
      throw new Error("Client never caught up");
    };
    const nextPrompt = async (previous?: PickPrompt): Promise<PickPrompt> => {
      for (let i = 0; i < 200; i++) {
        const prompt = player().promptStatus.latestPrompt.value as PickPrompt | undefined;
        if (prompt && prompt !== previous) {
          await settle();
          return prompt;
        }
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      throw new Error("No prompt arrived");
    };
    const pickChit = (prompt: PickPrompt, chitType: string) => {
      const pick = prompt.picks[0] as ChitPick<Chit>;
      const chit = pick.chits.find((c) => c.chitTypeName() === chitType) ?? pick.chits[0];
      prompt.resolvePick(pick, chit.id);
    };
    const pickButton = (prompt: PickPrompt, message: string) => {
      const pick = prompt.picks.find((p) => p.messageContents === message) as ButtonPick;
      prompt.resolvePick(pick, undefined);
    };
    const serverPieces = () => {
      const result: string[] = [];
      root().walk((c) => {
        if (c instanceof Piece) result.push(`${c.chitTypeName().split("-")[0]}@${c.parent!.id}`);
      });
      return result.sort().join(" ");
    };
    const cell = (i: number) => root().cells.copy()[i].id!;

    try {
      // 1. choose option A: PieceA spawns onto the first cell
      let prompt = await nextPrompt();
      expect(prompt.message).toBe("choose an option");
      pickChit(prompt, "OptionA");
      prompt = await nextPrompt(prompt);
      expect(prompt.message).toBe("move the piece");
      expect(client.pieces()).toBe(`PieceA@${cell(0)}`);

      // 2. move it to the second cell
      pickChit(prompt, "Cell");
      prompt = await nextPrompt(prompt);
      expect(prompt.message).toBe("done or again");
      expect(client.pieces()).toBe(`PieceA@${cell(1)}`);

      // 3. undo the move: the piece goes straight back to the first cell, nowhere else on the way
      let beforeUndo = client.timeline.length;
      prompt.stepBack();
      prompt = await nextPrompt(prompt);
      expect(prompt.message).toBe("move the piece");
      expect(serverPieces()).toBe(`PieceA@${cell(0)}`);
      expect(client.pieces()).toBe(`PieceA@${cell(0)}`);
      expect(client.timeline.slice(beforeUndo)).toEqual([`PieceA@${cell(0)}`]);

      // 4. undo the choice: the piece is gone
      beforeUndo = client.timeline.length;
      prompt.stepBack();
      prompt = await nextPrompt(prompt);
      expect(prompt.message).toBe("choose an option");
      expect(serverPieces()).toBe("");
      expect(client.pieces()).toBe("");
      expect(client.timeline.slice(beforeUndo)).toEqual([""]);

      // 5. choose option B instead: only PieceB is on the board
      pickChit(prompt, "OptionB");
      prompt = await nextPrompt(prompt);
      expect(prompt.message).toBe("move the piece");
      expect(serverPieces()).toBe(`PieceB@${cell(0)}`);
      expect(client.pieces()).toBe(`PieceB@${cell(0)}`);

      // 6. and the game goes on
      pickChit(prompt, "Cell");
      prompt = await nextPrompt(prompt);
      pickButton(prompt, "done");
      prompt = await nextPrompt(prompt);
      expect(prompt.message).toBe("confirm turn end");
      expect(client.pieces()).toBe(`PieceB@${cell(1)}`);
    } finally {
      match.dispose();
      await finished;
    }
  });
});
