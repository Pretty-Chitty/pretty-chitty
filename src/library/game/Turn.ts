import nextTick from "next-tick";
import { Chit } from "./Chit";
import { Match } from "./Match";
import { NoValidMovesPrompt, PickPrompt, Prompt, SelectPrompt } from "./Prompt";
import { PromptResponse, RngResponse, TurnState } from "./TurnState";
import { ButtonPick, Pick } from "./Pick";
import { Confirm, GameButton } from "./GameButton";
import { PlayerChit } from "./PlayerChit";
import { RootChit } from "./RootChit";
import { ClockDetails } from "./ClockDetails";

type ChitSerializationResponse = {
  chits: ChitStateLookup;
  clockDetails: ClockDetails;
};

type ValidPick = undefined | false | Pick | Pick[] | ButtonPick | ButtonPick[] | GameButton | GameButton[];
export type Picks = ValidPick | ValidPick[];

export class Turn<T, P extends PlayerChit, R extends RootChit<P>> {
  private pass = 0;
  private clockSteps: ClockStep[] = [];
  private decisionIndex = 0; // decision points that can be potentially rolled back

  /** @internal */
  public unresolvedPrompt?: Prompt;

  /** @internal */
  public completed = false;

  /** @internal */
  public activeSubTurns: Turn<any, P, R>[] = [];

  /** @internal */
  public destroyed = false;

  /** @internal */
  public paused = Promise.resolve();

  private newChitCounter: { [type: string]: number } = {};
  private chitLookup: ChitLookup = {};
  private lockedChitStates: ChitStateLookup = {};
  private lastChitStates: ChitStateLookup = {};

  /**
   * Locates a chit by its ID.  If not found, will throw.
   * @param id
   * @returns the found chit
   * @throws If the chit is missing
   */
  /** @internal */
  public readonly findChit: (id: string) => Chit = (id: string) => {
    // store as an arrow fn so it can be passed as a fn reference and retain 'this'
    const result = this.chitLookup[id];
    if (!result) {
      if (this.parent) {
        return this.parent.findChit(id);
      }
      throw new Error("Cannot find chit");
    }
    return result;
  };

  /**
   * The root chit instance of the game.  All chits in the game have this chit somewhere in its hierarchy
   */
  public get rootChit(): R {
    return this.findChit("root") as R;
  }

  /** @internal */
  private _playerIds: string[];

  /** @internal */
  constructor(
    public id: string,
    /** @internal */
    public match: Match<P, R>,
    /** @internal */
    public state: TurnState,
    /** @internal */
    public fn: (turn: Turn<T, P, R>) => Promise<T>,
    /** @internal */
    private chitsToLock: Chit[],
    public player?: P,
    /** @internal */
    private parent?: Turn<any, P, R>,
  ) {
    if (chitsToLock.find((chit) => !chit.id)) {
      throw new Error("Cannot lock a chit without an id");
    }

    // store our chit lookup plus the initial states of all of those chits
    // so if we have to reset, we can just restore those states
    Chit.walk(chitsToLock, (c) => {
      if (!c.id) {
        throw new Error("Cannot lock a chit without an id");
      }
      c.lock(this);
      this.chitLookup[c.id] = c;
    });

    // this has to be done after we capture and lock the chits, but we need player ids so we can properly serialize
    // chits
    this._playerIds = this.rootChit.players.map((p) => {
      if (!p.id) {
        throw new Error("Cannot create turns for players without IDs");
      }
      return p.id;
    });

    // now serialize all chits in their "locked" state
    Object.values(this.chitLookup).forEach((c) => {
      if (!c.id) {
        throw new Error("Cannot serialize a chit without an id");
      }
      this.lastChitStates[c.id] = this.lockedChitStates[c.id] = c.serialize(this._playerIds);
    });
  }

  /**
   * Generates a random number from 0 to 1.  This number will persisted in state and will be consistent if the
   * turn needs to be re-run.  Drawing a random number prevents normal resets.
   *
   * If the player can perform a reset, this will confirm with them first.
   *
   * @returns A number from 0-1
   */
  async rng() {
    await this.possiblyConfirm("Confirm draw or roll");
    const result = this.state.getOrCreateRng(this.decisionIndex);
    this.decisionIndex++;
    return result;
  }

