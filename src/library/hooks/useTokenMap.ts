import { useChit, useChits } from "../hooks/useChits";
import { PlayerChit } from "../game/PlayerChit";
import { RootChit } from "../game/RootChit";
import { buildTokenMap, TokenMap } from "../utilities/TokenizedText";
import { useGameTheme } from "./useGameTheme";
import { useGame } from "./useGame";

export function useTokenMap() {
  const theme = useGameTheme();
  const game = useGame();
  const root = useChit<RootChit<PlayerChit>>("root");
  const playerChits = useChits<PlayerChit>(root?.players.map((p) => p.id ?? "") ?? []);

  const tokenMap: TokenMap = buildTokenMap(game.tokenMap, playerChits ?? [], theme.actionLogTextColor);
  return tokenMap;
}
