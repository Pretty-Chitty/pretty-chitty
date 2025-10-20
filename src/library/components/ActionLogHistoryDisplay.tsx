import React from "react";
import { GameModalDialog } from "./GameModalDialog";
import { ActionLogHistory } from "./ActionLogHistory";
import { useModalState } from "../hooks/useModalState";
import { useEventChannelState } from "../hooks/useEventChannelState";

export function ActionLogHistoryDisplay() {
  const modalState = useModalState();
  const [visible, setVisible] = useEventChannelState(modalState.actionLogVisible);

  return (
    <GameModalDialog visible={visible} onClose={() => setVisible(false)} title="Log">
      <ActionLogHistory visible={visible} />
    </GameModalDialog>
  );
}