  /**
   * Generates a series of random numbers from 0 to 1.  This is a helper method to help batch up a lot of random draws
   * since each rng() call must be awaited.
   * @param count
   * @returns A parameterless function that will return the next random number in the list.  If you try to select too many random numbers, that method will throw.
   */
  async takeRng(count: number): Promise<() => number> {
    await this.possiblyConfirm("Confirm draw or roll");
    const results: number[] = [];
    for (let i = 0; i < count; i++) {
      results.push(this.state.getOrCreateRng(this.decisionIndex));
      this.decisionIndex++;
    }

    let counter = 0;
    return () => {
      if (counter >= results.length) {
        throw new Error("RNG take out of bounds");
      }
      return results[counter++];
    };
  }

  /**
   * Scan all of the chits managed by this turn.  If any of them have changed, group them together into a
   * "ClockStep".  If any new chits appear, then add them to our lookup.  If any chits are deleted (orphaned),
   * then we have to identify those as well.
   */
  flush() {
    const seenIds = new Set<string>();
    const newStates: ChitStateLookup = {};
    let sawChange = false;

    // first ensure they all are locked and all have ids
    const chitsToAddIdsTo: Chit[] = [];
    Chit.walk(this.chitsToLock, (c) => {
      if (!c.id) {
        chitsToAddIdsTo.push(c);
      }
    });

    chitsToAddIdsTo.sort((a, b) => a.createdOrder - b.createdOrder);
    chitsToAddIdsTo.forEach((c) => {
      const type = c.chitTypeName();
      const counter = (this.newChitCounter[type] || 0) + 1;
      this.newChitCounter[type] = counter;
      c.id = `${this.id}.${type}.${counter}`;
      c.lock(this);

      const existing = this.chitLookup[c.id];
      this.chitLookup[c.id] = c; // it's possible that this is kicking out an "old" version of this chit from a previous pass
      if (existing) {
        existing.removeFromParent(); // do not want to leave stray references to this cloned chit around!
        existing.unlock(this);
      }
    });

    // now (once per chit) we serialize the state if it changed
    Chit.walk(this.chitsToLock, (c) => {
      if (!c.id) {
        throw new Error("Should not be possible unless Chit.walk is misbehaving");
      }
      if (!seenIds.has(c.id)) {
        seenIds.add(c.id);
        const serialized = c.serialize(this._playerIds);
        const lastState = this.lastChitStates[c.id];
        if (serialized !== lastState) {
          this.lastChitStates[c.id] = newStates[c.id] = serialized;
          sawChange = true;
        } else {
          newStates[c.id] = serialized;
        }
      } else {
        return false; // already saw this - no need to keep digging into children
      }
    });

    // find any chits that we previously serialized that we no longer see
    // these should be marked as deleted now
    const chitsToDelete = Object.keys(this.lastChitStates)
      .filter((id) => !seenIds.has(id) && this.lastChitStates[id] !== Chit.deletedIfSerialized())
      .map((id) => this.findChit(id));

    // make sure any missing items that were previously also missing are still deleted
    Object.keys(this.lastChitStates)
      .filter((id) => !seenIds.has(id) && this.lastChitStates[id] == Chit.deletedIfSerialized())
      .forEach((id) => {
        newStates[id] = Chit.deletedIfSerialized();
      });

    // find all chits without parents - all of their descendants are safe to be purged
    chitsToDelete
      .filter((chit) => !chit.parent)
      .forEach((chit) => {
        if (chit.id) {
          sawChange = true;
          chit.unlock(this);
          newStates[chit.id] = Chit.deletedIfSerialized();
          // do not store this new state in lastChitStates, but rather delete this record from it altogether
          chit.walk((c) => {
            if (c.id) {
              seenIds.add(c.id);
              this.lastChitStates[c.id] = Chit.deletedIfSerialized();
              newStates[c.id] = Chit.deletedIfSerialized();
              chit.unlock(this);
            }
          });
        }
      });

    // any chits remaining that we haven't seen are bad news - they have likely been reparented to some other Turn, which
    // is against the rules.  They need to remain under this turns control.
    if (chitsToDelete.find((c) => c.id && !seenIds.has(c.id))) {
      throw new Error("Chit has been reparented to another Turn which will corrupt control");
    }

    if (sawChange) {
      // flushing any changes while there are active subturns makes timelines *VERY* difficult
      if (this.activeSubTurns.length) {
        throw new Error("Cannot flush while subturns are active");
      }

      this.clockSteps.push(new FlushClockStep(this.clock, newStates));
    }
  }

