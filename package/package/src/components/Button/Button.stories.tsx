import React from 'react';

import { DemoGame } from '../../demo/DemoGame';
import Playground from '../../library/components/Playground';
import { Button } from './Button';

export default {
  title: 'Buttonz',
  component: Button, // {/* <Playground game={new DemoGame()} /> */}
};

export const Default = {
  args: {
    disabled: false,
    children: `I'm a Button`,
  },
};

export const Plarg = {
  args: Button.args,
};
