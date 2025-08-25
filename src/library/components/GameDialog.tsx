import React from "react";
import Color from "color";
import { Dialog, useTheme } from "@mui/material";
import { ReactNode } from "react";
import { useGameTheme } from "../hooks/useGameTheme";

export default function GameDialog({
  children,
  open,
  onClose,
}: {
  children: ReactNode[] | ReactNode;
  open: boolean;
  onClose: () => void;
}) {
  const muiTheme = useTheme();
  const theme = useGameTheme();

  return (
    <Dialog
      onClose={onClose}
      open={open}
      PaperProps={{
        style: {
          backgroundColor: "transparent",
          color: theme.dialogForegroundColor,
          fontSize: 16,
          fontFamily: muiTheme.typography.fontFamily,
        },
        elevation: 0,
      }}
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: Color(theme.dialogBackgroundColor).alpha(0.8).hexa(),
          },
        },
      }}
    >
      {children}
    </Dialog>
  );
}