  /**
   * Creates a sub-turn.  This is useful for a few reasons:
   *  1) It is the only way to change game control flow from our current player to a different player
   *  2) It creates a new "reset" point for backing out turns
   *
   * It takes an async function which it will execute.  For simplicity, the result of that function will be the result of
   * this function.
   *
   * It is okay to have multiple turns going at once, but there are some rules:
   *  1) If there is an ongoing sub turn that hasn't resolved, you cannot prompt or change chits in this turn.
   *  2) There is only one ongoing subturn allowed per player.
   *
   * @param chits The chits to lock.  These are the only chits that will be allowed to be modified by this turn.  If there are never any concurrent turns, this can safely be the root chit (although there maybe minor performance implications)
   * @param player The player who will be prompted for choices during this turn.
   * @param cb The async function that will be the logic of this turn.  The function takes a new turn instance
   * @returns Whatever the final result of cb() is
   */
  public async createTurn<A>(chits: Chit[], player: P, cb: (turn: Turn<A, P, R>) => Promise<A>): Promise<A> {
    if (this.unresolvedPrompt) {
      throw new Error("Still awaiting a prompt result");
    }
    if (this.destroyed) {
      throw new DestroyError(); // do not create more turns if we are destroyed!
    }

    await this.checkPause();

    this.flush();

    if (player.playerId && player.playerId !== this.player?.playerId) {
      await this.possiblyConfirm("Confirm switching active player");
      this.flush();
    }

    if (player) {
      chits = chits.concat(player);
    }

    if (player && this.activeSubTurns.find((subTurn) => subTurn.player === player)) {
      throw new Error("Only one sub-turn can be active at a time per player");
    }

    const id = `${this.id}.t${this.decisionIndex}`;
    const s = this.state.getOrCreateTurnState(this.decisionIndex);
    s.playerId = player?.playerId;
    s.id = id;
    Chit.walk(chits, (chit) => chit.unlock(this));
    const turn = new Turn<A, P, R>(id, this.match, s, cb, chits, player, this);

    this.decisionIndex++;

    if (this.activeSubTurns.length === 0) {
      this.clockSteps.push(new SubTurnsClockStep(this.clock, [turn]));
    } else {
      const lastStep = this.clockSteps[this.clockSteps.length - 1];
      if (!(lastStep instanceof SubTurnsClockStep)) {
        throw new Error("Unexpected clocksteps stage");
      }
      lastStep.turns.push(turn);
    }

    this.activeSubTurns.push(turn);

    //make sure flow goes to next tick
    await new Promise((resolve) => nextTick(() => resolve(true)));

    await this.checkPause();

    const result = await turn.execute();

    await this.checkPause();

    this.activeSubTurns = this.activeSubTurns.filter((t) => t !== turn);

    Object.values(turn.chitLookup).forEach((chit) => {
      if (chit.id) {
        chit.lock(this);
        this.chitLookup[chit.id] = chit;
      }
    });

    this.lastChitStates = { ...this.lastChitStates, ...turn.lastChitStates };

    return result;
  }

