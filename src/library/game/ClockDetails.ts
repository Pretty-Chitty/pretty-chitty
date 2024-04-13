export type ClockDetails = {
  pass: number;
  clock: number;
  subTurns?: { [turnId: string]: ClockDetails };
};

export function samePasses(a?: ClockDetails, b?: ClockDetails) {
  if (!a || !b) {
    return true;
  }
  if (a.pass !== b.pass) {
    return false;
  }
  if (a.subTurns && b.subTurns) {
    const aTurns = a.subTurns;
    const bTurns = b.subTurns;
    const aTurnIds = Object.keys(a.subTurns);
    const nonSamePass = aTurnIds.find((id: string) => !samePasses(aTurns[id], bTurns[id]));
    if (nonSamePass) {
      return false;
    }
  }
  return true;
}
