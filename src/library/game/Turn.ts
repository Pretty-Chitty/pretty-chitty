import nextTick from "next-tick";
import { Chit } from "./Chit";
import { Match } from "./Match";
import { PickPrompt, Prompt, SelectPrompt } from "./Prompt";
import { PromptResponse, RngResponse, TurnState } from "./TurnState";
import { ClockDetails } from "./ClockDetails";
import { Pick } from "./Pick";
import { Confirm, GameButton } from "./GameButton";
import { PlayerChit } from "./PlayerChit";
import { RootChit } from "./RootChit";

type ChitSerializationResponse = {
  chits: ChitStateLookup;
  clockDetails: ClockDetails;
};

export type Picks = (undefined | Pick | Pick[] | GameButton | GameButton[])[];

export interface ITurn {
  rng():Promise<number>;
  takeRng(count: number): Promise<() => number>;
  flush():void;
  createTurn<A>(chits: Chit[], player: PlayerChit, cb: (turn: ITurn) => Promise<A>): Promise<A>;
  select(chits: Chit[]): Promise<Chit>;
  pick(message?: string | Picks, help?: string | Picks, picks?: Picks):Promise<void>;
}

export class Turn<T, P extends PlayerChit, R extends RootChit<P>> implements ITurn {
  private pass = 0;
  private clockSteps: ClockStep[] = [];
  private decisionIndex = 0; // decision points that can be potentially rolled back

  /** @internal */
  public unresolvedPrompt?: Prompt;

  /** @internal */
  public completed = false;

  /** @internal */
  public activeSubTurns: Turn<any, P, R>[] = [];

  private newChitCounter = 0;
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
      this.lastChitStates[c.id] = this.lockedChitStates[c.id] = c.serialize();
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
    const fromStates: ChitStateLookup = {};
    let sawChange = false;

    // first ensure they all are locked and all have ids
    Chit.walk(this.chitsToLock, (c) => {
      if (!c.id) {
        c.id = `${this.id}.${this.newChitCounter++}`; // TODO: I thought chit type should be part of the ID?
        c.lock(this);
        this.chitLookup[c.id] = c; // it's possible that this is kicking out an "old" version of this chit from a previous pass
      }
    });

    // now (once per chit) we serialize the state if it changed
    Chit.walk(this.chitsToLock, (c) => {
      if (!c.id) {
        throw new Error("Should not be possible unless Chit.walk is misbehaving");
      }
      if (!seenIds.has(c.id)) {
        seenIds.add(c.id);
        const serialized = c.serialize();
        const lastState = this.lastChitStates[c.id];
        if (serialized !== lastState) {
          // there is a change!
          if (lastState) {
            fromStates[c.id] = lastState;
          } else {
            fromStates[c.id] = Chit.deletedIfSerialized();
          }
          this.lastChitStates[c.id] = newStates[c.id] = serialized;
          sawChange = true;
        }
      } else {
        return false; // already saw this - no need to keep digging into children
      }
    });

    // find any chits that we previously serialized that we no longer see
    // these should be marked as deleted now
    const chitsToDelete = Object.keys(this.lastChitStates)
      .filter((id) => !seenIds.has(id))
      .map((id) => this.findChit(id));