  public async runParallelTurns<A>(
    players: P[],
    chits: (p: P) => Chit[],
    action: (p: P, turn: Turn<A, P, R>) => Promise<A>,
  ): Promise<A[]> {
    // the whole point of this function is so we can mark all players as having a prompt waiting for them
    players.forEach((player) => (player.promptStatus.latestPromptMessage = "Waiting for turn to complete"));

    const turns = players.map((player) =>
      this.createTurn(chits(player), player, (turn: Turn<A, P, R>) => action(player, turn)),
    );

    return await Promise.all(turns);
  }

  /**
   * Basic selection prompt.  All chits will appear as "selected" on the respective client.
   * Upon clicking one, the prompt will resolve itself.
   *
   * @param chits The list of chits that can be selected from
   * @returns The chit that the player selected
   */
  public async select(chits: Chit[]): Promise<Chit> {
    if (chits.length === 1) {
      return chits[0];
    }

    const prompt = new SelectPrompt();
    prompt.chits = chits;

    this.prepareForPrompt(prompt);

    // make sure all of these chits are locked by us - otherwise someone has made a mistake.
    chits.forEach((chit) => chit.confirmLock(this));

    await this.waitForPromptResolution(prompt);
    if (!prompt.selectedChit) {
      throw new Error("Prompt should have selected chit response");
    }

    return prompt.selectedChit;
  }

  /**
   * If a player has gotten themselves into a corner - i.e. no valid moves - this prompt will
   * simply inform them of that and allow them to undo.
   * @param message
   * @param help
   */
  public async noValidMoves(message?: string, help?: string) {
    const prompt = new NoValidMovesPrompt();
    if (message) {
      prompt.message = message;
    }
    if (help) {
      prompt.help = help;
    }

    this.prepareForPrompt(prompt);

    await this.waitForPromptResolution(prompt);
  }

  /**
   * More complex selection prompt.  Useful in Typescript when you want to handle a response to multiple
   * types of chits.  This will allow a different typed callback per set of chits.  This also allows
   * the insertion of "buttons"
   * @param message (optional) The message to show describing the prompt in a few words
   * @param help (optional) A detailed help message to show
   * @param picks An array of "picks" - each of which can have its own typesafe callback
   */
  public async pick(message?: string | Picks, help?: string | Picks, picks?: Picks) {
    if (typeof message !== "string") {
      picks = message;
      message = undefined;
      help = undefined;
    }
    if (help !== undefined && typeof help !== "string") {
      picks = help;
      help = undefined;
    }
    if (picks === undefined) {
      throw new Error("No PIcks");
    }
    if (!Array.isArray(picks)) {
      picks = [picks];
    }

    const prompt = new PickPrompt();
    prompt.setMessageAndHelp(message, help);

    const flatPicks = [...picks]
      .flat()
      .map((o) => {
        if (!o) {
          return;
        }
        if (o instanceof Pick) {
          return o;
        }
        if (o instanceof GameButton) {
          return GameButton.pick(o);
        }
        throw new Error("Invalid type");
      })
      .filter((a) => a && a.numberOfChoices() > 0) as Pick[];

    prompt.picks = flatPicks;

    if (flatPicks.length === 0) {
      return;
    }

    const autoresolved = await prompt.autoResolve();

    if (!autoresolved) {
      this.prepareForPrompt(prompt);

      // make sure all of these chits are locked by us - otherwise someone has made a mistake.
      flatPicks.forEach((pick) => pick.confirmLock(this));

      await this.waitForPromptResolution(prompt);

      await prompt.finished();
    }
  }

  /** @internal */
  public rerun(turn: Turn<any, P, R>) {
    this.activeSubTurns.forEach((t) => t.rerun(turn));
    if (this.unresolvedPrompt) {
      this.unresolvedPrompt.shouldRerun = turn;
      this.unresolvedPrompt.resolve({});
    }
  }

  /** @internal */
  async possiblyConfirm(action: string): Promise<void> {
    if (this.state.hasUserMadeChoiceSinceUserContextChangedOrRng(this.decisionIndex - 1)) {
      const c = new Confirm(() => {});
      c.message = action;
      await this.pick([c]);
    }
  }

  /** @internal */
  private nextSavedStateToProcess?: TurnState;

  /** @internal */
  private isProcessingSavedState = false;

