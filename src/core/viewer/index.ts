// @layer0/viewer — the 3D viewport: three.js scene, camera rig, render loop.
export { createLocalScene } from "./scene"
export type { LocalViewerHandle } from "./scene"
export { CameraRig } from "./rig"
export type { RigView, Vec3 } from "./rig"
export { buildOctree, SPRINT_SPEED, WALK_SPEED, WalkBody } from "./collide"
export type { Octree, WalkInput, WalkWorld } from "./collide"
