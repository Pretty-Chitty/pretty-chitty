import React, { useContext, createContext, ReactNode, useEffect, useState } from "react";
import { WebGLRenderer, Vector2 } from "three";
import { EffectComposer, IDBasedOutlinePass, OutputPass, RenderPass, Camera, SceneWrapper } from "../rendering/outline";
import { useGameTheme } from "./useGameTheme";
import { GameTheme } from "../game/GameTheme";

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
  private memoryExtension: any;

  constructor(
    public renderer: WebGLRenderer,
    width: number,
    height: number,
    theme: GameTheme,
    transparent: boolean = false,
  ) {
    // Check if WebGL context is available
    if (!this.renderer.getContext()) {
      throw new Error("WebGL context is not available");
    }

    // Get memory extension for GPU memory monitoring
    const gl = this.renderer.getContext();
    this.memoryExtension = gl.getExtension('WEBGL_debug_renderer_info');

    const pixelRatio = Math.max(1.5, window.devicePixelRatio);
    this.renderer.setPixelRatio(pixelRatio);
    width = Math.round(width * pixelRatio);
    height = Math.round(height * pixelRatio);

    this.renderer.shadowMap.enabled = true;

    // Ensure proper alpha handling for shadows
    if (!transparent) {
      this.renderer.setClearColor(0xffffff, 1.0); // Opaque white background for shadows
    }

    // Setup effect composer with standard passes
    this.composer = new EffectComposer(renderer);

    this.renderPass = new RenderPass();
    this.outlinePass = new IDBasedOutlinePass(new Vector2(width, height), theme.chitOutlineDownsample);
    this.outputPass = new OutputPass();

    // Configure transparency
    if (transparent) {
      this.renderPass.clearColor = 0x000000; // Black background
      this.renderPass.clearAlpha = 0; // But transparent
      this.renderPass.clearDepth = true; // Ensure depth buffer is cleared
    }

    // Configure outline pass with standard settings
    this.outlinePass.edgeStrength = theme.chitOutlineStrength;
    this.outlinePass.edgeThickness = theme.chitOutlineWidth;

    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.outlinePass);
    this.composer.addPass(this.outputPass);
    this.composer.setSize(width, height);
    this.renderer.setSize(width, height);
  }

  render(sceneWrapper: SceneWrapper, camera: Camera) {
    this.composer.render(sceneWrapper, camera);
  }

  getGPUMemoryInfo() {
    const gl = this.renderer.getContext();
    const info = this.renderer.info;

    return {
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length || 0,
      calls: info.render.calls,
      triangles: info.render.triangles,
      points: info.render.points,
      lines: info.render.lines,
      frame: info.render.frame
    };
  }

  setSize(width: number, height: number) {
    const pixelRatio = Math.max(1.5, window.devicePixelRatio);
    this.renderer.setSize(width * pixelRatio, height * pixelRatio);
    this.composer.setSize(width * pixelRatio, height * pixelRatio);
    this.outlinePass.setSize(width * pixelRatio, height * pixelRatio);
  }

  reconfigure(theme: GameTheme, transparent: boolean) {
    // Reconfigure transparency settings
    if (transparent) {
      this.renderPass.clearColor = 0x000000; // Black background
      this.renderPass.clearAlpha = 0; // But transparent
      this.renderPass.clearDepth = true; // Ensure depth buffer is cleared
    } else {
      this.renderPass.clearColor = undefined; // Use default
      this.renderPass.clearAlpha = 1; // Opaque
      this.renderPass.clearDepth = false; // Default
      this.renderer.setClearColor(0xffffff, 1.0); // Opaque white background
    }

    // Update theme settings
    this.outlinePass.edgeStrength = theme.chitOutlineStrength;
    this.outlinePass.edgeThickness = theme.chitOutlineWidth;
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
  const theme = useGameTheme();

  useEffect(() => {
    const key = `${w}_${h}_${transparent}`;
    let wrapper: WebGLRendererWrapper | undefined = context.used[key];
    if (!wrapper) {
      wrapper = context.unused.pop();
      if (!wrapper) {
        try {
          const renderer = new WebGLRenderer();
          if (!renderer.getContext()) {
            console.error("Failed to create WebGL context");
            return;
          }
          wrapper = new WebGLRendererWrapper(renderer, w, h, theme, transparent);
        } catch (error) {
          console.error("Failed to create WebGL renderer:", error);
          return;
        }
      } else {
        wrapper.setSize(w, h);
        wrapper.reconfigure(theme, transparent); // Reconfigure for current mode
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
  }, [context, theme, w, h, transparent]);

  return rendererWrapper;
}

// Global memory monitoring utility
export function logWebGLMemoryStats(label: string = "WebGL Memory") {
  // Find any active renderer to get memory stats
  const canvas = document.querySelector('canvas');
  if (!canvas) return;

  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) return;

  console.group(label);
  console.log(`Active textures: ${gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)}`);
  console.log(`Max texture size: ${gl.getParameter(gl.MAX_TEXTURE_SIZE)}`);
  console.log(`Max renderbuffer size: ${gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)}`);

  // Try to get debug info if available
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  if (debugInfo) {
    console.log(`Renderer: ${gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)}`);
    console.log(`Vendor: ${gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)}`);
  }
  console.groupEnd();
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
