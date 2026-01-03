import { Object3D, Vector3 } from "three";
import { Tween } from "@tweenjs/tween.js";
import { IconMap } from "../../utilities/CanvasStack/CanvasOperations";
import { RichTextRenderOptionsParameters } from "../../utilities/CanvasStack/RichTextRenderer";
import { SceneWrapper } from "../../rendering/outline";

export type UpdateCallback = () => void;

export interface GalleryItem {
  id: string;
  createMesh(sceneWrapper: SceneWrapper): Object3D;
  onClick?: () => void;

  maximumWidth?: number;
  maximumHeight?: number;

  preferredWidth?: number;
  preferredHeight?: number;

  summary?: string;
  shortSummary?: string;
  summaryIconMap?: IconMap;
  summaryRenderingOptions?: RichTextRenderOptionsParameters;
  shortSummaryRenderingOptions?: RichTextRenderOptionsParameters;

  /**
   * This takes a callback that gets updated any time the gallery item needs to be refreshed (new texture or mesh or whatnot).
   * It returns a callback that can be invoked to unsubscribe this callback
   */
  registerUpdateHandler(cb: UpdateCallback): UpdateCallback;
}

export interface GalleryItemSource {
  backingObject?: any;
  get items(): GalleryItem[];

  /**
   * This takes a callback that gets updated any time the gallery item needs to be refreshed (new texture or mesh or whatnot).
   * It returns a callback that can be invoked to unsubscribe this callback
   */
  registerUpdateHandler(cb: UpdateCallback): UpdateCallback;
  close(): void;

  inlineGallerySize?: number;
}

export type BuiltItem = {
  index: number;
  enteredAmount: number;
  targetIndex: number;
  item: GalleryItem;
  group: Object3D;
  mesh: Object3D;
  summaryMesh?: Object3D;
  center: Vector3;
  height: number;
  depth: number;
  summaryHeight: number;
  tween?: Tween<{ x: number }>;
  enteredTween?: Tween<{ x: number }>;
  unsubscribe: UpdateCallback;
};

export interface GallerySizeConfig {
  w: number;
  h: number;
  itemWidth: number;
  itemHeight: number;
  itemSpacing: number;
  zFactor: number;
  items?: GalleryItem[];
}

export type SummaryMode = "full" | "partial" | "none";
