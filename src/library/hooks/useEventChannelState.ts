import { useEffect, useState } from 'react';

import { EventChannel } from '../utilities/EventChannel';

export function useEventChannelState<T>(e: EventChannel<T>): [T, (a: T) => void] {
  const [v, setV] = useState<T>(e.value);

  useEffect(() => {
    // calling explicitly here saves a `nextTick` scheduling and fixes the problem where a value
    // changes between when this is invoked and when useEffect is invoked.
    setV(e.value);
    e.on(setV, false);
  }, [e]);
  return [
    v,
    (newValue: T) => {
      e.value = newValue;
    },
  ];
}

export function useMultiEventChannelState<T, Z>(list: Z[], mapper: (arg: Z) => EventChannel<T>): T[] {
  const eventChannels = list.map(mapper);
  const [v, setV] = useState<T[]>(eventChannels.map((d) => d.value));

  useEffect(() => {
    const cbs = eventChannels.map((z) => z.on(() => setV(eventChannels.map((d) => d.value)), false));
    return () => cbs.forEach((cb) => cb());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...list, mapper]);
  return v;
}
