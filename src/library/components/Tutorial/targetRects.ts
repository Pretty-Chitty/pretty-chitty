import { Vector3 } from "three";
import { Chit } from "../../game/Chit";
import { PlayerChit } from "../../game/PlayerChit";
import { RootChit } from "../../game/RootChit";
import { RootChitRenderInstance } from "../../rendering/RootChitRenderInstance";
import { Target, selectChits } from "../../game/tutorial/defineTutorial";
import { UI_ALIASES } from "../../game/tutorial/allowed";
import { RegisteredGallery, galleryRegistry } from "../Gallery/registry";

export type Rect = { left: number; top: number; right: number; bottom: number };

export function rectCenter(r: Rect) {
  return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
}

export function unionRects(rects: Rect[]): Rect | undefined {
  if (rects.length === 0) return undefined;
  return rects.reduce((acc, r) => ({
    left: Math.min(acc.left, r.left),
    top: Math.min(acc.top, r.top),
    right: Math.max(acc.right, r.right),
    bottom: Math.max(acc.bottom, r.bottom),
  }));
}

function parseScreen(v: number | string, extent: number) {
  if (typeof v === "number") return v;
  const s = v.trim();
  if (s.endsWith("%")) return (parseFloat(s) / 100) * extent;
  return parseFloat(s);
}

/** The panel root (chit with its own viewer) a chit renders in, if it renders at all */
export function panelRootOf(chit: Chit): RootChitRenderInstance | undefined {
  return chit.renderInstance?.rootRenderInstance;
}

/**
 * Whether a panel is in front, by the chit that shows it: false for a panel behind another in its tab
 * group (during a tab slide it still paints, from where it would be).
 */
export type PanelShown = (chit: Chit) => boolean;

/** Whether a chit's panel is currently in front and painting */
export function chitVisible(chit: Chit, shown?: PanelShown): boolean {
  const root = panelRootOf(chit);
  if (!root) return false;
  if (root.paused) return false;
  if (shown && !shown(chit)) return false;
  const ri = chit.renderInstance;
  if (!ri || !ri.group.visible) return false;
  // Inside a gallery container the chit's own box is not on the table
  for (let p = chit.parent; p; p = p.parent) {
    if (p.renderInstance?.absorbsClickEventsForChildren) return false;
  }
  return true;
}

/**
 * Screen (page) rectangle of a chit: its bounding box corners through the tweened world transform and
 * the panel camera. Offset and scale are in bbox units (half-extent = 0.5).
 */
export function projectChit(
  chit: Chit,
  offset?: { x?: number; y?: number; z?: number },
  scale?: { x?: number; y?: number },
  shown?: PanelShown,
): Rect | undefined {
  const ri = chit.renderInstance;
  const root = ri?.rootRenderInstance;
  if (!ri || !root || !chitVisible(chit, shown)) return undefined;
  const bbox = ri.bbox;
  if (bbox.scale.length() === 0) return undefined;

  ri.group.updateWorldMatrix(true, false);
  bbox.updateMatrix();
  const sx = (scale?.x ?? 1) / 2;
  const sy = (scale?.y ?? 1) / 2;
  const ox = offset?.x ?? 0;
  const oy = offset?.y ?? 0;
  const oz = offset?.z ?? 0;
  const corners: Vector3[] = [];
  for (const x of [-sx, sx]) {
    for (const y of [-sy, sy]) {
      for (const z of [-0.5, 0.5]) {
        corners.push(new Vector3(x + ox, y + oy, z + oz));
      }
    }
  }
  const rects: Rect[] = [];
  for (const c of corners) {
    c.applyMatrix4(bbox.matrix); // bbox local → chit space (position + size)
    c.applyMatrix4(ri.group.matrixWorld); // chit space (tweened) → world
    c.project(root.camera);
    if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) return undefined;
    const screen = root.convertCameraSpaceToScreenSpace(c.x, c.y);
    if (!screen) return undefined;
    rects.push({ left: screen.x, top: screen.y, right: screen.x, bottom: screen.y });
  }
  const rect = unionRects(rects)!;
  // Clip to the panel so a chit half off-panel is not drawn over its neighbour
  const tl = root.convertCameraSpaceToScreenSpace(-1, 1);
  const br = root.convertCameraSpaceToScreenSpace(1, -1);
  if (tl && br) {
    rect.left = Math.max(rect.left, tl.x);
    rect.top = Math.max(rect.top, tl.y);
    rect.right = Math.min(rect.right, br.x);
    rect.bottom = Math.min(rect.bottom, br.y);
    if (rect.right <= rect.left || rect.bottom <= rect.top) return undefined;
  }
  return rect;
}


export function projectUi(container: HTMLElement, name: string): Rect | undefined {
  // The overlay only holds the box and the SVG; the UI it points at is its siblings, so search the viewer
  const scope: ParentNode = container.parentElement ?? document;
  const names = UI_ALIASES[name] ?? [name];
  const el = names
    .map((n) => scope.querySelector(`[data-tutorial-target="${CSS.escape(n)}"]`) as HTMLElement | null)
    .find((e) => e && e.getBoundingClientRect().width > 0);
  if (!el) return undefined;
  return rectOfElement(el);
}

