import { EventChannel } from "../utilities/EventChannel";

export class ClientTimeState {
  public live = new EventChannel<boolean>(true);
  public isWaitingOnAnimations = new EventChannel<boolean>(true);
  public targetClock = new EventChannel<number>(1, 250);

  public animationSpeedMultiplier = new EventChannel<number>(1);
  public animationSpeedOverrideMultiplier = new EventChannel<number | undefined>(undefined);
  public isLoading = new EventChannel<boolean>(true);

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

  public goLive(clock: number) {
    this.live.value = true;
    this.targetClock.value = clock;
    this.animationSpeedOverrideMultiplier.value = 0.00001;
    setTimeout(() => {
      this.animationSpeedOverrideMultiplier.value = undefined;
    }, 250);
  }
}