  /** @internal */
  /** This is only useful at the 'root' turn level, really. */
  public async processNewSavedState(state: TurnState) {
    if (this.isProcessingSavedState) {
      this.nextSavedStateToProcess = state;
      return;
    }

    try {
      this.isProcessingSavedState = true;
      this.pause();

      // defer to next tick on starting
      await new Promise<void>((resolve) => nextTick(() => resolve()));

      const instructions = this.handleNewSavedState(state);

      this.propagateNewState(state);

      for (const instruction of instructions) {
        if (instruction.type === "reset") {
          this.state = state;
          instruction.turn.rerun(instruction.turn);
        } else if (instruction.type === "prompt") {
          await new Promise<void>((resolve, reject) =>
            nextTick(() => {
              if (instruction.turn.unresolvedPrompt !== instruction.prompt) {
                reject("waiting on incorrect prompt");
              }
              instruction.prompt.resolve(instruction.response);
              resolve();
            }),
          );
        }
      }

      // always defer to next tick again when resuming
      await new Promise<void>((resolve) => nextTick(() => resolve()));
    } finally {
      this.unpause();
      this.isProcessingSavedState = false;

      if (this.nextSavedStateToProcess) {
        const newState = this.nextSavedStateToProcess;
        this.nextSavedStateToProcess = undefined;
        this.processNewSavedState(newState);
      }
    }
  }

  /** @internal */
  public propagateNewState(state: TurnState) {
    this.state = state;

    this.activeSubTurns.forEach((t) => {
      const newState = state.decisions.find((decision) => decision.type === "turn" && decision.id === t.id);
      if (newState) {
        t.propagateNewState(newState as TurnState);
      }
    });
  }

  /** @internal */
  public handleNewSavedState(state: TurnState): SavedStateProcessingInstructions[] {
    const oldState = this.state;

    // if we have decisions that the state we are loading does NOT have yet
    // then we have to reset and rerun this turn
    if (oldState.decisions.length > state.decisions.length) {
      return [{ turn: this, type: "reset" }];
    }

    // confirm all of the choices are the same
    const result: SavedStateProcessingInstructions[] = [];
    for (let i = 0; i < oldState.decisions.length; i++) {
      const oldDecision = oldState.decisions[i];
      const newDecision = state.decisions[i];

      if (oldDecision.type !== newDecision.type) {
        return [{ turn: this, type: "reset" }];
      }

      //
      // This is just wrong.  the only time we don't have to do a full reset is if the last step is a turn that isn't
      // resolved yet.  that turn can update itself, but leaving turn 2 alone
      //

      if (oldDecision.type === "rng") {
        if ((oldDecision as RngResponse).value !== (newDecision as RngResponse).value) {
          return [{ turn: this, type: "reset" }];
        }
      } else if (oldDecision.type === "prompt") {
        const oldResponse = oldDecision as PromptResponse;
        const newResponse = newDecision as PromptResponse;

        // special case: if we are looking at a prompt we were waiting on previously
        // we can now resolve it!
        if (
          i === oldState.decisions.length - 1 &&
          oldResponse.response === undefined &&
          newResponse.response !== undefined
        ) {
          if (!this.unresolvedPrompt) {
            return [{ turn: this, type: "reset" }]; // something has gone wrong if we have a response and are not waiting on a response
          }

          result.push({
            type: "prompt",
            turn: this,
            prompt: this.unresolvedPrompt,
            response: newResponse.response,
          });
        } else if (JSON.stringify(oldResponse.response) !== JSON.stringify(newResponse.response)) {
          return [{ turn: this, type: "reset" }];
        }
      } else if (oldDecision.type === "turn") {
        const oldTurnState = oldDecision as TurnState;
        const newTurnState = newDecision as TurnState;

        // if this turn isn't finished, then let that turn try to resolve the new state
        const foundTurn = this.activeSubTurns.find((t) => t.id === newTurnState.id);
        if (foundTurn) {
          const subTurnChanges = foundTurn.handleNewSavedState(newTurnState);
          subTurnChanges.forEach((r) => result.push(r));
        } else if (JSON.stringify(oldTurnState.decisions) !== JSON.stringify(newTurnState.decisions)) {
          return [{ turn: this, type: "reset" }];
        }
      }
    }
    return result;
  }