    // find all chits without parents - all of their descendants are safe to be purged
    chitsToDelete
      .filter((chit) => !chit.parent)
      .forEach((chit) => {
        if (chit.id) {
          sawChange = true;
          chit.unlock(this);
          // do not store this new state in lastChitStates, but rather delete this record from it altogether
          newStates[chit.id] = chit.serialize();

          chit.walk((c) => {
            if (c.id) {
              seenIds.add(c.id);
              delete this.lastChitStates[c.id];
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
      this.clockSteps.push(new FlushClockStep(this.clock, newStates, fromStates));
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

    this.flush();

    if (player.playerId && player.playerId !== this.player?.playerId) {
      await this.possiblyConfirm("Confirm switching active player");
    }

    if (player) {
      chits = chits.concat(player);
    }

    if (player && this.activeSubTurns.find((subTurn) => subTurn.player === player)) {
      throw new Error("Only one sub-turn can be active at a time per player");
    }

    const id = `${this.id}.${this.decisionIndex}`;
    const s = this.state.getOrCreateTurnState(this.decisionIndex);
    s.playerId = player?.playerId;
    s.id = id;
    Chit.walk(chits, (chit) => chit.unlock(this));
    const turn = new Turn<A, P, R>(id, this.match, s, cb, chits, player, this);

    this.decisionIndex++;
    this.clockSteps.push(new SubTurnClockStep(turn, this.lastClockStep));

    this.activeSubTurns.push(turn);

    //make sure flow goes to next tick
    await new Promise((resolve) => nextTick(() => resolve(true)));

    const result = await turn.execute();
    this.activeSubTurns = this.activeSubTurns.filter((t) => t !== turn);

    Chit.walk(chits, (chit) => {
      if (chit.id) {
        chit.lock(this);
        this.chitLookup[chit.id] = chit;
      }
    });

    return result;
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
    if (help && typeof help !== "string") {
      picks = help;
      help = undefined;
    }
    if (picks === undefined) {
      throw new Error("No PIcks");
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
  public handleNewSavedState(state: TurnState): boolean {
    const oldState = this.state;
    this.state = state;

    // if we have decisions that the state we are loading does NOT have yet
    // then we have to reset and rerun this turn
    if (oldState.decisions.length > state.decisions.length) {
      this.rerun(this);
      return true;
    }

    // confirm all of the choices are the same
    let hasToReset = false;
    for (let i = 0; i < oldState.decisions.length; i++) {
      const oldDecision = oldState.decisions[i];
      const newDecision = state.decisions[i];

      if (oldDecision.type !== newDecision.type) {
        hasToReset = true;
        break;
      }

      if (oldDecision.type === "rng") {
        if ((oldDecision as RngResponse).value !== (newDecision as RngResponse).value) {
          hasToReset = true;
          break;
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
          nextTick(() => {
            if (!this.unresolvedPrompt) {
              throw new Error("Should have a prompt waiting...");
            }
            this.unresolvedPrompt.resolve(newResponse.response);
          });
        } else if (JSON.stringify(oldResponse.response) !== JSON.stringify(newResponse.response)) {
          hasToReset = true;
          break;
        }
      } else if (oldDecision.type === "turn") {
        const oldTurnState = oldDecision as TurnState;
        const newTurnState = newDecision as TurnState;

        // if this turn isn't finished, then let that turn try to resolve the new state
        const foundTurn = this.activeSubTurns.find((t) => t.id === newTurnState.id);
        if (foundTurn) {
          foundTurn.handleNewSavedState(newTurnState);
        } else if (JSON.stringify(oldTurnState) !== JSON.stringify(newTurnState)) {
          hasToReset = true;
          break;
        }
      }
    }
    if (hasToReset) {
      this.rerun(this);
      return true;
    }
    return false;
  }

  /** @internal */
  serialize(clock: number, currentState?: ClockDetails): ChitSerializationResponse {
    if (clock < 0) {
      clock = 0;
    }
    if (clock > this.clock) {
      clock = this.clock;
    }

    const chits = {};
    let subTurns: { [id: string]: ClockDetails } | undefined;
    const requiredSubTurnIds = new Set();

    // There was a reset.  We have no way of knowing exactly what they had, so we have to
    // resend everything
    if (currentState && currentState.pass !== this.pass) {
      Object.assign(chits, this.lockedChitStates);
      currentState = undefined;
    }

    // if the current state already has knowledge about subturns, we need to pass
    // each and every subturn, otherwise something has gone terribly awry
    if (currentState && currentState.subTurns) {
      Object.keys(currentState.subTurns).forEach((id) => requiredSubTurnIds.add(id));
    }

    let resultingClock = -1;

    if (!currentState || currentState?.clock < clock) {
      // going forwards
      const startClock = currentState?.clock ?? 0;
      let index = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const clockStep = this.clockSteps[index];
        index++;
        if (!clockStep) {
          break;
        }

        if (clockStep.endClock <= startClock) {
          continue;
        }
        if (clockStep.startClock >= clock) {
          break;
        }

        if (clockStep instanceof FlushClockStep) {
          Object.assign(chits, clockStep.state);
          resultingClock = clockStep.endClock;
        } else if (clockStep instanceof SubTurnClockStep) {
          const id = clockStep.turn.id;
          requiredSubTurnIds.delete(id);
          const turnState = currentState?.subTurns && currentState?.subTurns[id];
          const serialized = clockStep.turn.serialize(clock - clockStep.startClock, turnState);

          // if the sub-turn is only partially serialized (meaning we asked for it to be half done)
          // then we need to include the sub-turn clock details.
          if (serialized.clockDetails.clock !== clockStep.turn.clock || !clockStep.turn.completed) {
            if (!subTurns) {
              subTurns = {};
            }
            subTurns[id] = serialized.clockDetails;
          }

          Object.assign(chits, serialized.chits);

          resultingClock = clockStep.startClock + serialized.clockDetails.clock;
        }
      }
    } else {
      // going backwards
      const startClock = currentState?.clock ?? 0;
      let index = this.clockSteps.length - 1;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const clockStep = this.clockSteps[index];
        index--;
        if (!clockStep) {
          break;
        }

        if (clockStep.startClock >= startClock) {
          continue;
        }
        if (clockStep.endClock <= clock) {
          break;
        }

        if (clockStep instanceof FlushClockStep) {
          Object.assign(chits, clockStep.fromState);
          resultingClock = clockStep.startClock;
        } else if (clockStep instanceof SubTurnClockStep) {
          const id = clockStep.turn.id;
          requiredSubTurnIds.delete(id);
          const turnState = currentState?.subTurns && currentState?.subTurns[id];
          const serialized = clockStep.turn.serialize(clock - clockStep.startClock, turnState);

          if (serialized.clockDetails.clock !== 0) {
            if (!subTurns) {
              subTurns = {};
            }
            subTurns[id] = serialized.clockDetails;
          }

          Object.assign(chits, serialized.chits);

          resultingClock = clockStep.startClock + serialized.clockDetails.clock;
        }
      }
    }

    // if not all turns were visited, then something has gone wrong.
    // this likely means there were concurrent turns running and their
    // clocks are moving in a way that the client wasn't expecting.
    // The only way to really fix this is to start over and get a full
    // rundown of all locked chits by this turn from time 0 (of this turn)
    if (requiredSubTurnIds.size > 0) {
      return this.serialize(clock);
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

    const resolution = this.state.getOrCreatePromptResponse(this.decisionIndex);
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
    this.player.promptStatus.latestPromptResponseTime = this.absoluteClock;
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
  destroy() {
    this.activeSubTurns.forEach((turn) => turn.destroy());
    Chit.walk(this.chitsToLock, (c) => {
      c.unlock(this);
    });
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
    this.completed = true;
    this.flush();
    Chit.walk(this.chitsToLock, (c) => {
      c.unlock(this);
    });
  }

  /** @internal */
  get lastClockStep(): ClockStep | undefined {
    return this.clockSteps[this.clockSteps.length - 1];
  }

  /** @internal */
  get clock() {
    return this.lastClockStep?.endClock ?? 0;
  }

  /** @internal */
  get absoluteClock(): number {
    return this.parent?.absoluteClock ?? this.clock;
  }

  /** @internal */
  get clockDetails(): ClockDetails {
    const result: ClockDetails = {
      clock: this.clock,
      pass: this.pass,
    };
    if (this.activeSubTurns.length > 0) {
      result.subTurns = {};
      for (const turn of this.activeSubTurns) {
        result.subTurns[turn.id] = turn.clockDetails;
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
    this.lastChitStates = { ...this.lockedChitStates }; // reset our known chit states
    this.clockSteps = [];
    this.decisionIndex = 0;
    this.newChitCounter = 0;
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
  abstract get endClock(): number;
}

class SubTurnClockStep<P extends PlayerChit, R extends RootChit<P>> extends ClockStep {
  get startClock(): number {
    return this.previousStep?.endClock ?? 0;
  }
  get endClock(): number {
    return this.startClock + this.turn.clock;
  }
  constructor(
    public turn: Turn<any, P, R>,
    private previousStep?: ClockStep,
  ) {
    super();
  }
}

class FlushClockStep extends ClockStep {
  public endClock: number;
  constructor(
    public startClock: number,
    public state: ChitStateLookup,
    public fromState: ChitStateLookup,
  ) {
    super();
    this.endClock = startClock + 1;
  }
}

export class StepBackError extends Error {}
export class RollBackError extends Error {}
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
