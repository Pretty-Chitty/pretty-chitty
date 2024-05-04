import { Chit } from "./Chit";
import { Connection } from "./Connection";
import { ConnectionTransport } from "./ConnectionTransport";
import { Game, GameResult } from "./Game";
import { ServerTime } from "./serverTransport/ServerTime";
import { PlayerInfo } from "./PlayerInfo";
import { MismatchError, RerunError, Turn } from "./Turn";
import { TurnState } from "./TurnState";
import { IMatchStorage } from "./MatchStorage";
import nextTick from "next-tick";
import { ServerPrompts } from "./serverTransport/ServerPrompts";
import { EventChannel } from "../utilities/EventChannel";
import { RootChit } from "./RootChit";
import { ServerStatus } from "./serverTransport/ServerStatus";
import { PlayerChit } from "./PlayerChit";

export class Match<P extends PlayerChit, R extends RootChit<P>> {
  public result?: GameResult<any>;
  public state: TurnState = new TurnState();
  public turn = new EventChannel<undefined | Turn<GameResult<any>, P, R>>(undefined);
  public errorState = new EventChannel<undefined | string>(undefined);
  private onChangeCallbacks: (() => void)[] = [];

  constructor(
    public game: Game<P, R>,
    public players: PlayerInfo[],
    private matchStorage: IMatchStorage,
  ) {}

  async load() {
    const savedState = await this.matchStorage.readState();
    if (savedState !== null) {
      this.state.deserialize(savedState);
    }
    this.matchStorage.registerNewStateCallback((savedState) => {
      this.state = new TurnState();
      this.state.deserialize(savedState);
      if (this.errorState) {
        this.turn.value?.destroy();
        this.turn.value = undefined;
        this.start();
      } else if (this.turn.value) {
        this.turn.value.handleNewSavedState(this.state);
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
        this.errorState.value = undefined;
        const rootChit = this.game.generateRootChit();
        rootChit.id = "root";
        rootChit.match = this;

        const players = this.players.map((p) => {
          const player = this.game.generatePlayer(p);
          player.promptStatus.latestPrompt.on(() => this.notify(), false);
          rootChit.players.add(player);
          return player;
        });

        let counter = 1;
        rootChit.walk((c: Chit) => {
          if (!c.id) {
            c.id = `root-autocreated-${counter++}`;
          }
        });

        this.turn.value = new Turn<GameResult<any>, P, R>(
          "root",
          this,
          this.state,
          (turn) => this.game.run(players, turn, rootChit),
          [rootChit],
        );
        this.turn.value.fixPass();
        this.notify();
        this.result = await this.turn.value.execute();
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

  private processNotify() {
    this.onChangeCallbacks.forEach((cb) => cb());

    // TODO: this is a promise going nowhere... do we block on saving?
    this.matchStorage.saveState(this.state);
  }

  public dispose() {
    // TODO: cleanup
  }

  public onChange(cb: () => void, callNow = true) {
    this.onChangeCallbacks.push(cb);
    callNow && nextTick(cb);
    return () => {
      this.onChangeCallbacks = this.onChangeCallbacks.filter((c) => c !== cb);
    };
  }
}
