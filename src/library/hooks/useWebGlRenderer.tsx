import React, { useContext, createContext, ReactNode, useEffect, useState } from 'react';
import { WebGLRenderer } from 'three';

const WebGlRendererContext = createContext<{
  used: { [key: string]: WebGLRendererWrapper };
  unused: WebGLRendererWrapper[];
}>({ used: {}, unused: [] });

class WebGLRendererWrapper {
  public referenceCount = 0;
  constructor(public renderer: WebGLRenderer) {
    this.renderer.setPixelRatio(Math.max(1.5, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
  }
}

export function useWebGlRenderer(w: number, h: number): WebGLRenderer | undefined {
  const [renderer, setRenderer] = useState<WebGLRenderer | undefined>(undefined);
  const context = useContext(WebGlRendererContext);

  useEffect(() => {
    const key = `${w}_${h}`;
    let rendererWrapper: WebGLRendererWrapper | undefined = context.used[key];
    if (!rendererWrapper) {
      rendererWrapper = context.unused.pop();
      if (!rendererWrapper) {
        rendererWrapper = new WebGLRendererWrapper(new WebGLRenderer());
      }
      rendererWrapper.renderer.setSize(w, h);
      context.used[key] = rendererWrapper;
    }
    rendererWrapper.referenceCount++;
    setRenderer(rendererWrapper.renderer);
    return () => {
      rendererWrapper.referenceCount--;
      if (rendererWrapper.referenceCount === 0) {
        delete context.used[key];
        context.unused.push(rendererWrapper);
      }
      setRenderer(undefined);
    };
  }, [context, w, h]);

  return renderer;
}

export function WebGlRendererProvider({ children }: { children: ReactNode }) {
  return <WebGlRendererContext.Provider value={{ used: {}, unused: [] }}>{children}</WebGlRendererContext.Provider>;
}
