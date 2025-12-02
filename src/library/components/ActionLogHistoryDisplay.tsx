import React, { useEffect } from "react";
import { GameModalDialog } from "./GameModalDialog";
import { ActionLogHistory } from "./ActionLogHistory";
import { useModalState } from "../hooks/useModalState";
import { useEventChannelState } from "../hooks/useEventChannelState";
import { useTimeState } from "../hooks/useTimeController";

export function ActionLogHistoryDisplay() {
  const modalState = useModalState();
  const [visible, setVisible] = useEventChannelState(modalState.actionLogVisible);
  const timeState = useTimeState();
  useEffect(() => {
    timeState.setAnimationState("actionLogOpen", visible);
  }, [visible, timeState]);

  return (
    <GameModalDialog visible={visible} onClose={() => setVisible(false)} title="Log">
      <ActionLogHistory visible={visible} />
    </GameModalDialog>
  );
}
