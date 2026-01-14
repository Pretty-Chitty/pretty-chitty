import React, { useContext, createContext, ReactNode } from "react";

export type LoadingStatesCallback = (panelsCreated: number, panelsLoaded: number) => void;

export class LoadingStates {
  private cbs: LoadingStatesCallback[] = [];
  private loadingMap: { [id: string]: boolean } = {};
  private errored = false;

  setLoading(key: string, isLoading: boolean) {
    if (this.loadingMap[key] !== isLoading) {
      this.loadingMap[key] = isLoading;
      this.notify();
    }
  }

  markError() {
    this.errored = true;
    this.notify();
  }

  public onChange(cb: LoadingStatesCallback): () => void {
    this.cbs.push(cb);
    setTimeout(() => this.notify(), 0);
    return () => {
      this.cbs = this.cbs.filter((c) => c !== cb);
    };
  }

  private notify() {
    if (!this.errored) {
      const values = Object.values(this.loadingMap);
      const loaded = values.filter((v) => !v);
      this.cbs.forEach((cb) => cb(values.length, loaded.length));
    } else {
      this.cbs.forEach((cb) => cb(1, 1));
    }
  }
}

const LoadingStateContext = createContext<LoadingStates>(new LoadingStates());

export function useLoadingState(): LoadingStates {
  return useContext(LoadingStateContext);
}

export function LoadingStateProvider({
  children,
  loadingStates,
}: {
  children: ReactNode;
  loadingStates: LoadingStates;
}) {
  return <LoadingStateContext.Provider value={loadingStates}>{children}</LoadingStateContext.Provider>;
}
