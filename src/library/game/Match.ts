import { Chit } from "./Chit";
import { Connection } from "./Connection";
import { ConnectionTransport } from "./ConnectionTransport";
import { Game, GameResult } from "./Game";
import { ServerTime } from "./serverTransport/ServerTime";
import { PlayerInfo } from "./PlayerInfo";
import { MismatchError, RerunError, Turn } from "./Turn";
import { TurnState } from "./TurnState";
import { IMatchStorage } from "./MatchStorage";
import { ServerPrompts } from "./serverTransport/ServerPrompts";
import { EventChannel } from "../utilities/EventChannel";
import { RootChit } from "./RootChit";
import { ServerStatus } from "./serverTransport/ServerStatus";
import { PlayerChit } from "./PlayerChit";

export class Match<P extends PlayerChit, R extends RootChit<P>> {
  public state: TurnState = new TurnState();
  public result = new EventChannel<undefined | GameResult<P>>(undefined);
  public turn = new EventChannel<undefined | Turn<GameResult<P>, P, R>>(undefined);
  public errorState = new EventChannel<undefined | string>(undefined);
  private onChangeCallbacks: (() => void)[] = [];

  constructor(
    public game: Game<P, R>,
    public players: PlayerInfo[],
    private matchStorage: IMatchStorage,
    private matchOptions?: any,
  ) {}

  async load() {
    const savedState = await this.matchStorage.readState();
    if (savedState !== null) {
      this.state.deserialize(savedState);
    }
    this.matchStorage.registerNewStateCallback((savedState) => {
      this.state = new TurnState();
      this.state.deserialize(savedState);
      if (this.errorState.value) {
        this.turn.value?.destroy();
        this.turn.value = undefined;
        this.start();
      } else if (this.turn.value) {
        this.turn.value
          .processNewSavedState(this.state)
          .then(() => {
            console.log("Processed new saved state");
          })
          .catch((e: any) => {
            console.error("Error processing new saved state", e);
          });
      }

      // TODO: if the match is over and are resetting.... what do we do?
    });
  }

  public findPlayer(playerId: string): PlayerInfo {
    const result = this.players.find((p) => p.id === playerId);
    if (!result) {
      throw new Error(`Player ${playerId} not found`);
    }
    return result;
  }

  async start() {
    if (this.turn.value) {
      throw new Error("Can only start once per Match instance");
    }

    // if players change (promise status, etc.) then we need to notify
    // as that means the clock has changed (or promise status)
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        this.result.value = undefined;
        this.errorState.value = undefined;
        const rootChit = new this.game.chitLibrary.Root() as R;
        rootChit.id = "root";
        rootChit.game = this.game;
        rootChit.processMatchOptions(this.matchOptions);

        this.players.forEach((p) => {
          const Player = this.game.chitLibrary.Player;
          const player = new Player();
          player.setPlayerInfo(p);
          player.promptStatus.latestPrompt.on(() => this.notify(), false);
          rootChit.players.add(player);
          return player;
        });

        let counter = 1;
        rootChit.walk((c: Chit) => {
          if (!c.id) {
            c.id = `r-ac-${counter++}`;
          }
        });

        this.turn.value = new Turn<GameResult<P>, P, R>(
          "root",
          this,
          this.state,
          async (turn) => {
            await rootChit.players.shuffle();
            return this.game.run(turn, rootChit);
          },
          [rootChit],
        );
        rootChit._setupTurn = this.turn.value;
        this.turn.value.fixPass();
        this.notify();

        this.result.value = await this.turn.value.execute();
        break;
      } catch (e) {
        if (e instanceof RerunError) {
          continue;
        }

        if (e instanceof MismatchError) {
          this.errorState.value = e.message;
          return;
        }

        throw e;
      }
    }
  }

  // TODO: playerid included?
  connect(transport: ConnectionTransport, playerId: string) {
    const connection = new Connection(transport);
    console.log(`Connected ${playerId}`);
    connection.register(new ServerTime(this, playerId, connection));
    connection.register(new ServerPrompts(playerId, this, connection));
    connection.register(new ServerStatus(this, connection));
    return connection;
  }

  private _timeout?: NodeJS.Timeout | number = undefined;
  private notify() {
    clearTimeout(this._timeout);
    this._timeout = setTimeout(() => this.processNotify(), 0);
  }

  private _isSaving = false;
  private _saveStateNeeded = false;
  private processNotify() {
    this.onChangeCallbacks.forEach((cb) => cb());

    // TODO: this is a promise going nowhere... do we block on saving?
    this._saveStateNeeded = true;
    this.processSaveState();
  }

  private processSaveState() {
    if (this._isSaving) {
      return;
    }

    this._saveStateNeeded = false;
    this._isSaving = true;
    this.matchStorage
      .saveState(
        this.state,
        this.turn.value?.rootChit.players.copy() ?? [],
        this.result.value ? "finished" : "active",
        this.result.value?.winners,
      )
      .finally(() => {
        this._isSaving = false;
        if (this._saveStateNeeded) {
          return this.processSaveState();
        }
      });
  }

  public dispose() {
    // TODO: cleanup
  }

  public onChange(cb: () => void, callNow = true) {
    this.onChangeCallbacks.push(cb);
    callNow && queueMicrotask(cb);
    return () => {
      this.onChangeCallbacks = this.onChangeCallbacks.filter((c) => c !== cb);
    };
  }
}
