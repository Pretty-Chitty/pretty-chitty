import { DynamicGameButton, GameButton, ToggleGalleryButton } from "../library/game/GameButton";

export class FlipButton extends DynamicGameButton<{ flipped: boolean }> {
  process(spec: { flipped: boolean }) {
    this.label = spec.flipped ? "Unflip it" : "Flip it";
  }
}

export class PassButton extends GameButton {
  public label = "Pass";
}

export class HandButton extends ToggleGalleryButton {
  public label = "Hand";
}
