/** @group Core Game Elements */
export type { Game } from "./game/Game";
/** @group Core Game Elements */
export type { GameMetaData } from "./game/GameMetaData";

// NOTE: must be before Turn! or circular dependency!
/** @group Chits */
export { Chit } from "./game/Chit";

/** @group Core Game Elements */
export { Turn } from "./game/Turn";
/** @group Core Game Elements */
export { Pick, ButtonPick, ChitPick, DragTarget, DragPick } from "./game/Pick";
/** @group Core Game Elements */
export { GameTheme } from "./game/GameTheme";
/** @group Chits */
export { PlayerChit } from "./game/PlayerChit";
/** @group Chits */
export { RootChit } from "./game/RootChit";
/** @group Chits */
export { SparkChit, BagSparkChit } from "./game/SparkChit";
/** @group Chits */
export { DropdownChit } from "./game/DropdownChit";
/** @group Chits */
export { GameDeckChit } from "./game/GameDeckChit";
/** @group Chits */
export { GameBagChit } from "./game/GameBagChit";
/** @group Chits */
export { DiceChit } from "./utilities/Dice";

/** @group Chit Annotations */
export { OrderedOutlet } from "./game/OrderedOutlet";
/** @group Chit Annotations */
export { ChildOutlet, NonEditable, Ordered, Selectable } from "./utilities/Annotations";
/** @group Chit Annotations */
export type { SelectableChoice, SelectableConfig, SelectablePropertyInfo } from "./utilities/Annotations";

/** @group Buttons */
export { GameButton, DynamicGameButton, ToggleGalleryButton } from "./game/GameButton";

/** @group 2D Rendering */
export { ParameterizedCanvas } from "./utilities/ParameterizedCanvas";
/** @group 2D Rendering */
export { StaticImage } from "./utilities/StaticImage";
/** @group 2D Rendering */
export * as ReactCanvas from "./utilities/CanvasStack/ReactCanvas";
/** @group 2D Rendering */
export { IconCanvas } from "./utilities/CanvasStack/IconCanvas";

/** @group 3D Rendering */
export { CameraSpec } from "./rendering/CameraSpec";
/** @group 3D Rendering */
export { ChitRenderSpec, OwnerOriginPosition } from "./rendering/ChitRenderSpec";
/** @group 3D Rendering */
export { HighlightSpec } from "./rendering/HighlightSpec";
/** @group 3D Rendering */
export { LightSpec, Light } from "./rendering/LightSpec";
/** @group 3D Rendering */
export { Splay } from "./rendering/Splay";

/** @group Utilities */
export { extrudeSVGToGeometry } from "./utilities/SvgExtruder";
/** @group Utilities */
export { loadGLB } from "./utilities/GlbLoader";
/** @group Utilities */
export { CardMesh } from "./utilities/CardMesh";

//
// Supporting types - less prominent but still documented
//
/** @group Supporting Types */
export type { ButtonCallback } from "./game/GameButton";
/** @group Supporting Types */
export type { IChitLibrary, IButtonLibrary, ICanvasLibrary } from "./game/Game";
/** @group Supporting Types */
export type { HiddenPropertySerializationRule, PanelTab } from "./game/Chit";
/** @group Supporting Types */
export type { GameResult } from "./game/Game";
/** @group Supporting Types */
export type { Stage } from "./game/GameDeckChit";
/** @group Supporting Types */
export { PlayerInfo } from "./game/PlayerInfo";
/** @group Supporting Types */
export type { IPlayerInfo } from "./game/PlayerInfo";
/** @internal */
/** @group Supporting Types */
export { MatchViewer } from "./components/MatchViewer";
/** @internal */
/** @group Supporting Types */
export { DemoWrapper } from "./components/DemoWrapper";
/** @internal */
/** @group Supporting Types */
export { Match } from "./game/Match";
/** @internal */
/** @group Supporting Types */
export { Connection } from "./game/Connection";
/** @internal */
/** @group Supporting Types */
export { ClientTrustMatchViewer } from "./components/ClientTrustMatchViewer";
/** @internal */
/** @group Supporting Types */
export { ServerTrustMatchViewer } from "./components/ServerTrustMatchViewer";
/** @group Supporting Types */
export type { BottomBarButtonIcon } from "./components/BottomBarButton";
/** @group Supporting Types */
export { GameDesigner } from "./components/GameDesigner";
/** @group Supporting Types */
export type { PanelLayoutResult } from "./utilities/LayoutHelper";
/** @group Supporting Types */
export type { Picks } from "./game/Turn";
/** @group Supporting Types */
export type { DefaultProps } from "./utilities/CanvasStack/ReactCanvas";
/** @group Supporting Types */
export type {
  ImageSpec,
  Bounds,
  ImageColorSpec,
  ImageFileInfo,
  ImageOptions,
  RenderCallback,
  GetImage,
} from "./utilities/CanvasStack/CanvasOperations";
/** @group Supporting Types */
export type { IUpdatingCanvas } from "./utilities/IUpdatingCanvas";
/** @group Supporting Types */
export type { IconMap } from "./utilities/CanvasStack/RichTextRenderer";
/** @group Supporting Types */
export type { StaticImageOptions } from "./utilities/StaticImage";
/** @group Supporting Types */
export type { SplayCounterOptions } from "./rendering/SplayCounter";
/** @group Supporting Types */
export type { ExtrudeFromSVGOptions } from "./utilities/SvgExtruder";
/** @group Supporting Types */
export type { LayoutNode, PanelNode, ContainerNode, CollapsedNode, LayoutDirection } from "./utilities/LayoutHelper";
/** @group Supporting Types */
export { ImageResult, ImageCache } from "./utilities/CanvasStack/ImageCache";
