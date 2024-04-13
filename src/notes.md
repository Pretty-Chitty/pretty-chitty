Chit
-- has autoincrementing id
-- has properties (state)
-- automatically tracked over time (on server at least)
-- can serialize and deserialize itself over wire?
-- has parent chit
-- has children chits (ordered)
-- can render to a ChitRenderSpec
-- can be selectable (i.e. can be a choice for a given prompt?)
ChitRenderSpec
-- reference to chit
-- offset from parent
-- rotation
-- list of MeshSpecs
-- list of LightSpecs?
-- CameraSpec? maybe if a panel
-- sizing instructions?
-- autosized? manually sized?
-- expanded area for click?
-- should this affect camera panning?
CameraSpec
-- distance
-- offset angle?
-- max zoom?
LightSpec
-- offset from parent?
-- ThreeJS light?
-- does this make sense if it is not a "root" object? Tweening lights would maybe be more trouble than it is worth
Viewer
-- Given a single chit and handles everything from there?
-- that single chit might have camera/light specs on it and will most definitely have children
ChitRenderInstance
-- created by Viewer
-- reference to current ChitRenderSpec (which has reference to chit?)
-- when created, will set a link to itself on Chit as hte current ChitRenderInstance for that chit?

-- reference to a Viewer?
-- current tween
-- children ChitRenderInstances?
-- if the render spec changes, will re-tween.  
 -- if the instance is removed, will tween to either other panel or off
