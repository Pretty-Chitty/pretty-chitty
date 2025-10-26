import { GameTheme } from "../../game/GameTheme";

const DURATION = 0.125;

export function panelTransition(theme: GameTheme, animationSpeedMultiplier: number) {
  return `width ease-in-out ${DURATION * animationSpeedMultiplier}s, height ease-in-out ${DURATION * animationSpeedMultiplier}s, left ease-in-out ${DURATION * animationSpeedMultiplier}s, top ease-in-out ${DURATION * animationSpeedMultiplier}s`;
}