  private findIndexOfLastFlushStepBefore(clock: number): number {
    for (let j = this.clockSteps.length - 1; j >= 0; j--) {
      if (this.clockSteps[j] instanceof FlushClockStep && this.clockSteps[j].startClock < clock) {
        return j;
      }
    }
    return 0;
  }

  /** @internal */
  serialize(playerId: string, clock: number): ChitSerializationResponse {
    clock = Math.max(0, Math.min(clock, this.playerVisibleClockTime(playerId)));

    let chits = {};
    let resultingClock = -1;

    // going forwards
    let index = this.findIndexOfLastFlushStepBefore(clock);
    let subTurns: { [turnId: string]: ClockDetails } | undefined = undefined;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const clockStep = this.clockSteps[index];
      index++;
      if (!clockStep) {
        break;
      }

      if (clockStep.startClock >= clock) {
        break;
      }

      if (clockStep instanceof FlushClockStep) {
        subTurns = undefined;
        chits = { ...clockStep.state };
        resultingClock = clockStep.endClock();
      } else if (clockStep instanceof SubTurnsClockStep) {
        subTurns = {};
        resultingClock = clockStep.startClock;
        let remainingClocksToSpend = clock - clockStep.startClock;
        for (const turn of clockStep.visibleTurns(playerId)) {
          const time = Math.max(remainingClocksToSpend, 0);
          if (time <= 0) {
            break;
          }

          // we are going forward so we never want to have a turn go backwards.  ever.
          const serialized = turn.serialize(playerId, time);
          Object.assign(chits, serialized.chits);

          resultingClock += serialized.clockDetails.clock;
          remainingClocksToSpend -= serialized.clockDetails.clock;
          subTurns[turn.id] = serialized.clockDetails;
        }
      }
    }

