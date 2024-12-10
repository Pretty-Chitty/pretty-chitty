import { expect, test } from 'vitest';

import { ChildOutlet, NonEditable } from '../utilities/Annotations';
import { Chit } from './Chit';

class ChitSubClass extends Chit {
  public s1 = 's1';
  public n1 = 5;
  public o1 = { a: 5, b: 6 };
  @NonEditable public n2 = 6;
}
class ChitWithOutlet extends Chit {
  @ChildOutlet
  c1 = new ChitSubClass();
  @ChildOutlet
  c2 = new ChitSubClass();
  label = 'hi there';
}

test('basic serialization and deserialization', () => {
  const c1 = new ChitSubClass();
  c1.s1 = 's1b';
  c1.n1 = 15;
  c1.o1.a = 8;
  c1.o1.b = 9;
  c1.n2 = 12;

  const c2 = new ChitSubClass();
  const serialized = c1.serialize();
  c2.deserialize(serialized, () => c1);
  expect(c2.s1).toBe('s1b');
  expect(c2.n1).toBe(15);
  expect(c2.o1.a).toBe(8);
  expect(c2.o1.b).toBe(9);
  expect(c2.n2).toBe(6); // the original value
});

test('chit references', () => {
  const c = new ChitWithOutlet();
  c.id = 'c';
  c.c1.id = 'c1';
  c.c1.n1 = 99;
  c.c1.s1 = 'some s';
  c.c2.id = 'c2';
  const lu: { [id: string]: Chit } = { c, c1: c.c1, c2: c.c2 };
  const originalC1 = c.c1;
  const originalC2 = c.c2;
  const serialized = c.serialize();

  const cCopy = new ChitWithOutlet();
  cCopy.deserialize(serialized, (id) => lu[id]);
  expect(cCopy.c1).toBe(originalC1);
  expect(cCopy.c2).toBe(originalC2);

  lu['c'] = cCopy;
  const c1Serialized = cCopy.c1.serialize();
  const sub = new ChitSubClass();
  sub.deserialize(c1Serialized, (id) => lu[id]);
  expect(sub.parent).toBe(cCopy);
  expect(sub.n1).toBe(99);
  expect(sub.s1).toBe('some s');
  expect(sub.parentOutlet).toBe('c1');

  // TODO: maybe assigning parentoutlet should be two way street?  but probably doesn't matter and serialization and deserialization will always go
  // at the same time.
});
