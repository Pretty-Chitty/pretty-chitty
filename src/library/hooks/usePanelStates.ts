import { useEffect, useState } from "react";
import { AnimationState, RootChitRenderInstance } from "../rendering/RootChitRenderInstance";

type PanelState = {
  panel?: RootChitRenderInstance;
  paused?: boolean;
  state?: AnimationState;
};

export function usePanelStates(rootChitInstances: (undefined | RootChitRenderInstance)[]): PanelState[] {
  const [states, setStates] = useState<PanelState[]>([]);

  useEffect(() => {
    const updateStates = () => {
      setStates(
        rootChitInstances.map((panel) => ({
          panel,
          paused: panel?.paused,
          state: panel?.animationState,
        })),
      );
    };
    updateStates();
    const cbs = rootChitInstances.map((panel) => panel?.onPanelStatusChange(updateStates));
    return () => cbs.forEach((cb) => cb && cb());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, rootChitInstances);

  return states;
}
