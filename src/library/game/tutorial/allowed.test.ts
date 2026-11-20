import { describe, expect, test } from "vitest";
import { Chit } from "../Chit";
import { PlayerChit } from "../PlayerChit";
import { RootChit } from "../RootChit";
import { AllowedAction } from "./defineTutorial";
import { isAllowed, MoveShape } from "./allowed";

class Spot extends Chit {
  constructor(
    public x = 0,
    public y = 0,
  ) {
    super();
  }
}

type R = RootChit<PlayerChit>;
const root = new RootChit<PlayerChit>();
const me = new PlayerChit();
const piece = new Spot();
const near = new Spot(12, 0);
const far = new Spot(3, 4);
const drag = (target: Spot | undefined, key = "place.drag"): MoveShape => ({
  kind: "drag",
  key,
  chitId: "piece",
  targetId: "spot",
  chit: piece,
  target,
});

describe("isAllowed with chitIs and targetIs", () => {
  const allow: AllowedAction<PlayerChit, R> = {
    key: "place.drag",
    targetIs: (t: Spot) => t.x === 12 && t.y === 0,
  };

  test("targetIs tests the target actually dropped on", () => {
    expect(isAllowed(allow, drag(near), root, me)).toBe(true);
    expect(isAllowed(allow, drag(far), root, me)).toBe(false);
  });

  test("other fields still have to match", () => {
    expect(isAllowed(allow, drag(near, "other.drag"), root, me)).toBe(false);
  });

  test("a move whose target could not be looked up is refused, as is a tap", () => {
    expect(isAllowed(allow, drag(undefined), root, me)).toBe(false);
    expect(isAllowed(allow, { kind: "chit", key: "place.drag", chitId: "spot", chit: near }, root, me)).toBe(false);
  });

  test("a test that throws refuses the move", () => {
    const throwing: AllowedAction<PlayerChit, R> = {
      targetIs: () => {
        throw new Error("boom");
      },
    };
    expect(isAllowed(throwing, drag(near), root, me)).toBe(false);
  });

  test("chitIs tests the chit played, for taps and drags; never for buttons", () => {
    const red: AllowedAction<PlayerChit, R> = { chitIs: (c: Spot) => c.x === 12 };
    expect(isAllowed(red, { kind: "chit", chitId: "spot", chit: near }, root, me)).toBe(true);
    expect(isAllowed(red, { kind: "chit", chitId: "spot", chit: far }, root, me)).toBe(false);
    expect(isAllowed(red, { kind: "button", buttonLabel: "Done" }, root, me)).toBe(false);
  });
});
