import { Mesh, PlaneGeometry } from "three";
import { CanvasStack } from "../../utilities/CanvasStack/CanvasStack";
import {
  ColorCanvasOperation,
  LayeredCanvasOperation,
  MarkdownCanvasOperation,
  PadCanvasOperation,
} from "../../utilities/CanvasStack/CanvasOperations";
import { RichTextRenderOptionsParameters } from "../../utilities/CanvasStack/RichTextRenderer";
import { GameTheme } from "../../game/GameTheme";
import { BuiltItem, SummaryMode } from "./types";
import { SCALE_FACTOR } from "./constants";

export class SummaryRenderer {
  constructor(
    private theme: GameTheme,
    public showSummary: SummaryMode = "full",
  ) {}

  updateHelpText(item: BuiltItem, itemWidth: number, itemHeight: number, h: number, effectiveItemHeight: number) {
    // Remove old summary mesh if it exists
    if (item.summaryMesh) {
      item.summaryMesh.removeFromParent();
      item.summaryMesh = undefined;
    }

    const summary = this.getSummaryText(item);
    if (!summary) {
      item.summaryHeight = 0;
      return;
    }

    const renderingOptions = this.getSummaryRenderingOptions(item);
    const summaryMesh = this.createSummaryMesh(
      summary,
      item,
      renderingOptions,
      itemWidth,
      itemHeight,
      h,
      effectiveItemHeight,
    );

    item.summaryMesh = summaryMesh;
    item.group.add(summaryMesh);
  }

  repositionSummary(item: BuiltItem, effectiveItemHeight: number) {
    if (item.summaryMesh) {
      const summaryHeight = item.summaryHeight - this.theme.spacing / SCALE_FACTOR;
      item.summaryMesh.position.y = -effectiveItemHeight * 0.5 - summaryHeight / 2 - this.theme.spacing / SCALE_FACTOR;
    }
  }

  private getSummaryText(item: BuiltItem): string | undefined {
    if (this.showSummary === "full") {
      return item.item.summary ?? item.item.shortSummary;
    } else if (this.showSummary === "partial") {
      return item.item.shortSummary;
    }
    return undefined;
  }

  private getSummaryRenderingOptions(item: BuiltItem): RichTextRenderOptionsParameters {
    const baseOptions =
      this.showSummary === "full"
        ? (item.item.summaryRenderingOptions ?? item.item.shortSummaryRenderingOptions)
        : (item.item.shortSummaryRenderingOptions ?? item.item.summaryRenderingOptions);

    return {
      align: "center",
      color: this.theme.dialogForegroundColor,
      fontSize: this.theme.dialogFontSize * window.devicePixelRatio,
      ...baseOptions,
    };
  }

  private createSummaryMesh(
    summary: string,
    item: BuiltItem,
    specs: RichTextRenderOptionsParameters,
    itemWidth: number,
    itemHeight: number,
    h: number,
    effectiveItemHeight: number,
  ): Mesh {
    const pad =
      this.showSummary === "full"
        ? this.theme.spacing * window.devicePixelRatio
        : this.theme.spacing * 0.5 * window.devicePixelRatio;

    const markdown = new MarkdownCanvasOperation(summary, item.item.summaryIconMap ?? {}, specs);
    const ops = new LayeredCanvasOperation([
      new ColorCanvasOperation(this.theme.gallerySummaryBackgroundColor, this.theme.gallerySummaryBackgroundOpacity),
      new PadCanvasOperation({ top: pad, bottom: pad, left: pad, right: pad }, markdown),
    ]);

    // Calculate the maximum available height for the summary
    const height = (h - itemHeight) / 2 - this.theme.spacing * 2;

    // First pass: render with full height to let text flow and calculate actual size
    const stack1 = new CanvasStack(
      itemWidth * SCALE_FACTOR * window.devicePixelRatio,
      height * SCALE_FACTOR * window.devicePixelRatio,
      ops,
    );
    stack1.render();

    // Second pass: render with actual measured height for final material
    const stack2 = new CanvasStack(itemWidth * SCALE_FACTOR * window.devicePixelRatio, markdown.height + pad * 2, ops);
    stack2.render();

    const material = stack2.material;
    material.transparent = true;
    material.depthWrite = true;

    const finalHeight = stack2.height / window.devicePixelRatio / SCALE_FACTOR;
    item.summaryHeight = finalHeight;

    const geometry = new PlaneGeometry(itemWidth, finalHeight);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(0, -effectiveItemHeight * 0.5 - finalHeight / 2 - this.theme.spacing / SCALE_FACTOR, 0);

    return mesh;
  }
}