    return {
      chits,
      clockDetails: {
        pass: this.pass,
        clock: resultingClock === -1 ? clock : resultingClock,
        subTurns,
      },
    };
  }

  /*
   * Internal helper function to prep a Prompt for prompting
   */
  private prepareForPrompt<A extends Prompt>(prompt: A): A {
    if (this.unresolvedPrompt) {
      throw new Error("Already awaiting a prompt result");
    }
    if (!this.player) {
      throw new Error("No player attached to turn");
    }
    if (this.activeSubTurns.length) {
      throw new Error("Prompts are not allowed while subturns are not resolved");
    }

    prompt.findChit = this.findChit;
    prompt.id = `${this.id} prompt ${this.decisionIndex}`;
    prompt.clock = this.clock;
    prompt.canReset = this.state.hasUserMadeChoiceSinceUserContextChangedOrRng(this.decisionIndex - 1);
    this.player.promptStatus.latestPromptMessage = prompt.message;
    if (!this.player.promptStatus.latestPromptMessage.length) {
      this.player.promptStatus.latestPromptMessage = "No prompt set";
    }

    this.flush();

    return prompt;
  }

  /*
   * Internal helper function to handle safely awaiting a prompt's response
   */
  private async waitForPromptResolution(prompt: Prompt) {
    if (!this.player) {
      throw new Error("Must have player specified");
    }

    await this.checkPause();
    const resolution = this.state.getOrCreatePromptResponse(this.decisionIndex);
    await this.checkPause(); // state could have gotten funky here?  if we have a resolution already? maybe not so bad?

    if (resolution.response !== undefined) {
      await new Promise((resolve) => nextTick(() => resolve(true))); // defer to next tick to make sure replay works identically
      prompt.resolve(resolution.response);
    } else {
      if (this.player.promptStatus.latestPrompt.value) {
        throw new Error("Player can only have prompt out at a time");
      }

      this.unresolvedPrompt = prompt;
      this.player.promptStatus.latestPrompt.value = prompt;

      // weird anti-pattern which will actually wait for a resolution to the prompt and return flow here.
      let succeeded = false;
      await new Promise((resolve) =>
        prompt.onResolve((success: boolean) => {
          succeeded = success;
          resolve(undefined);
        }),
      );

      if (prompt.shouldRerun) {
        throw new RerunError(prompt.shouldRerun);
      }
      if (prompt.shouldReset) {
        throw new RollBackError();
      }
      if (prompt.shouldStepBack) {
        throw new StepBackError();
      }
      if (!succeeded) {
        this.player.promptStatus.latestPrompt.value = undefined;
        this.unresolvedPrompt = undefined;
        // throw new Error("Unknown error");
        return;
      }

      this.player.promptStatus.latestPrompt.value = undefined;
      resolution.response = prompt.response;
      this.unresolvedPrompt = undefined;
    }

    // it is possible our state got reset out from under us and the response we have (which is a pointer)
    // to an object -- MAY be writing to the OLD state
    this.state.setOrCreatePromptResponse(this.decisionIndex, resolution);

    this.player.promptStatus.latestPromptResponseTime = this.absoluteClock(this.player.id);
    this.player.promptStatus.latestPromptMessage = undefined;
    this.decisionIndex++;
  }

  /*
   * The main runtime.  Will attempt to run `fn` until it succeeds.  Each time it has to loop back,
   * it will reset chit's states to where they should be.
   */
  /** @internal */
  async execute() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        await this.checkPause();

        // actually execute this fn
        const result = await this.fn(this);

        if (this.player && this.player !== this.parent?.player) {
          await this.possiblyConfirm("Confirm turn end");
        }

        this.cleanUp();
        return result;
      } catch (error) {
        if (error instanceof RerunError) {
          if ((error as RerunError).turn === this) {
            this.restartExecution();
            continue;
          }
          throw error;
        }
        if (error instanceof StepBackError) {
          // bubble it up to parent if we can
          if (this.decisionIndex === 0 && this.parent?.player === this.player) {
            throw error;
          }

          this.state.stepBack(); // once to clear the current prompt
          this.state.stepBack(); // and again to clear what was before
          this.restartExecution();
          continue;
        } else if (error instanceof RollBackError) {
          this.state.fullStepBack();
          this.restartExecution();
          continue;
          // TODO: roll back
        }
        this.destroy();
        throw error;
      }
    }
  }

  /** @internal */
  _paused?: () => void;

  /** @internal */
  pause() {
    if (this._paused) {
      return;
    }

    this.paused = new Promise((resolve) => {
      this._paused = resolve;
    });
    this.activeSubTurns.forEach((turn) => turn.pause());
  }

  /** @internal */
  async unpause() {
    if (this._paused) {
      this._paused();
      this._paused = undefined;
    }
    this.activeSubTurns.forEach((turn) => turn.unpause());
  }

  /** @internal */
  async checkPause() {
    await this.paused;
    if (this.destroyed) {
      throw new DestroyError();
    }
  }

  /** @internal */
  destroy() {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.activeSubTurns.forEach((turn) => turn.destroy());
    Object.values(this.chitLookup).forEach((chit) => chit.unlock(this));
    if (this.unresolvedPrompt && this.player) {
      this.player.promptStatus.latestPrompt.value = undefined;
      this.unresolvedPrompt.destroy();
    }
  }

  /** @internal */
  fixPass() {
    this.pass = Date.now();
  }

  private cleanUp() {
    if (this.player) {
      this.player.promptStatus.latestPromptMessage = undefined;
    }
    this.completed = true;
    this.flush();
    Object.values(this.chitLookup).forEach((chit) => chit.unlock(this));
  }

  /** @internal */
  get lastClockStep(): ClockStep | undefined {
    return this.clockSteps[this.clockSteps.length - 1];
  }

  /** @internal */
  get clock() {
    return this.lastClockStep?.endClock() ?? 0;
  }

  /** @internal */
  playerVisibleClockTime(playerId?: string) {
    return this.lastClockStep?.endClock(playerId) ?? 0;
  }

  /** @internal */
  absoluteClock(playerId?: string): number {
    return this.parent?.absoluteClock(playerId) ?? this.clockDetails(playerId).clock;
  }

  /** @internal */
  clockDetails(playerId?: string): ClockDetails {
    const result: ClockDetails = {
      clock: this.playerVisibleClockTime(playerId),
      pass: this.pass,
    };
    const visibleActiveTurns =
      this.lastClockStep instanceof SubTurnsClockStep ? this.lastClockStep.visibleTurns(playerId) : [];
    if (visibleActiveTurns.length > 0) {
      result.subTurns = {};

      for (const turn of visibleActiveTurns) {
        result.subTurns[turn.id] = turn.clockDetails(playerId);
      }
    }
    return result;
  }

  private restartExecution() {
    this.activeSubTurns.forEach((t) => t.destroy());

    const chits = Object.values(this.chitLookup).filter((chit) => chit.id);

    chits.forEach((chit) => chit.beginDeserializing());

    chits.forEach((chit) => {
      chit.lock(this);
      const lockedState = this.lockedChitStates[chit.id ?? ""];

      if (lockedState) {
        chit.deserialize(lockedState, this.findChit);
      } else {
        chit.removeFromParent(); // effectively "deletes" it.  In practice, the `fn` will recreate a new chit which will have the new ID, which replaces this one.
      }
    });

    chits.forEach((chit) => chit.doneDeserializing());

    if (this.player) {
      this.player.promptStatus.latestPrompt.value = undefined;
    }

    this.chitLookup = {};
    Chit.walk(this.chitsToLock, (c) => {
      if (c.id) {
        this.chitLookup[c.id] = c;
      }
    });

    this.lastChitStates = { ...this.lockedChitStates }; // reset our known chit states
    this.clockSteps = [];
    this.decisionIndex = 0;
    this.newChitCounter = {};
    this.unresolvedPrompt = undefined;
    this.activeSubTurns = [];
    this.pass++;
  }
}

