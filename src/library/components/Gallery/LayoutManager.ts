import { SCALE_FACTOR } from "./constants";
import { calculateLayout } from "./calculateLayout";

export class LayoutManager {
  // Dimensions (all scaled)
  private w = 100 / SCALE_FACTOR;
  private h = 100 / SCALE_FACTOR;
  private itemWidth = 100 / SCALE_FACTOR;
  private itemHeight = 100 / SCALE_FACTOR;
  private itemSpacing = 100 / SCALE_FACTOR;

  // Layout calculated values
  private itemsPerPage = 1;
  private frontStageWidth = 1;

  // Original requested dimensions (unscaled)
  private requestedItemWidth = 0;
  private requestedItemHeight = 0;

  // Unscaled window dimensions for recalculation
  private unscaledW = 100;
  private unscaledH = 100;
  private unscaledItemSpacing = 100;

  getW(): number {
    return this.w;
  }

  getH(): number {
    return this.h;
  }

  getItemWidth(): number {
    return this.itemWidth;
  }

  getItemHeight(): number {
    return this.itemHeight;
  }

  getItemSpacing(): number {
    return this.itemSpacing;
  }

  getItemsPerPage(): number {
    return this.itemsPerPage;
  }

  getFrontStageWidth(): number {
    return this.frontStageWidth;
  }

  getRequestedItemWidth(): number {
    return this.requestedItemWidth;
  }

  getRequestedItemHeight(): number {
    return this.requestedItemHeight;
  }

  setSize(w: number, h: number, itemWidth: number, itemHeight: number, itemSpacing: number) {
    console.log("[LayoutManager.setSize] Input:", { w, h, itemWidth, itemHeight, itemSpacing });

    // Store unscaled values for recalculation
    this.unscaledW = w;
    this.unscaledH = h;
    this.unscaledItemSpacing = itemSpacing;
    this.requestedItemWidth = itemWidth;
    this.requestedItemHeight = itemHeight;
    this.w = w / SCALE_FACTOR;
    this.h = h / SCALE_FACTOR;
    this.itemSpacing = itemSpacing / SCALE_FACTOR;

    // Use pure function to calculate layout (step 1: basic layout without summary)
    const layout = calculateLayout({
      w,
      h,
      preferredItemWidth: itemWidth,
      preferredItemHeight: itemHeight,
      itemSpacing,
    });

    this.itemWidth = layout.itemWidth;
    this.itemHeight = layout.itemHeight;
    this.itemsPerPage = layout.itemsPerPage;
    this.frontStageWidth = layout.frontStageWidth;

    console.log("[LayoutManager.setSize] Final:", { itemWidth: this.itemWidth, itemHeight: this.itemHeight });
  }

  recalculateItemDimensions(maxSummaryHeight: number): { heightChanged: boolean; widthChanged: boolean } {
    console.log("[LayoutManager.recalculateItemDimensions] Input:", {
      maxSummaryHeight,
      requestedItemWidth: this.requestedItemWidth,
      requestedItemHeight: this.requestedItemHeight,
    });

    if (this.requestedItemWidth <= 0 || this.requestedItemHeight <= 0) {
      return { heightChanged: false, widthChanged: false };
    }

    const oldHeight = this.itemHeight;
    const oldWidth = this.itemWidth;

    // Use the same pure function as setSize
    const layout = calculateLayout({
      w: this.unscaledW,
      h: this.unscaledH,
      preferredItemWidth: this.requestedItemWidth,
      preferredItemHeight: this.requestedItemHeight,
      itemSpacing: this.unscaledItemSpacing,
    });

    this.itemWidth = layout.itemWidth;
    this.itemHeight = layout.itemHeight;
    this.itemsPerPage = layout.itemsPerPage;
    this.frontStageWidth = layout.frontStageWidth;

    const result = {
      heightChanged: Math.abs(oldHeight - this.itemHeight) > 0.001,
      widthChanged: Math.abs(oldWidth - this.itemWidth) > 0.001,
    };

    console.log("[LayoutManager.recalculateItemDimensions] Result:", {
      ...result,
      oldWidth,
      oldHeight,
      newWidth: this.itemWidth,
      newHeight: this.itemHeight,
    });

    return result;
  }

  calculateItemIndexOffset(itemCount: number): number {
    return itemCount < this.itemsPerPage ? (this.itemsPerPage - itemCount) / 2 : 0;
  }
}
