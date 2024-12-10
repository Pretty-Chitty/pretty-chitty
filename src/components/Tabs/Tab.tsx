import React, { FC, PropsWithChildren } from 'react';

import { useTab } from './context';

export const Tab: FC<PropsWithChildren<{ id?: string }>> = ({ children, id }) => {
  const tabAttributes = useTab();

  return (
    <div {...tabAttributes} id={id}>
      {children}
    </div>
  );
};
