import { GameTheme } from "../../game/GameTheme";

export function panelTransition(theme: GameTheme, animationSpeedMultiplier: number) {
  return `width ease-out ${0.25 * animationSpeedMultiplier}s, height ease-out ${0.25 * animationSpeedMultiplier}s, left ease-in-out ${0.25 * animationSpeedMultiplier}s, top ease-in-out ${0.25 * animationSpeedMultiplier}s`;
}
