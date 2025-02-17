import { EventChannel } from "../../utilities/EventChannel";
import { Chit } from "../Chit";
import { ClientTimeState } from "../ClientTimeState";
import { ClockDetails, samePasses } from "../ClockDetails";
import { Connection } from "../Connection";
import { ConnectionObject } from "../ConnectionObject";
import { Game } from "../Game";
import { ServerTime } from "../serverTransport/ServerTime";

export class ClientTime extends ConnectionObject {
  private lastSerializedState: { [chitId: string]: string } = {};

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
  private startTime = 0;

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
      } else {
        this.processNewTargetClock();
      }
    }
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

    const result = await this.serverTime.serializeDelta(currentClock, this.clientTimeState.targetClock.value);

    // make sure nothing changed while we were waiting...
    if (this.clientTimeState.targetClock.value === newTargetClock && currentClock === this.currentClock.value) {
      // first make sure all chits exist (because they may link to each other)
      Object.entries(result.chits).forEach(([id, value]) => {
        let chit = this.chitLookup[id];
        if (!chit) {
          chit = this.chitLookup[id] = Chit.deflate(value, this.game);
        }
      });

      // if root "pass" is different, mark all chits as "deleted"
      if (this.currentClock.value.pass !== result.clockDetails.pass) {
        Object.values(this.chitLookup).forEach((chit) => {
          if (chit.id && !result.chits[chit.id]) {
            chit.removeFromParent();
          }
        });
      }

      this.currentClock.value = result.clockDetails;

      // now actually load the new state
      const chits = Object.entries(result.chits)
        .filter(([id, value]) => this.lastSerializedState[id] !== value)
        .map(([id]) => this.chitLookup[id]);

      chits.forEach((chit) => chit.beginDeserializing());

      Object.entries(result.chits).forEach(([id, value]) => {
        const chit = this.chitLookup[id];
        chit.deserialize(value, this.findChit);
        this.lastSerializedState[id] = value;
      });

      chits.forEach((chit) => chit.doneDeserializing());

      this.rootChit.value = this.findChit("root");

      // sometimes deserializing chits does not result in animations (maybe a pure texture change?)
      // in that case, we need to make sure that the clock moves forward
      const animationKey = `minimumAnimationDuration${Date.now()}`;
      this.clientTimeState.setAnimationState(animationKey, true);
      setTimeout(() => this.clientTimeState.setAnimationState(animationKey, false), 100);

      // if (
      //   this.currentClock.value.clock >= 2 &&
      //   this.clientTimeState.animationSpeedMultiplier.value !==
      //     this.clientTimeState.animationSpeedMultiplier.value
      // ) {
      //   const checkForAnimationEnd = () => {
      //     if (!this.clientTimeState.isWaitingOnAnimations.value) {
      //       this.clientTimeState.animationSpeedMultiplier.value =
      //         this.clientTimeState.animationSpeedMultiplier.value;
      //     } else if (this.currentClock.value.clock >= this.clientTimeState.targetClock.value) {
      //       setTimeout(
      //         () =>
      //           (this.clientTimeState.animationSpeedMultiplier.value =
      //             this.clientTimeState.animationSpeedMultiplier.value),
      //         100,
      //       );
      //     } else {
      //       setTimeout(checkForAnimationEnd, 100);
      //     }
      //   };
      //   checkForAnimationEnd();
      // }
    }
  }
}
