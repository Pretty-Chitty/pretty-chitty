import React, { useContext, createContext, ReactNode } from "react";
import { GalleryState } from "../game/GalleryState";

const GalleryContext = createContext<GalleryState>(new GalleryState());

export function useGalleryState(): GalleryState {
  const result = useContext(GalleryContext);
  return result;
}

export function GalleryProvider({ children }: { children: ReactNode }) {
  return <GalleryContext.Provider value={new GalleryState()}>{children}</GalleryContext.Provider>;
}
