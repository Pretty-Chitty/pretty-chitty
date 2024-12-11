import React, { ReactNode } from 'react';
import { Dialog } from '@mui/material';

import { useGameTheme } from '../hooks/useGameTheme';

export default function GameDialog({
  children,
  open,
  onClose,
}: {
  children: ReactNode[] | ReactNode;
  open: boolean;
  onClose: () => void;
}) {
  const theme = useGameTheme();

  return (
    <Dialog
      onClose={onClose}
      open={open}
      PaperProps={{
        style: {
          backgroundColor: 'transparent',
          color: theme.dialogForegroundColor,
          fontSize: 16,
        },
        elevation: 0,
      }}
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: theme.dialogBackgroundColor,
          },
        },
      }}
    >
      {children}
    </Dialog>
  );
}
