import { expect, test } from "vitest";

import { Chit } from "./Chit";
import { OrderedOutlet } from "./OrderedOutlet";

class Item extends Chit {}
class Holder extends Chit {
  items = new OrderedOutlet<Item>("items", this);
}

test("pop detaches the chit it returns", () => {
  const h = new Holder();
  const a = new Item();
  const b = new Item();
  h.items.add(a);
  h.items.add(b);
  expect(b.parent).toBe(h);

  expect(h.items.pop()).toBe(b);
  expect(h.items.length).toBe(1);
  expect(b.parent).toBeUndefined();
  expect(a.parent).toBe(h);
  expect(a.parentOutletIndex).toBe(0);

  expect(h.items.pop()).toBe(a);
  expect(a.parent).toBeUndefined();
  expect(h.items.pop()).toBeUndefined();
});
