import { GameTheme } from "../../game/GameTheme";
import { SummaryMode } from "./types";
import { ITEM_HEIGHT_FRACTION_WITH_SUMMARY, MIN_ITEM_HEIGHT_FRACTION, SUMMARY_MAX_WIDTH } from "./constants";

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
  private summaryWidth = 100;
  private summaryHeightLimit = 0;

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

  getSummaryDimensions() {
    return { w: this.summaryWidth, maxHeight: this.summaryHeightLimit };
  }

  /** The height the summaries take on screen: in the full gallery the window they scroll in, otherwise their height */
  getSummaryViewportHeight() {
    return this.summaryMode === "full" ? Math.min(this.summaryMaxHeight, this.summaryHeightLimit) : this.summaryMaxHeight;
  }
  /** Whether some summary is longer than its window (the full gallery scrolls them) */
  canScrollSummaries() {
    return this.summaryMode === "full" && this.summaryMaxHeight > this.summaryHeightLimit + 1;
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
    // recalcs itemWidth,itemHeight,itemsPerPage,frontStageWidth and the summary bounds

    let itemWidth = this.itemPreferredWidth ?? this.baseItemWidth;
    let itemHeight = this.itemPreferredHeight ?? this.baseItemHeight;
    const aspectRatio = itemWidth / itemHeight;

    const availableHeight = this.h - this.itemSpacing * 2;
    const maxItemHeight = Math.max(this.theme.galleryItemMinimumHeight, availableHeight);
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

    let summaryHeightLimit: number;
    let summaryWidth: number;
    if (this.summaryMode === "full" && this.summaryMaxHeight > 0) {
      // The full gallery: the item keeps a fixed, readable share of the height whatever its summary says (it is what
      // the player is looking at), and the summaries sit under it at their natural size, scrolling in what is left.
      itemHeight = Math.min(itemHeight, availableHeight * ITEM_HEIGHT_FRACTION_WITH_SUMMARY);
      itemWidth = Math.max(this.theme.galleryItemMinimumWidth, Math.min(maxItemWidth, itemHeight * aspectRatio));
      itemHeight = itemWidth / aspectRatio;
      summaryHeightLimit = Math.max(0, availableHeight - itemHeight - this.theme.spacing);
      // never wider than a readable measure; side by side, no wider than the item's own slot
      summaryWidth =
        this.itemCount === 1
          ? Math.min(SUMMARY_MAX_WIDTH, maxItemWidth)
          : Math.min(SUMMARY_MAX_WIDTH, itemWidth + this.itemSpacing * 0.8);
    } else {
      // The summary takes its height from the item, and the item keeps its shape, so the slot (and the summary laid
      // out at its width) stays as wide as the item actually draws.  A narrower summary can wrap taller and shrink the
      // item again, but only down to the height floor, so the layout settles instead of collapsing.
      const itemHeightFloor = Math.max(
        this.theme.galleryItemMinimumHeight,
        Math.min(itemHeight, availableHeight * MIN_ITEM_HEIGHT_FRACTION),
      );
      summaryHeightLimit = Math.max(0, availableHeight - itemHeightFloor);
      itemHeight = Math.max(itemHeightFloor, Math.min(itemHeight, availableHeight - this.summaryMaxHeight));
      itemWidth = Math.max(this.theme.galleryItemMinimumWidth, itemHeight * aspectRatio);
      // Each caption is as wide as its item, however many items there are: a lone item's caption looks just as it
      // would beside a second one (a stage-wide caption read as a bar under a short label).
      summaryWidth = itemWidth;
    }

    const itemsPerPage = Math.max(
      1,
      Math.min(this.itemCount, Math.floor((this.w - this.itemSpacing * 2) / (itemWidth + this.itemSpacing))),
    );
    const frontStageWidth = itemsPerPage * (itemWidth + this.itemSpacing) - this.itemSpacing;

    if (
      this.itemHeight !== itemHeight ||
      this.itemWidth !== itemWidth ||
      this.itemsPerPage !== itemsPerPage ||
      this.frontStageWidth !== frontStageWidth ||
      this.summaryWidth !== summaryWidth ||
      this.summaryHeightLimit !== summaryHeightLimit
    ) {
      this.itemHeight = itemHeight;
      this.itemWidth = itemWidth;
      this.itemsPerPage = itemsPerPage;
      this.frontStageWidth = frontStageWidth;
      this.summaryWidth = summaryWidth;
      this.summaryHeightLimit = summaryHeightLimit;
      this.dirty = true;
    }
  }

  calculateItemIndexOffset(itemCount: number): number {
    return itemCount < this.itemsPerPage ? (this.itemsPerPage - itemCount) / 2 : 0;
  }
}
