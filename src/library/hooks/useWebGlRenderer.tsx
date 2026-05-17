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
  private loseContextExt: WEBGL_lose_context | null = null;
  private currentWidth = 0;
  private currentHeight = 0;
  public pixelRatio = Math.max(1.5, typeof window !== "undefined" ? window.devicePixelRatio : 1.5);
  private maxComposers = 8;
  private _contextLost = false;
  private _restoreScheduled = false;
  private _lastLossAt = 0;
  private _lastRestoreAttemptAt = 0;
  private static RESTORE_BACKOFF_MS = 250;
  private _dirtyCallbacks = new Set<() => void>();
  public readonly isWebGL2: boolean;

  constructor() {
    this.renderer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });

    // Check if WebGL context is available
    if (!this.renderer.getContext()) {
      throw new Error("WebGL context is not available");
    }

    // Get memory extension for GPU memory monitoring
    const gl = this.renderer.getContext();
    this.memoryExtension = gl.getExtension("WEBGL_debug_renderer_info");
    this.loseContextExt = gl.getExtension("WEBGL_lose_context");
    this.isWebGL2 =
      typeof WebGL2RenderingContext !== "undefined" &&
      gl instanceof WebGL2RenderingContext;

    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.setClearColor(0xffffff, 1.0);

    // Enable scissor test for partial rendering
    this.renderer.setScissorTest(true);

    // Handle WebGL context loss and restoration
    const canvas = this.renderer.domElement;
    canvas.addEventListener(
      "webglcontextlost",
      (e) => {
        e.preventDefault(); // allows context to be restored
        this.handleContextLost("event");
      },
      false,
    );

    canvas.addEventListener(
      "webglcontextrestored",
      () => {
        this.handleContextRestored();
      },
      false,
    );
  }

  private handleContextLost(source: "event" | "silent") {
    const wasLost = this._contextLost;
    this._contextLost = true;
    this._lastLossAt = Date.now();
    console.warn(
      `[WebGLRenderer] Context lost (source=${source}, alreadyLost=${wasLost}, size=${this.currentWidth}x${this.currentHeight}, composers=${this.composerPool.size})`,
    );

    // All render targets are invalid — drop them so we don't keep using stale ones
    for (const entry of this.composerPool.values()) {
      entry.composer.dispose();
      entry.outlinePass.dispose();
    }
    this.composerPool.clear();

    // If the loss was silent (no event from the browser), the matching `restored`
    // event also won't fire on its own. Schedule a forced restore so rendering
    // resumes without requiring the user to switch panels. The "event" path is
    // expected to recover on its own; if it doesn't, render() will reschedule.
    if (source === "silent") {
      this.maybeScheduleRestore();
    }
  }

  private handleContextRestored() {
    const downMs = this._lastLossAt ? Date.now() - this._lastLossAt : -1;
    console.warn(
      `[WebGLRenderer] Context restored (downMs=${downMs}, size=${this.currentWidth}x${this.currentHeight})`,
    );
    this._contextLost = false;
    this._restoreScheduled = false;

    // Re-apply renderer state
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.setClearColor(0xffffff, 1.0);
    this.renderer.setScissorTest(true);

    // Composer pool was cleared on loss; reset size tracking so the next
    // render call rebuilds the backing framebuffer at the right dimensions.
    this.currentWidth = 0;
    this.currentHeight = 0;

    // Notify all active viewers to re-render
    for (const cb of this._dirtyCallbacks) {
      cb();
    }
  }

  /**
   * Throttled scheduler for forceRestore(). Call this any time we observe the
   * context is still lost and want to try recovery — it dedupes against an
   * already-pending attempt and enforces a backoff so we don't spin.
   */
  private maybeScheduleRestore() {
    if (!this._contextLost) return;
    if (this._restoreScheduled) return;
    const sinceLastAttempt = Date.now() - this._lastRestoreAttemptAt;
    if (this._lastRestoreAttemptAt > 0 && sinceLastAttempt < WebGLRendererWrapper.RESTORE_BACKOFF_MS) {
      // Defer until backoff elapses
      const wait = WebGLRendererWrapper.RESTORE_BACKOFF_MS - sinceLastAttempt;
      this._restoreScheduled = true;
      setTimeout(() => {
        this._restoreScheduled = false;
        this.forceRestore();
      }, wait);
      return;
    }
    this._restoreScheduled = true;
    queueMicrotask(() => {
      this._restoreScheduled = false;
      this.forceRestore();
    });
  }

  private forceRestore() {
    if (!this._contextLost) return;
    this._lastRestoreAttemptAt = Date.now();

    if (this.loseContextExt) {
      try {
        this.loseContextExt.restoreContext();
        // If the browser honors this, `webglcontextrestored` fires asynchronously
        // and clears _contextLost. If it doesn't fire, the next render() call
        // will hit the _contextLost early-return and schedule another attempt.
        return;
      } catch (e) {
        console.warn("[WebGLRenderer] restoreContext() threw, falling back to setSize", e);
      }
    }
    // Fallback: nudge the canvas size to encourage the driver to rebuild the context.
    // Some Android drivers fire `webglcontextrestored` in response to setSize on a
    // lost context. If neither path triggers a restore, render() reschedules us.
    try {
      this.renderer.setSize(Math.max(1, this.currentWidth), Math.max(1, this.currentHeight));
    } catch (e) {
      console.warn("[WebGLRenderer] setSize fallback threw", e);
    }
  }

  get contextLost() {
    return this._contextLost;
  }

  onDirty(cb: () => void): () => void {
    this._dirtyCallbacks.add(cb);
    return () => this._dirtyCallbacks.delete(cb);
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
      const outlinePass = new IDBasedOutlinePass(new Vector2(width, height), this.pixelRatio);
      const outputPass = new OutputPass();

      // Configure transparency
      if (transparent) {
        renderPass.clearColor = 0x000000;
        renderPass.clearAlpha = 0;
        renderPass.clearDepth = true;
      }

      // Configure outline pass
      outlinePass.edgeStrength = theme.chitOutlineStrength;
      outlinePass.edgeThickness = theme.chitOutlineWidth * this.pixelRatio;
      // outlinePass.debugShowIDDepth = true; // Uncomment to show ID depth buffer
      // outlinePass.debugShowDepthDiff = true; // Uncomment to show depth difference visualization

      const depthPass = new DepthVisualizationPass();
      depthPass.renderToScreen = false;

      // renderPass.needsSwap = true;

      composer.addPass(renderPass);
      // composer.addPass(depthPass); // Uncomment to show scene depth buffer
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

  private _shrinkTimer?: ReturnType<typeof setTimeout>;
  private _activeRenderSizes = new Map<string, { width: number; height: number }>();

  private ensureRendererSize(targetWidth: number, targetHeight: number, viewerId?: string) {
    if (viewerId) {
      this._activeRenderSizes.set(viewerId, { width: targetWidth, height: targetHeight });
    }

    if (targetWidth > this.currentWidth || targetHeight > this.currentHeight) {
      const prevWidth = this.currentWidth;
      const prevHeight = this.currentHeight;
      this.currentWidth = Math.max(this.currentWidth, targetWidth);
      this.currentHeight = Math.max(this.currentHeight, targetHeight);
      this.renderer.setSize(this.currentWidth, this.currentHeight);
      console.log(
        `[WebGLRenderer] Renderer size grew: ${prevWidth}x${prevHeight} -> ${this.currentWidth}x${this.currentHeight} (requested ${targetWidth}x${targetHeight})`,
      );
    }
  }

  /** Remove a viewer from the active set and schedule a shrink check. */
  unregisterViewerSize(viewerId: string) {
    this._activeRenderSizes.delete(viewerId);
    this.scheduleShrink();
  }

  private scheduleShrink() {
    if (this._shrinkTimer) return;
    this._shrinkTimer = setTimeout(() => {
      this._shrinkTimer = undefined;
      this.shrinkToFit();
    }, 2000);
  }

  private shrinkToFit() {
    let maxW = 0;
    let maxH = 0;
    for (const size of this._activeRenderSizes.values()) {
      maxW = Math.max(maxW, size.width);
      maxH = Math.max(maxH, size.height);
    }

    // Only shrink if we can save at least 25% in one dimension
    if (maxW > 0 && maxH > 0 && (maxW < this.currentWidth * 0.75 || maxH < this.currentHeight * 0.75)) {
      const prevWidth = this.currentWidth;
      const prevHeight = this.currentHeight;
      this.currentWidth = maxW;
      this.currentHeight = maxH;
      this.renderer.setSize(this.currentWidth, this.currentHeight);
      console.log(
        `[WebGLRenderer] Renderer size shrunk: ${prevWidth}x${prevHeight} -> ${this.currentWidth}x${this.currentHeight}`,
      );
    }
  }

  render(sceneWrapper: SceneWrapper, camera: Camera, context2d: CanvasRenderingContext2D, theme: GameTheme, viewerId?: string): boolean {
    if (this._contextLost) {
      // Still lost — keep trying to restore. The previous attempt may have used
      // the setSize fallback that doesn't always trigger `webglcontextrestored`.
      this.maybeScheduleRestore();
      return false;
    }

    // Detect silent context loss — on some Android WebViews the `webglcontextlost`
    // event isn't fired reliably for GPU process kills. Without this check we'd
    // happily call composer.render() on a dead context, produce no pixels, and
    // strip the snapshot overlay → blank canvas until the user switches panels.
    const gl = this.renderer.getContext();
    if (!gl || gl.isContextLost()) {
      this.handleContextLost("silent");
      return false;
    }

    const canvas = context2d.canvas;
    const width = Math.floor(canvas.width / this.pixelRatio);
    const height = Math.floor(canvas.height / this.pixelRatio);
    const targetWidth = Math.ceil(width * this.pixelRatio);
    const targetHeight = Math.ceil(height * this.pixelRatio);

    // Ensure renderer can accommodate this size
    this.ensureRendererSize(width, height, viewerId);

    // Get or create appropriate composer
    const transparent = true; // Always use transparent for composition
    const entry = this.getOrCreateComposer(width, height, transparent, theme);

    entry.referenceCount++;

    try {
      // Set scissor to render only to target region
      this.renderer.setScissor(0, 0, targetWidth, targetHeight);
      this.renderer.setViewport(0, 0, width, height);

      // Clear *depth only* in this panel's scissor region before composer.render().
      // All viewers share the same WebGL backbuffer (and thus its depth buffer).
      // Each composer's OutputPass renders a fullscreen quad at the same NDC z,
      // and the default depth func is LESS — so the second panel's quad fails
      // depth-test against the first panel's quad and the fragment is discarded.
      // The panel then "didn't render": the backbuffer keeps the previous panel's
      // pixels in its region, and drawImage copies those into the wrong panel's
      // 2D canvas. Clearing depth (but not color) lets the OutputPass actually
      // write its real output without stomping on whatever fallback content might
      // already be visible from a prior frame.
      this.renderer.clear(false, true, false);

      // Render using the composer
      entry.composer.render(sceneWrapper, camera);

      // Re-check for context loss after the render. The webglcontextlost event
      // is dispatched asynchronously, so a loss that happened during composer.render
      // wouldn't have been caught by the pre-render check above. If we proceeded to
      // drawImage anyway, we'd copy stale pixels from the WebGL backbuffer (which
      // is preserved across frames) and report success.
      const glAfter = this.renderer.getContext();
      if (!glAfter || glAfter.isContextLost()) {
        this.handleContextLost("silent");
        return false;
      }

      // Copy the rendered result to the 2D canvas
      const webglCanvas = this.renderer.domElement;
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
      return true;
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

export function getWebGlRendererInstance(): WebGLRendererWrapper | undefined {
  return _wrapper;
}
