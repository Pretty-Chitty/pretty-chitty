import { useChit, useChits } from "../hooks/useChits";
import { PlayerChit } from "../game/PlayerChit";
import { RootChit } from "../game/RootChit";
import { TokenDefinition } from "../components/TokenizedMessage";
import { useGameTheme } from "./useGameTheme";

export function useTokenMap() {
  const theme = useGameTheme();
  const root = useChit<RootChit<PlayerChit>>("root");
  const playerChits = useChits<PlayerChit>(root?.players.map((p) => p.id ?? "") ?? []);

  const tokenMap: { [key: string]: TokenDefinition } = {};
  playerChits?.forEach((p) => {
    tokenMap[p.playerId] = { label: p.name ?? "??", color: p.color ?? theme.actionLogTextColor, image: p.imageUrl };
  });
  tokenMap["warning"] = { label: "⚠️" };
  return tokenMap;
}
