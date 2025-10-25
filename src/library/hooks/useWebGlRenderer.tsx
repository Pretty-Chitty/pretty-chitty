import React, { useContext, createContext, ReactNode, useEffect, useState } from "react";
import { WebGLRenderer, Vector2 } from "three";
import {
  EffectComposer,
  IDBasedOutlinePass,
  OutputPass,
  RenderPass,
  Camera,
  SceneWrapper,
  DepthVisualizationPass,
} from "../rendering/outline";
import { useGameTheme } from "./useGameTheme";
import { GameTheme } from "../game/GameTheme";

interface ComposerEntry {
  composer: EffectComposer;
  renderPass: RenderPass;
  outlinePass: IDBasedOutlinePass;
  outputPass: OutputPass;
  referenceCount: number;
  lastUsed: number;
}

class WebGLRendererWrapper {
  public referenceCount = 0;
  private renderer: WebGLRenderer;
  private composerPool = new Map<string, ComposerEntry>();
  private memoryExtension: any;
  private currentWidth = 0;
  private currentHeight = 0;
  public pixelRatio = Math.max(1.5, typeof window !== "undefined" ? window.devicePixelRatio : 1.5);
  private maxComposers = 8;

  constructor() {
    this.renderer = new WebGLRenderer({ alpha: true, antialias: false });

    // Check if WebGL context is available
    if (!this.renderer.getContext()) {
      throw new Error("WebGL context is not available");
    }

    // Get memory extension for GPU memory monitoring
    const gl = this.renderer.getContext();
    this.memoryExtension = gl.getExtension("WEBGL_debug_renderer_info");

    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.setClearColor(0xffffff, 1.0);

    // Enable scissor test for partial rendering
    this.renderer.setScissorTest(true);
  }

  private evictLeastRecentlyUsedComposer() {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.composerPool.entries()) {
      if (entry.referenceCount === 0 && entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const entry = this.composerPool.get(oldestKey)!;
      entry.composer.dispose();
      entry.outlinePass.dispose();
      this.composerPool.delete(oldestKey);
    }
  }

  private getOrCreateComposer(width: number, height: number, transparent: boolean, theme: GameTheme): ComposerEntry {
    const key = `${width}_${height}_${transparent}`;
    let entry = this.composerPool.get(key);

    if (!entry) {
      // If we're at capacity, evict the least recently used composer
      if (this.composerPool.size >= this.maxComposers) {
        this.evictLeastRecentlyUsedComposer();
      }

      const composer = new EffectComposer(this.renderer, width, height);
      const renderPass = new RenderPass();
      const outlinePass = new IDBasedOutlinePass(
        new Vector2(width, height),
        this.pixelRatio,
        theme.chitOutlineDownsample,
      );
      const outputPass = new OutputPass();

      // Configure transparency
      if (transparent) {
        renderPass.clearColor = 0x000000;
        renderPass.clearAlpha = 0;
        renderPass.clearDepth = true;
      }

      // Configure outline pass
      outlinePass.edgeStrength = theme.chitOutlineStrength * theme.chitOutlineDownsample;
      outlinePass.edgeThickness = theme.chitOutlineWidth / theme.chitOutlineDownsample;

      const depthPass = new DepthVisualizationPass();
      depthPass.renderToScreen = false;

      // renderPass.needsSwap = true;

      composer.addPass(renderPass);
      // composer.addPass(depthPass);
      composer.addPass(outlinePass);
      composer.addPass(outputPass);

      entry = {
        composer,
        renderPass,
        outlinePass,
        outputPass,
        referenceCount: 0,
        lastUsed: Date.now(),
      };

      this.composerPool.set(key, entry);
    }

    entry.lastUsed = Date.now();
    return entry;
  }

  private ensureRendererSize(targetWidth: number, targetHeight: number) {
    if (targetWidth > this.currentWidth || targetHeight > this.currentHeight) {
      this.currentWidth = Math.max(this.currentWidth, targetWidth);
      this.currentHeight = Math.max(this.currentHeight, targetHeight);
      this.renderer.setSize(this.currentWidth, this.currentHeight);
    }
  }

  render(sceneWrapper: SceneWrapper, camera: Camera, context2d: CanvasRenderingContext2D, theme: GameTheme) {
    const canvas = context2d.canvas;
    const width = Math.floor(canvas.width / this.pixelRatio);
    const height = Math.floor(canvas.height / this.pixelRatio);
    const targetWidth = Math.ceil(width * this.pixelRatio);
    const targetHeight = Math.ceil(height * this.pixelRatio);

    // Ensure renderer can accommodate this size
    this.ensureRendererSize(width, height);

    // Get or create appropriate composer
    const transparent = true; // Always use transparent for composition
    const entry = this.getOrCreateComposer(width, height, transparent, theme);

    entry.referenceCount++;

    try {
      // Set scissor to render only to target region
      this.renderer.setScissor(0, 0, targetWidth, targetHeight);
      this.renderer.setViewport(0, 0, width, height);

      // Render using the composer
      entry.composer.render(sceneWrapper, camera);

      // Copy the rendered result to the 2D canvas
      const webglCanvas = this.renderer.domElement;
      // context2d.save();
      // context2d.scale(1 / this.pixelRatio, 1 / this.pixelRatio);
      context2d.drawImage(
        webglCanvas,
        0,
        webglCanvas.height - targetHeight, // Invert Y axis
        targetWidth,
        targetHeight, // Source width, height
        0,
        0, // Dest x, y
        targetWidth,
        targetHeight, // Dest width, height
      );
      // context2d.restore();
    } finally {
      entry.referenceCount--;
    }
  }

  updateTheme(theme: GameTheme) {
    // Update all existing composers with new theme settings
    for (const entry of this.composerPool.values()) {
      entry.outlinePass.edgeStrength = theme.chitOutlineStrength;
      entry.outlinePass.edgeThickness = theme.chitOutlineWidth;
    }
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
      frame: info.render.frame,
      composerPoolSize: this.composerPool.size,
      rendererSize: `${this.currentWidth}x${this.currentHeight}`,
    };
  }

  dispose() {
    // Dispose all composers
    for (const entry of this.composerPool.values()) {
      entry.composer.dispose();
      entry.outlinePass.dispose();
    }
    this.composerPool.clear();

    // Dispose renderer
    this.renderer.dispose();
  }
}

let _wrapper: WebGLRendererWrapper | undefined = undefined;
export function useWebGlRenderer(): WebGLRendererWrapper {
  const theme = useGameTheme();
  if (!_wrapper) {
    _wrapper = new WebGLRendererWrapper();
    _wrapper.updateTheme(theme);
  }
  return _wrapper;
}
