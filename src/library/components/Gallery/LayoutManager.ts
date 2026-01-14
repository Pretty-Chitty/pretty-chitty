import { GameTheme } from "../../game/GameTheme";
import { SummaryMode } from "./types";

export class LayoutManager {
  // Dimensions (all scaled)
  private w = 100;
  private h = 100;

  private baseItemWidth = 100;
  private baseItemHeight = 100;
  private itemSpacing = 100;

  // Layout calculated values
  private itemWidth = 100;
  private itemHeight = 100;
  private itemsPerPage = 1;
  private frontStageWidth = 1;
  private itemCount = 1;

  // Original requested dimensions
  private itemPreferredWidth?: number;
  private itemPreferredHeight?: number;

  // summary info
  private summaryMode: SummaryMode = "full";
  private summaryMaxHeight = 0;

  public dirty = false;

  constructor(private theme: GameTheme) {}

  setDimensions(w: number, h: number) {
    if (this.w !== w || this.h !== h) {
      this.w = w;
      this.h = h;
      this.dirty = true;
      this.recalculateEffectiveItemDimensions();
    }
  }

  setSummaryMaxHeight(newHeight: number) {
    if (this.summaryMaxHeight !== newHeight) {
      this.summaryMaxHeight = newHeight;
      this.dirty = true;
      this.recalculateEffectiveItemDimensions();
    }
  }

  getSummaryMaxHeight() {
    return this.summaryMaxHeight;
  }

  getSummaryMode() {
    return this.summaryMode;
  }

  setSummaryMode(mode: SummaryMode) {
    if (this.summaryMode !== mode) {
      this.summaryMode = mode;
      this.dirty = true;
    }
  }

  getDimensions() {
    return { w: this.w, h: this.h };
  }

  getItemDimensions() {
    return { w: this.itemWidth, h: this.itemHeight, summaryMaxHeight: this.summaryMaxHeight };
  }

  getStageDimensions() {
    return { frontStageWidth: this.frontStageWidth, itemsPerPage: this.itemsPerPage, itemSpacing: this.itemSpacing };
  }

  setBaseItemDimensions(itemW: number, itemH: number, itemSpacing: number) {
    if (this.baseItemWidth !== itemW || this.baseItemHeight !== itemH || this.itemSpacing !== itemSpacing) {
      this.baseItemWidth = itemW;
      this.baseItemHeight = itemH;
      this.itemSpacing = itemSpacing;
      this.dirty = true;
      this.recalculateEffectiveItemDimensions();
    }
  }

  setItemCount(count: number) {
    if (this.itemCount !== count) {
      this.itemCount = count;
      this.recalculateEffectiveItemDimensions();
      this.dirty = true;
    }
  }

  setItemDimensions(items: { preferredWidth?: number; preferredHeight?: number }[]) {
    let newPreferredWidth: number | undefined = 0,
      newPreferredHeight: number | undefined = 0;
    for (const item of items) {
      if (item.preferredWidth !== undefined && newPreferredWidth !== undefined) {
        newPreferredWidth = Math.max(newPreferredWidth, item.preferredWidth);
      } else {
        newPreferredWidth = undefined;
      }

      if (item.preferredHeight !== undefined && newPreferredHeight !== undefined) {
        newPreferredHeight = Math.max(newPreferredHeight, item.preferredHeight);
      } else {
        newPreferredHeight = undefined;
      }
    }

    if (this.itemPreferredWidth !== newPreferredWidth || this.itemPreferredHeight !== newPreferredHeight) {
      this.itemPreferredWidth = newPreferredWidth;
      this.itemPreferredHeight = newPreferredHeight;
      this.dirty = true;
      this.recalculateEffectiveItemDimensions();
    }
  }

  recalculateEffectiveItemDimensions() {
    // recalcs itemWidth,itemHeight,itemsPerPage and frontStageWidth

    let itemWidth = this.itemPreferredWidth ?? this.baseItemWidth;
    let itemHeight = this.itemPreferredHeight ?? this.baseItemHeight;
    const aspectRatio = itemWidth / itemHeight;

    const maxItemHeight = Math.max(
      this.theme.galleryItemMinimumHeight,
      this.h - this.itemSpacing * 2 - this.summaryMaxHeight,
    );
    const maxItemWidth = Math.max(this.theme.galleryItemMinimumWidth, this.w - this.itemSpacing * 2);

    if (itemHeight > maxItemHeight) {
      itemHeight = maxItemHeight;
      itemWidth = maxItemHeight * aspectRatio;
    }
    if (itemWidth > maxItemWidth) {
      itemWidth = maxItemWidth;
      itemHeight = maxItemWidth / aspectRatio;
    }

    itemWidth = Math.max(this.theme.galleryItemMinimumWidth, itemWidth);

    const itemsPerPage = Math.max(
      1,
      Math.min(this.itemCount, Math.floor((this.w - this.itemSpacing * 2) / (itemWidth + this.itemSpacing))),
    );
    const frontStageWidth = itemsPerPage * (itemWidth + this.itemSpacing) - this.itemSpacing;

    if (
      this.itemHeight !== itemHeight ||
      this.itemWidth !== itemWidth ||
      this.itemsPerPage !== itemsPerPage ||
      this.frontStageWidth !== frontStageWidth
    ) {
      this.itemHeight = itemHeight;
      this.itemWidth = itemWidth;
      this.itemsPerPage = itemsPerPage;
      this.frontStageWidth = frontStageWidth;
      this.dirty = true;
    }
  }

  calculateItemIndexOffset(itemCount: number): number {
    return itemCount < this.itemsPerPage ? (this.itemsPerPage - itemCount) / 2 : 0;
  }
}
