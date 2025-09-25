import React, { useContext, createContext, ReactNode, useEffect, useState } from "react";
import { WebGLRenderer, Vector2 } from "three";
import { EffectComposer, IDBasedOutlinePass, OutputPass, RenderPass, Camera, SceneWrapper } from "../rendering/outline";

const WebGlRendererContext = createContext<{
  used: { [key: string]: WebGLRendererWrapper };
  unused: WebGLRendererWrapper[];
}>({ used: {}, unused: [] });

class WebGLRendererWrapper {
  public referenceCount = 0;
  public composer: EffectComposer;
  public renderPass: RenderPass;
  public outlinePass: IDBasedOutlinePass;
  public outputPass: OutputPass;

  constructor(
    public renderer: WebGLRenderer,
    width: number,
    height: number,
    transparent: boolean = false,
  ) {
    this.renderer.setPixelRatio(Math.max(1.5, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;

    // Ensure proper alpha handling for shadows
    if (!transparent) {
      this.renderer.setClearColor(0xffffff, 1.0); // Opaque white background for shadows
    }

    // Setup effect composer with standard passes
    this.composer = new EffectComposer(renderer);

    this.renderPass = new RenderPass();
    this.outlinePass = new IDBasedOutlinePass(
      new Vector2(width * window.devicePixelRatio, height * window.devicePixelRatio),
    );
    this.outputPass = new OutputPass();

    // Configure transparency
    if (transparent) {
      this.renderPass.clearColor = 0x000000; // Black background
      this.renderPass.clearAlpha = 0; // But transparent
    }

    // Configure outline pass with standard settings
    this.outlinePass.edgeStrength = 0.75;
    this.outlinePass.edgeThickness = 1;
    this.outlinePass.downSampleRatio = 1;

    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.outlinePass);
    this.composer.addPass(this.outputPass);

    this.setSize(width, height);
  }

  render(sceneWrapper: SceneWrapper, camera: Camera) {
    this.composer.render(sceneWrapper, camera);
  }

  setSize(width: number, height: number) {
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
    this.outlinePass.setSize(width * window.devicePixelRatio, height * window.devicePixelRatio);
  }

  dispose() {
    this.composer.dispose();
    this.outlinePass.dispose();
    this.renderer.dispose();
  }
}

export function useWebGlRenderer(w: number, h: number, transparent: boolean = false): WebGLRendererWrapper | undefined {
  const [rendererWrapper, setRendererWrapper] = useState<WebGLRendererWrapper | undefined>(undefined);
  const context = useContext(WebGlRendererContext);

  useEffect(() => {
    const key = `${w}_${h}_${transparent}`;
    let wrapper: WebGLRendererWrapper | undefined = context.used[key];
    if (!wrapper) {
      wrapper = context.unused.pop();
      if (!wrapper) {
        wrapper = new WebGLRendererWrapper(new WebGLRenderer(), w, h, transparent);
      } else {
        wrapper.setSize(w, h);
      }
      context.used[key] = wrapper;
    }
    wrapper.referenceCount++;
    setRendererWrapper(wrapper);
    return () => {
      wrapper.referenceCount--;
      if (wrapper.referenceCount === 0) {
        delete context.used[key];
        context.unused.push(wrapper);
      }
      setRendererWrapper(undefined);
    };
  }, [context, w, h, transparent]);

  return rendererWrapper;
}

export function WebGlRendererProvider({ children }: { children: ReactNode }) {
  const [contextValue] = useState(() => ({
    used: {} as { [key: string]: WebGLRendererWrapper },
    unused: [] as WebGLRendererWrapper[],
  }));

  useEffect(() => {
    return () => {
      // Cleanup all renderers when provider unmounts
      Object.values(contextValue.used).forEach((wrapper) => wrapper.dispose());
      contextValue.unused.forEach((wrapper) => wrapper.dispose());
    };
  }, [contextValue]);

  return <WebGlRendererContext.Provider value={contextValue}>{children}</WebGlRendererContext.Provider>;
}
