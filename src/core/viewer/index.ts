// @layer0/viewer — APS Viewer (Scene API) foundation.
// Overview: https://aps.autodesk.com/en/docs/viewer/v7/developers_guide/scene_api/
// Blog: https://aps.autodesk.com/blog/introducing-scene-api-aps-viewer

export * from "./urls"
export * from "./types"
export { loadViewerRuntime } from "./loader"
export { createLocalScene, addHelloTriangle } from "./scene"
export type { LocalViewerHandle } from "./scene"

export interface ViewerConfig {
  /** APS access token supplier (2-legged or 3-legged). */
  getAccessToken: () => Promise<{ token: string; expiresIn: number }>
  /** URN of the translated model to load. */
  urn?: string
}
