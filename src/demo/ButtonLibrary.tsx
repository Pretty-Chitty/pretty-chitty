import { DynamicGameButton } from "../library/game/GameButton";

export class FlipButton extends DynamicGameButton<{ flipped: boolean }> {
  process(spec: { flipped: boolean }) {
    this.label = spec.flipped ? "Unflip it" : "Flip it";
  }
}
