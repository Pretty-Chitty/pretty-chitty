import React, { useContext, createContext, ReactNode } from "react";
import { ModalState } from "../game/ModalState";

const ModalContext = createContext<ModalState>(new ModalState());

export function useModalState(): ModalState {
  const result = useContext(ModalContext);
  return result;
}

export function ModalProvider({ children, modalState }: { modalState: ModalState; children: ReactNode }) {
  return <ModalContext.Provider value={modalState}>{children}</ModalContext.Provider>;
}
