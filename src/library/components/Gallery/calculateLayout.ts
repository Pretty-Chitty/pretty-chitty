import { SCALE_FACTOR } from "./constants";

export interface LayoutInput {
  w: number;
  h: number;
  preferredItemWidth: number;
  preferredItemHeight: number;
  itemSpacing: number;
}

export interface LayoutOutput {
  itemWidth: number; // Scaled
  itemHeight: number; // Scaled
  itemsPerPage: number;
  frontStageWidth: number; // Scaled
}

/**
 * Pure function to calculate gallery layout.
 * All inputs are in unscaled units.
 * All outputs are in scaled units.
 */
export function calculateLayout(input: LayoutInput): LayoutOutput {
  const { w, h, preferredItemWidth, preferredItemHeight, itemSpacing } = input;

  const aspectRatio = preferredItemWidth / preferredItemHeight;

  // Calculate available space accounting for spacing
  const availableHeight = h - itemSpacing * 2;
  const availableWidth = w - itemSpacing * 2;

  // Constrain by available space
  const constrainedHeight = Math.min(preferredItemHeight, availableHeight);
  const constrainedWidth = Math.min(preferredItemWidth, availableWidth);

  // Choose constraint that applies (height or width)
  let finalItemWidth: number;
  let finalItemHeight: number;

  if (constrainedHeight < preferredItemHeight) {
    // Height constrained - scale width proportionally
    finalItemHeight = constrainedHeight / SCALE_FACTOR;
    finalItemWidth = (constrainedHeight * aspectRatio) / SCALE_FACTOR;
  } else if (constrainedWidth < preferredItemWidth) {
    // Width constrained - scale height proportionally
    finalItemWidth = constrainedWidth / SCALE_FACTOR;
    finalItemHeight = (constrainedWidth / aspectRatio) / SCALE_FACTOR;
  } else {
    // No constraints
    finalItemHeight = preferredItemHeight / SCALE_FACTOR;
    finalItemWidth = preferredItemWidth / SCALE_FACTOR;
  }

  const itemsPerPage = Math.floor((w - itemSpacing * 2) / (finalItemWidth * SCALE_FACTOR + itemSpacing));
  const frontStageWidth =
    (itemsPerPage * (finalItemWidth * SCALE_FACTOR + itemSpacing)) / SCALE_FACTOR - itemSpacing / SCALE_FACTOR;

  return {
    itemWidth: finalItemWidth,
    itemHeight: finalItemHeight,
    itemsPerPage,
    frontStageWidth,
  };
}
