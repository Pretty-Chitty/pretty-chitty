import React, { ReactNode } from 'react';

import { Chit } from './Chit';
import TopBarDropdown from '../components/TopBarDropdown';

export abstract class DropdownChit extends Chit {
  /** @internal */
  type = 'dropdown';

  abstract renderLabel(): string | ReactNode;
  abstract renderBody(): string | ReactNode | ReactNode[];

  /** @internal */
  render() {
    return <TopBarDropdown label={this.renderLabel()}>{this.renderBody()}</TopBarDropdown>;
  }
}
