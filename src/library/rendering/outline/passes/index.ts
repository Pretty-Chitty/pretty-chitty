// Individual passes for outline effect (depth-based)
export { DepthRenderPass } from "./DepthRenderPass";
export { MaskPreparationPass } from "./MaskPreparationPass";
export { EdgeDetectionPass } from "./EdgeDetectionPass";
export { BlurPass, BlurDirection } from "./BlurPass";
export { OutlineCompositePass } from "./OutlineCompositePass";

// Individual passes for ID-based outline effect
export { ObjectIDRenderPass } from "./ObjectIDRenderPass";
export { IDBasedMaskPass } from "./IDBasedMaskPass";
export { IDBasedEdgeDetectionPass } from "./IDBasedEdgeDetectionPass";
export { InterMeshEdgeDetectionPass, EdgeMode } from "./InterMeshEdgeDetectionPass";

// High-level effect composers
export { OutlineEffectComposer } from "./OutlineEffectComposer";
export { IDBasedOutlineEffectComposer } from "./IDBasedOutlineEffectComposer";
export { EnhancedOutlineEffectComposer } from "./EnhancedOutlineEffectComposer";