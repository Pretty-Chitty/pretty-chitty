import { EventChannel } from "../utilities/EventChannel";

export class ClientTimeState {
  public live = new EventChannel<boolean>(true);
  public isWaitingOnAnimations = new EventChannel<boolean>(true);
  public targetClock = new EventChannel<number>(1, 250);

  public skipReplay = new EventChannel<boolean>(false);
  public showLog = new EventChannel<boolean>(false);
  public animationSpeedMultiplier = new EventChannel<number>(1);
  public animationSpeedOverrideMultiplier = new EventChannel<number | undefined>(undefined);
  public isLoading = new EventChannel<boolean>(true);
  /**
   * The furthest clock this client may show, or undefined to follow the game. A tutorial holds the
   * board here to talk about what is on screen while the game itself plays on; raising or lifting the
   * hold lets the board animate on from where it stopped. Only this client's view is affected.
   */
  public timelineHold = new EventChannel<number | undefined>(undefined);

  /** The furthest clock the board may play to: the game's latest, or the hold if that is lower */
  public playableClock(maxClock: number) {
    const hold = this.timelineHold.value;
    return hold === undefined ? maxClock : Math.min(hold, maxClock);
  }
  /**
   * Open live instead of replaying what happened since the player's last answer, once (the next
   * `setStartTime`). For a viewer on a match that was just rebuilt (a tutorial's Back), where the
   * replay would only re-show moves the player already watched.
   */
  public skipInitialReplay = false;

  private currentlyAnimating = new Set<string>();
  public setAnimationState(key: string, isAnimating: boolean) {
    if (isAnimating) {
      this.currentlyAnimating.add(key);

      if (this.currentlyAnimating.size === 1) {
        this.isWaitingOnAnimations.value = true;
      }
    } else {
      this.currentlyAnimating.delete(key);

      if (this.currentlyAnimating.size === 0) {
        this.isWaitingOnAnimations.value = false;
      }
    }
  }

  _animationOverrideTimeout: NodeJS.Timeout | undefined;

  public goLive(clock: number) {
    this.live.value = true;
    this.targetClock.value = clock;
    this.killAnimations();
  }

  public killAnimations() {
    clearTimeout(this._animationOverrideTimeout);
    this.animationSpeedOverrideMultiplier.value = 0.075;
    this._animationOverrideTimeout = setTimeout(() => {
      this.animationSpeedOverrideMultiplier.value = undefined;
    }, 400);
  }
}
