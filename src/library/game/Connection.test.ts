import { expect, test } from 'vitest';

import { Connection } from './Connection';
import { LocalConnectionTransport } from './ConnectionTransport';
import { ConnectionObject } from './ConnectionObject';

class ClientClass extends ConnectionObject {
  async doThing(a: number, b: number, shouldFail: boolean): Promise<number> {
    await new Promise((resolve) => setTimeout(resolve, 10));
    if (shouldFail) {
      throw new Error('Failed');
    }
    return a + b;
  }
}

class RemoteClass extends ConnectionObject {
  async doOtherThing(a: number, b: number, shouldFail: boolean): Promise<number> {
    await new Promise((resolve) => setTimeout(resolve, 10));
    if (shouldFail) {
      throw new Error('Failed');
    }
    return a * b;
  }
}

test('basic invocation', async () => {
  const localTransport1 = new LocalConnectionTransport();
  const c1 = new Connection(localTransport1);
  c1.register(new ClientClass());

  const remoteTransport1 = new LocalConnectionTransport();
  const c2 = new Connection(remoteTransport1);
  c2.register(new RemoteClass());

  localTransport1.connect(remoteTransport1);

  // try a local call
  const localRef = c1.get<ClientClass>('ClientClass');
  await expect(localRef.doThing(2, 3, false)).resolves.toBe(5);

  // try a remote call
  const remoteRef = c1.get<RemoteClass>('RemoteClass');
  await expect(remoteRef.doOtherThing(2, 3, false)).resolves.toBe(6);

  // try a failing local call
  await expect(localRef.doThing(2, 3, true)).rejects.toThrowError(/Failed/);

  // try a remote call
  await expect(remoteRef.doOtherThing(2, 3, true)).rejects.toThrowError(/Failed/);
});
