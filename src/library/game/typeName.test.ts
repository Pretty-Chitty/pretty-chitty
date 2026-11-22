import { describe, expect, test } from "vitest";

import { Chit } from "./Chit";
import { Game } from "./Game";
import { Confirm } from "./GameButton";
import { SparkChit } from "./SparkChit";
import { setTypeName, typeNameOf, typeNameOfInstance } from "./typeName";

/** Simulate a bundler renaming a class (`Card` → `Card2`). */
function renamed<T extends abstract new () => unknown>(ctor: T, name: string): T {
  Object.defineProperty(ctor, "name", { value: name, configurable: true });
  return ctor;
}

describe("typeName", () => {
  test("falls back to constructor.name", () => {
    class Plain extends Chit {}
    expect(typeNameOf(Plain)).toBe("Plain");
  });

  test("pinned name wins over a renamed constructor", () => {
    const Card = renamed(class Card extends Chit {}, "Card2");
    setTypeName(Card, "Card");
    expect(typeNameOf(Card)).toBe("Card");
    expect(typeNameOfInstance(new Card())).toBe("Card");
  });

  test("subclasses do not inherit a parent's pinned name", () => {
    class Card extends Chit {}
    setTypeName(Card, "Card");
    class SpecialCard extends Card {}
    expect(typeNameOf(SpecialCard)).toBe("SpecialCard");
  });

  test("engine built-ins are pinned", () => {
    expect(typeNameOf(SparkChit)).toBe("SparkChit");
    expect(typeNameOf(Confirm)).toBe("Confirm");
  });

  test("serialize/deflate round-trips through a renamed class", () => {
    const Card = renamed(class Card extends Chit {}, "Card2");
    setTypeName(Card, "Card");
    const game = { chitLibrary: { Card } } as unknown as Game<any, any>;

    const card = new Card();
    card.id = "c1";
    const serialized = card.serialize();
    expect(JSON.parse(serialized).__chitType).toBe("Card");
    expect(Chit.deflate(serialized, game)).toBeInstanceOf(Card);
  });
});
