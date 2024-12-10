import { Box3 } from 'three';

const SMALL_NUMBER = 0.00001;

export function fixBbox(box: Box3) {
  if (!Number.isFinite(box.max.x)) {
    box.max.set(0, 0, 0);
    box.min.set(0, 0, 0);
    return box;
  }

  if (Number.isFinite(box.max.z) && box.max.z === box.min.z) {
    box.max.z += SMALL_NUMBER;
  }
  if (Number.isFinite(box.max.x) && box.max.x === box.min.x) {
    box.max.x += SMALL_NUMBER;
  }
  if (Number.isFinite(box.max.y) && box.max.y === box.min.y) {
    box.max.y += SMALL_NUMBER;
  }

  return box;
}
