import { EventChannel } from "../../utilities/EventChannel";
import { Chit } from "../Chit";
import { ClientTimeState } from "../ClientTimeState";
import { ClockDetails, samePasses } from "../ClockDetails";
import { Connection } from "../Connection";
import { ConnectionObject } from "../ConnectionObject";
import { Game } from "../Game";
import { ServerTime } from "../serverTransport/ServerTime";
import { ClientPrompts } from "./ClientPrompts";

export class ClientTime extends ConnectionObject {
  private lastSerializedState: { [chitId: string]: string } = {};

  public clientPrompt?: ClientPrompts<any, any>;

  constructor(
    public connection: Connection,
    public game: Game<any, any>,
    public clientTimeState: ClientTimeState,
  ) {
    super();

    this.serverTime = this.connection.get<ServerTime<any, any>>("ServerTime");

    this.register(this.clientTimeState.targetClock.on(() => this.processNewTargetClock()));
    this.register(
      this.clientTimeState.isWaitingOnAnimations.on((isWaiting) => {
        if (
          !isWaiting &&
          this.clientTimeState.live.value &&
          this.clientTimeState.targetClock.value < this.maxClock.value.clock
        ) {
          this.clientTimeState.targetClock.value++;
        }
      }),
    );

    this.clientTimeState.animationSpeedMultiplier.value =
      parseFloat(localStorage["animationSpeedMultiplier"] ?? "1") || 1;
    this.register(
      this.clientTimeState.animationSpeedMultiplier.on((targetSpeed) => {
        localStorage["animationSpeedMultiplier"] = targetSpeed;
      }),
    );
  }

  public currentClock = new EventChannel<ClockDetails>({ clock: 0, pass: -1 });
  private chitLookup: { [id: string]: Chit } = {};
  public maxClock = new EventChannel<ClockDetails>({ clock: 0, pass: -1 });
  public rootChit = new EventChannel<Chit | undefined>(undefined);
  private startTime = 1;

  public readonly findChit: (id: string) => Chit = (id: string) => {
    const result = this.chitLookup[id];
    if (!result) {
      throw new Error("Cannot find chit");
    }
    return result;
  };

  public readonly findChitUnsafe: (id: string) => Chit | undefined = (id: string) => {
    return this.chitLookup[id];
  };

  private serverTime: ServerTime<any, any>;

  public async setStartTime(newTime: number) {
    if (this.clientTimeState.targetClock.value <= newTime) {
      this.clientTimeState.isLoading.value = true;
      this.startTime = newTime;
      this.clientTimeState.targetClock.value = newTime;
    }
  }

  public async newMaxClock(newMaxClock: ClockDetails) {
    const oldClock = this.maxClock.value;
    const isSamePass = samePasses(oldClock, newMaxClock);

    if (isSamePass && oldClock.clock === newMaxClock.clock) {
      return;
    }

    this.maxClock.value = newMaxClock;
    if (this.clientTimeState.live.value || !isSamePass) {
      if (
        !this.clientTimeState.isWaitingOnAnimations.value &&
        this.clientTimeState.targetClock.value < this.maxClock.value.clock
      ) {
        this.clientTimeState.targetClock.value++;
      } else if (!this.clientTimeState.isWaitingOnAnimations.value) {
        // some other use has reset...
        this.clientTimeState.targetClock.value = this.maxClock.value.clock;
      } else {
        this.processNewTargetClock();
      }
    }
  }

  private _states: { [stateId: number]: string } = {};
  private inflateSerializedResponse(newState: { [state: number]: string }, chitStates: { [id: string]: number }) {
    Object.assign(this._states, newState);
    return Object.fromEntries(Object.entries(chitStates).map(([key, value]) => [key, this._states[value]]));
  }

  private async processNewTargetClock() {
    const newTargetClock = this.clientTimeState.targetClock.value;
    const currentClock = this.currentClock.value;

    if (newTargetClock > this.maxClock.value.clock) {
      this.clientTimeState.targetClock.value = this.maxClock.value.clock;
      return;
    }
    if (newTargetClock < 1) {
      this.clientTimeState.targetClock.value = 1;
      return;
    }
    if (newTargetClock > this.startTime) {
      this.clientTimeState.isLoading.value = false;
    }

    // make sure our async operations don't get interrupted by auto-advancing the timeline
    const animationKey = `minimumAnimationDuration${Date.now()}`;
    this.clientTimeState.setAnimationState(animationKey, true);

    const response = await this.serverTime.serializeDelta(this.clientTimeState.targetClock.value);
    const serializedChits = this.inflateSerializedResponse(response.newStates, response.chits);

    // make sure nothing changed while we were waiting...
    if (this.clientTimeState.targetClock.value === newTargetClock && currentClock === this.currentClock.value) {
      // first make sure all chits exist (because they may link to each other)
      Object.entries(serializedChits).forEach(([id, value]) => {
        let chit = this.chitLookup[id];
        if (!chit) {
          const c = Chit.deflate(value, this.game);
          if (c) {
            chit = this.chitLookup[id] = c;
          }
        }
      });

      Object.values(this.chitLookup).forEach((chit) => {
        if (chit.id && !serializedChits[chit.id]) {
          if (chit.parentFallback) {
            chit.beginDeserializing();
            chit.setParent(chit.parentFallback, chit.parentOutlet ?? "graveyard");
            chit.doneDeserializing();
          } else {
            chit.removeFromParent();
          }
          delete this.lastSerializedState[chit.id];
        }
      });

      this.currentClock.value = response.clockDetails;

      // now actually load the new state
      const changedIds = new Set(
        Object.entries(serializedChits)
          .filter(([id, value]) => this.chitLookup[id] && this.lastSerializedState[id] !== value)
          .map(([id]) => id),
      );

      const chits: Chit[] = Object.entries(serializedChits)
        .filter(([id, value]) => this.chitLookup[id] && this.lastSerializedState[id] !== value)
        .map(([id]) => this.chitLookup[id]);

      chits.forEach((chit) => chit.beginDeserializing());

      Object.entries(serializedChits)
        .filter(([id]) => changedIds.has(id))
        .forEach(([id, value]) => {
          const chit = this.chitLookup[id];
          chit.deserialize(value, this.findChit);
          this.lastSerializedState[id] = value;
        });

      chits.forEach((chit) => chit.doneDeserializing());

      this.rootChit.value = this.findChit("root");

      // sometimes deserializing chits does not result in animations (maybe a pure texture change?)
      // in that case, we need to make sure that the clock moves forward
      setTimeout(() => this.clientTimeState.setAnimationState(animationKey, false), 100);
    } else {
      this.clientTimeState.setAnimationState(animationKey, false);
    }
  }
}
