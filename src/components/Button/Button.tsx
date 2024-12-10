import React, { ReactNode, useEffect, useState } from 'react';

import { MyClass } from '../../MyClass';
import ButtonThingy from './ButtonThingy';

export function Button({
  onClick,
  disabled,
  className,
  children,
  ...rest
}: {
  onClick: () => void;
  disabled: boolean;
  className: string;
  children: ReactNode;
}) {
  const [counter, setCounter] = useState<number>(0);
  const [v, setV] = useState<number>(0);
  const nc = new MyClass();
  (nc as any).__counter++;

  useEffect(() => {
    setTimeout(() => setCounter(counter + 1), 1000);
  }, [counter]);

  useEffect(() => {
    const bt = new ButtonThingy();
    setV(bt.calc());
  }, [ButtonThingy]);

  return (
    <button type="button" onClick={onClick} disabled={disabled} {...rest}>
      What {counter} {children} {v}
    </button>
  );
}

Button.args = { disabled: true, testing: 125, children: `I'm a Buttonz` };
