import React, { useContext, createContext, ReactNode } from "react";
import { ModalState } from "../game/ModalState";

const ModalContext = createContext<ModalState>(new ModalState());

export function useModalState(): ModalState {
  const result = useContext(ModalContext);
  return result;
}

export function ModalProvider({ children }: { children: ReactNode }) {
  return <ModalContext.Provider value={new ModalState()}>{children}</ModalContext.Provider>;
}
