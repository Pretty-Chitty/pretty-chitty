import { Box3, Object3D, Vector3 } from "three";
import { Chit } from "../../game/Chit";
import { GalleryItem } from "../Gallery/types";
import { RootChitRenderInstance } from "../../rendering/RootChitRenderInstance";
import { ChitGalleryItemInstance } from "../../rendering/ChitGalleryItemInstance";

/**
 * A drag that starts outside the board, for now only in the inline gallery strip: a chit
 * shown there with a live DragPick is pulled up onto the panel that holds its drop targets.
 * Coordinates are client (page) pixels.
 */
export interface ExternalDrag {
  move(clientX: number, clientY: number): void;
  /** Drops on the target under the pointer, if any; off the board it does nothing. */
  end(): void;
  cancel(): void;
}

export interface ExternalDragHost {
  /** Undefined when the chit can't be dragged now, or its targets aren't on a visible panel. */
  begin(chit: Chit, item: GalleryItem, clientX: number, clientY: number): ExternalDrag | undefined;
}

// How long the set-down copy stays after a drop, covering the round trip to the game.
const SETTLE_MS = 600;

export interface ExternalDragViewer {
  getBounds: () => DOMRect | null;
  renderInstance: RootChitRenderInstance;
}

/**
 * Draws a copy of the chit under the pointer on the target panel, lifted like a normal drag,
 * and outlines the nearest drop target, exactly as `ChitRenderInstance.executeDrag` does on
 * the table. Dropping calls the chit's `onDrag`, so the DragPick resolves as if the chit had
 * been dragged there; the chit itself is not moved on the client (it lives in the gallery).
 */
export function startExternalDrag(
  chit: Chit,
  item: GalleryItem,
  viewer: ExternalDragViewer,
  clientX: number,
  clientY: number,
): ExternalDrag {
  const root = viewer.renderInstance;
  // cloneMesh, not createMesh: createMesh would bind the gallery's item to the board's scene, so
  // after a cancelled drag its updates would redraw the board instead of the strip
  const ghost: Object3D = item instanceof ChitGalleryItemInstance ? item.cloneMesh() : item.createMesh(root.sceneWrapper);
  ghost.visible = false;
  root.sceneWrapper.scene.add(ghost);
  const lift = chit.renderInstance?.dragLift ?? 1;
  const targets = (chit.dropTargets ?? [])
    .filter((t) => t.renderInstance && t.renderInstance.rootRenderInstance === root)
    .map((t) => ({ chit: t, at: t.renderInstance!.worldCenter() }));

  let dropTarget: Chit | undefined;
  const setTarget = (t: Chit | undefined) => {
    if (dropTarget === t) return;
    dropTarget?.renderInstance?.markAsDropTarget(false);
    dropTarget = t;
    t?.renderInstance?.markAsDropTarget(true);
  };

  const move = (x: number, y: number) => {
    const b = viewer.getBounds();
    const inside = !!b && x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
    const p = inside ? root.attemptToFindPlaneZ0OfCanvasPoints(x - b!.left, y - b!.top) : undefined;
    if (!p || targets.length === 0) {
      ghost.visible = false;
      setTarget(undefined);
      root.markDirty();
      return;
    }
    let nearest = targets[0];
    let best = Number.MAX_VALUE;
    for (const t of targets) {
      const d = (t.at.x - p.x) * (t.at.x - p.x) + (t.at.y - p.y) * (t.at.y - p.y);
      if (d < best) {
        best = d;
        nearest = t;
      }
    }
    ghost.position.set(p.x, p.y, nearest.at.z + lift);
    ghost.visible = true;
    setTarget(nearest.chit);
    root.markDirty();
  };

  const removeGhost = () => {
    ghost.removeFromParent();
    root.markDirty();
  };

  move(clientX, clientY);
  return {
    move,
    end: () => {
      const t = dropTarget;
      const at = targets.find((x) => x.chit === t)?.at;
      setTarget(undefined);
      if (!t || !at || !chit.onDrag) {
        removeGhost();
        return;
      }
      // Set the copy down on the spot and keep it there while the move goes to the game: the
      // chit the game creates appears under it, so the piece doesn't blink out and fly back in.
      // Resting on the target, not centred on it (half of it would sink into whatever is there).
      ghost.position.set(at.x, at.y, at.z + new Box3().setFromObject(ghost).getSize(new Vector3()).z / 2);
      root.markDirty();
      // A refused drop (a tutorial's guard) creates nothing: take the copy away at once
      if (chit.onDrag(t) === false) {
        removeGhost();
        return;
      }
      setTimeout(removeGhost, SETTLE_MS);
    },
    cancel: () => {
      setTarget(undefined);
      removeGhost();
    },
  };
}