//
// Helper classes - maybe will move to separate file if needed?
//

type ChitLookup = { [id: string]: Chit };
type ChitStateLookup = { [id: string]: string };

abstract class ClockStep {
  abstract get startClock(): number;
  abstract endClock(playerId?: string): number;
}

class SubTurnsClockStep<P extends PlayerChit, R extends RootChit<P>> extends ClockStep {
  visibleTurns(playerId?: string) {
    if (this.turns.length === 1 || playerId === undefined) {
      return this.turns;
    }

    const myTurn = this.turns.find((turn) => turn.player?.id === playerId);
    if (myTurn && !myTurn?.completed) {
      return [myTurn];
    }

    if (myTurn?.completed) {
      return [myTurn, ...this.turns.filter((turn) => turn !== myTurn)];
    }

    const completedTurns = this.turns.filter((turn) => turn.completed);
    if (completedTurns.length === this.turns.length) {
      return completedTurns;
    }

    return [];
  }

  endClock(playerId?: string): number {
    return (
      this.startClock +
      this.visibleTurns(playerId).reduce((sum, turn) => sum + turn.playerVisibleClockTime(playerId), 0)
    );
  }

  constructor(
    public startClock: number,
    public turns: Turn<any, P, R>[],
  ) {
    super();
  }
}

class FlushClockStep extends ClockStep {
  public endClock() {
    return this.startClock + 1;
  }
  constructor(
    public startClock: number,
    public state: ChitStateLookup,
  ) {
    super();
  }
}

export class StepBackError extends Error {}
export class RollBackError extends Error {}
export class DestroyError extends Error {}
export class RerunError extends Error {
  constructor(public turn: Turn<any, any, any>) {
    super();
  }
}
export class MismatchError extends Error {
  constructor() {
    super("Mismatch");
  }
}

type SavedStateProcessingInstructions =
  | {
      type: "reset";
      turn: Turn<any, any, any>;
    }
  | {
      type: "prompt";
      turn: Turn<any, any, any>;
      prompt: Prompt;
      response: any;
    };