function rectOfElement(el: HTMLElement): Rect | undefined {
  if (!el) return undefined;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return undefined;
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

export type ResolvedTarget = {
  /** Page-space rects, one per chit (or one for a UI / screen target) */
  rects: Rect[];
  /** Chits the target names that are not on screen right now (other panel, not rendered yet) */
  hidden: Chit[];
  /** Chits shown in an open gallery but scrolled out of its view */
  offscreenInGallery: { gallery: RegisteredGallery; chit: Chit }[];
  /** All chits the selector named */
  chits: Chit[];
};

/**
 * Where a chit is on screen. An open gallery wins over the table (it is where the player acts on it,
 * and a full-screen one covers the table); the small context gallery only when nothing else shows it.
 */
function locateChit(
  chit: Chit,
  galleries: RegisteredGallery[],
  offset?: { x?: number; y?: number; z?: number },
  scale?: { x?: number; y?: number },
  shown?: PanelShown,
): { rect?: Rect; offscreen?: RegisteredGallery } {
  let offscreen: RegisteredGallery | undefined;
  for (const g of galleries.filter((g) => g.kind !== "context")) {
    const found = g.locate(chit);
    if (found === "offscreen") offscreen ??= g;
    else if (found) return { rect: adjust(found, offset, scale) };
  }
  if (offscreen) return { offscreen };
  const onTable = projectChit(chit, offset, scale, shown);
  if (onTable) return { rect: onTable };
  for (const g of galleries.filter((g) => g.kind === "context")) {
    const found = g.locate(chit);
    if (found && found !== "offscreen") return { rect: adjust(found, offset, scale) };
  }
  return {};
}

/** Offset/scale in bbox units, applied to a flat (gallery) rect: +y is toward the top */
function adjust(r: Rect, offset?: { x?: number; y?: number }, scale?: { x?: number; y?: number }): Rect {
  const w = r.right - r.left;
  const h = r.bottom - r.top;
  const cx = (r.left + r.right) / 2 + (offset?.x ?? 0) * w;
  const cy = (r.top + r.bottom) / 2 - (offset?.y ?? 0) * h;
  const hw = (w * (scale?.x ?? 1)) / 2;
  const hh = (h * (scale?.y ?? 1)) / 2;
  return { left: cx - hw, top: cy - hh, right: cx + hw, bottom: cy + hh };
}

export function resolveTarget<P extends PlayerChit, R extends RootChit<P>>(
  target: Target<P, R>,
  root: R | undefined,
  me: P | undefined,
  container: HTMLElement,
  shown?: PanelShown,
  find?: (id: string) => Chit | undefined,
): ResolvedTarget {
  if (typeof target === "function" || "chit" in target) {
    const selector = typeof target === "function" ? target : target.chit;
    const offset = typeof target === "function" ? undefined : target.offset;
    const scale = typeof target === "function" ? undefined : target.scale;
    const galleries = galleryRegistry.list(container.parentElement);
    const chits = selectChits(selector, root, me);
    const rects: Rect[] = [];
    const hidden: Chit[] = [];
    const offscreenInGallery: { gallery: RegisteredGallery; chit: Chit }[] = [];
    chits.forEach((c) => {
      const found = locateChit(c, galleries, offset, scale, shown);
      if (found.rect) rects.push(found.rect);
      else if (found.offscreen) offscreenInGallery.push({ gallery: found.offscreen, chit: c });
      else hidden.push(c);
    });
    return { rects, hidden, offscreenInGallery, chits };
  }
  if ("ui" in target) {
    let name: string | undefined;
    if (typeof target.ui === "function") {
      if (root && me) {
        try {
          name = target.ui(root, me);
        } catch {
          name = undefined;
        }
      }
    } else {
      name = target.ui;
    }
    // A counter (`spark:<chitId>`) floats over its owner's panel: while that panel is behind another,
    // the counter is hidden there too, so it counts as hidden (to reveal), not as a place to point at
    if (name?.startsWith("spark:") && shown && find) {
      const owner = find(name.slice("spark:".length));
      if (owner && !shown(owner)) return { rects: [], hidden: [owner], offscreenInGallery: [], chits: [] };
    }
    const r = name ? projectUi(container, name) : undefined;
    return { rects: r ? [r] : [], hidden: [], offscreenInGallery: [], chits: [] };
  }
  const bounds = container.getBoundingClientRect();
  const x = bounds.left + parseScreen(target.screen.x, bounds.width);
  const y = bounds.top + parseScreen(target.screen.y, bounds.height);
  return { rects: [{ left: x - 1, top: y - 1, right: x + 1, bottom: y + 1 }], hidden: [], offscreenInGallery: [], chits: [] };
}

/** Converts a page-space rect into the overlay's own coordinate space */
export function toLocal(rect: Rect, bounds: DOMRect): Rect {
  return {
    left: rect.left - bounds.left,
    top: rect.top - bounds.top,
    right: rect.right - bounds.left,
    bottom: rect.bottom - bounds.top,
  };
}

/**
 * Where a target's chits sit on the table, and in which panel: for zooming in on something small.
 * `inGallery` when any of them is shown in an open gallery instead (nothing to zoom on the table).
 */
export function tableRects<P extends PlayerChit, R extends RootChit<P>>(
  target: Target<P, R>,
  root: R | undefined,
  me: P | undefined,
  container: HTMLElement,
  shown?: PanelShown,
): { rects: { rect: Rect; panel: RootChitRenderInstance }[]; inGallery: boolean } {
  if (typeof target !== "function" && !("chit" in target)) return { rects: [], inGallery: false };
  const selector = typeof target === "function" ? target : target.chit;
  const offset = typeof target === "function" ? undefined : target.offset;
  const scale = typeof target === "function" ? undefined : target.scale;
  const galleries = galleryRegistry.list(container.parentElement).filter((g) => g.kind !== "context");
  const rects: { rect: Rect; panel: RootChitRenderInstance }[] = [];
  let inGallery = false;
  for (const c of selectChits(selector, root, me)) {
    if (galleries.some((g) => !!g.locate(c))) {
      inGallery = true;
      continue;
    }
    const rect = projectChit(c, offset, scale, shown);
    const panel = panelRootOf(c);
    if (rect && panel) rects.push({ rect, panel });
  }
  return { rects, inGallery };
}
