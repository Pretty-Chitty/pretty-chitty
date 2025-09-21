// Public API - only export what users actually need
export { EffectComposer } from "./EffectComposer";
export { RenderPass } from "./RenderPass";
export { OutlinePass } from "./OutlinePass";
export { IDBasedOutlinePass } from "./IDBasedOutlinePass";
export { OutputPass } from "./OutputPass";

// New modular outline effect systems
export { OutlineEffectComposer } from "./passes/OutlineEffectComposer";
export { IDBasedOutlineEffectComposer } from "./passes/IDBasedOutlineEffectComposer";
export { EnhancedOutlineEffectComposer } from "./passes/EnhancedOutlineEffectComposer";

// Individual passes (for advanced users who want to customize the pipeline)
export type {
  DepthRenderPass,
  MaskPreparationPass,
  EdgeDetectionPass,
  BlurPass,
  OutlineCompositePass,
  ObjectIDRenderPass,
  IDBasedMaskPass,
  IDBasedEdgeDetectionPass,
  InterMeshEdgeDetectionPass,
} from "./passes";
export { BlurDirection, EdgeMode } from "./passes";

// Internal utilities (keep files but don't export publicly)
// - FullScreenQuad: used internally by OutlinePass and OutputPass
// - ShaderPass: used internally by EffectComposer
// - MaskPass/ClearMaskPass: used internally by EffectComposer
// - types, shaders: internal definitions