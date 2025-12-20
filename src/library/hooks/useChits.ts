import { useEffect, useState } from "react";
import { Chit } from "../game/Chit";
import { useTimeController } from "./useTimeController";

export function useChits<C extends Chit>(ids: string[]) {
  const time = useTimeController();
  const [result, setResult] = useState<C[]>([]);

  const idString = ids.join("___");

  useEffect(() => {
    const resultVersions = result.map((r) => r.version);
    return time.currentClock.on(() => {
      const chits = ids.map((id) => time.findChitUnsafe(id) as C).filter((c) => c);
      if (
        result.length !== chits.length ||
        chits.find((el, i) => el !== result[i] || el.version !== resultVersions[i])
      ) {
        setResult(chits);
      }
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time, idString, result]);

  return result;
}

export function useChit<C extends Chit>(id: string): C | undefined {
  const chits = useChits<C>([id]);
  return chits[0];
}
