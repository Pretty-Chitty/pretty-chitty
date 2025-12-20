/**
 * @group Core Game Elements
 */
export { Chit } from "./game/Chit";
/**
 * @group Core Game Elements
 */
export type { HiddenPropertySerializationRule, PanelTab } from "./game/Chit";
/**
 * @group Core Game Elements
 */
export { DropdownChit } from "./game/DropdownChit";
/**
 * @group Core Game Elements
 */
export type { Game } from "./game/Game";
/**
 * @group Core Game Elements
 */
export { GameButton, DynamicGameButton, ToggleGalleryButton } from "./game/GameButton";
/**
 * @group Core Game Elements
 */
export type { ButtonCallback } from "./game/GameButton";
/**
 * @group Core Game Elements
 */
export type { IChitLibrary, IButtonLibrary, ICanvasLibrary } from "./game/Game";

// Supporting types - no @group tag, will appear in "Other" section
export type { GameResult } from "./game/Game";

/**
 * @group Game Containers
 */
export { GameDeck } from "./game/GameDeck";
/**
 * @group Game Containers
 */
export { GameBag } from "./game/GameBag";
/**
 * @group Game Containers
 */
export { OrderedOutlet } from "./game/OrderedOutlet";
/**
 * @group Game Containers
 */
export type { Stage } from "./game/GameDeck";

/**
 * @group Player & Turn Management
 */
export { Pick, ButtonPick, ChitPick } from "./game/Pick";
/**
 * @group Player & Turn Management
 */
export { PlayerChit } from "./game/PlayerChit";
/**
 * @group Player & Turn Management
 */
export { RootChit } from "./game/RootChit";
/**
 * @group Player & Turn Management
 */
export { SparkChit, BagSparkChit } from "./game/SparkChit";
/**
 * @group Player & Turn Management
 */
export { Turn } from "./game/Turn";
/**
 * @group Player & Turn Management
 */
export { PlayerInfo } from "./game/PlayerInfo";
/**
 * @group Player & Turn Management
 */
export type { IPlayerInfo } from "./game/PlayerInfo";
/**
 * @group Player & Turn Management
 */
export type { Picks } from "./game/Turn";

/**
 * @group UI Components
 */
export { GameTheme } from "./game/GameTheme";

/**
 * @group Canvas & Image Utilities
 */
export type { IconMap } from "./utilities/CanvasStack/RichTextRenderer";
/**
 * @group Canvas & Image Utilities
 */
export { Dice } from "./utilities/Dice";
/**
 * @group Canvas & Image Utilities
 */
export { ParameterizedCanvas } from "./utilities/ParameterizedCanvas";
/**
 * @group Canvas & Image Utilities
 */
export { StaticImage } from "./utilities/StaticImage";
/**
 * @group Canvas & Image Utilities
 */
export type { StaticImageOptions } from "./utilities/StaticImage";
/**
 * @group Canvas & Image Utilities
 */
export * as ReactCanvas from "./utilities/CanvasStack/ReactCanvas";
/**
 * @group Canvas & Image Utilities
 */
export { IconCanvas } from "./utilities/CanvasStack/IconCanvas";
/**
 * @group Canvas & Image Utilities
 */
export type { DefaultProps } from "./utilities/CanvasStack/ReactCanvas";
/**
 * @group Canvas & Image Utilities
 */
export type {
  ImageSpec,
  Bounds,
  ImageColorSpec,
  ImageFileInfo,
  ImageOptions,
  RenderCallback,
  GetImage,
} from "./utilities/CanvasStack/CanvasOperations";
/**
 * @group Canvas & Image Utilities
 */
export type { IUpdatingCanvas } from "./utilities/IUpdatingCanvas";
/**
 * @group Canvas & Image Utilities
 */
export { ImageResult, ImageCache } from "./utilities/CanvasStack/ImageCache";

/**
 * @group UI Components
 */
export { MatchViewer } from "./components/MatchViewer";
/**
 * @group UI Components
 */
export { ClientTrustMatchViewer } from "./components/ClientTrustMatchViewer";
/**
 * @group UI Components
 */
export type { BottomBarButtonIcon } from "./components/BottomBarButton";
/**
 * @group UI Components
 */
export { GameDesigner } from "./components/GameDesigner";

/**
 * @group Layout Utilities
 */
export { ChildOutlet, NonEditable, Ordered } from "./utilities/Annotations";
/**
 * @group Layout Utilities
 */
export type { PanelLayoutResult } from "./utilities/LayoutHelper";

/**
 * @group Rendering
 */
export { CameraSpec } from "./rendering/CameraSpec";
/**
 * @group Rendering
 */
export { ChitRenderSpec, OwnerOriginPosition } from "./rendering/ChitRenderSpec";
/**
 * @group Rendering
 */
export type { SplayCounterOptions } from "./rendering/SplayCounter";
/**
 * @group Rendering
 */
export { HighlightSpec } from "./rendering/HighlightSpec";
/**
 * @group Rendering
 */
export { LightSpec, Light } from "./rendering/LightSpec";
/**
 * @group Rendering
 */
export { Splay } from "./rendering/Splay";

/**
 * @group 3D Utilities
 */
export type { ExtrudeFromSVGOptions } from "./utilities/SvgExtruder";
/**
 * @group 3D Utilities
 */
export { extrudeSVGToGeometry } from "./utilities/SvgExtruder";
/**
 * @group 3D Utilities
 */
export { CardMesh } from "./utilities/CardMesh";

/**
 * @group Layout Utilities
 */
export type { LayoutNode, PanelNode, ContainerNode, CollapsedNode, LayoutDirection } from "./utilities/LayoutHelper";
