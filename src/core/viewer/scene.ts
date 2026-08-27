import { loadViewerRuntime } from "./loader"
import type { AutodeskViewingGlobal, SceneModel, Viewer3D } from "./types"

export interface LocalViewerHandle {
  av: AutodeskViewingGlobal
  viewer: Viewer3D
  model: SceneModel
  dispose: () => void
}

/**
 * Boots a tokenless local viewer (no APS credentials, no design file) with the
 * Scene API feature flag enabled, and shows an empty dynamic model ready for
 * `model.getInstances().add(...)`.
 *
 * Docs: https://aps.autodesk.com/en/docs/viewer/v7/developers_guide/scene_api/
 */
// LMV initializes globally once per page; feature flags freeze at that point.
let initPromise: Promise<void> | null = null

function initOnce(av: Awaited<ReturnType<typeof loadViewerRuntime>>): Promise<void> {
  initPromise ??= new Promise<void>((resolve) => {
    if (av.FeatureFlags && av.PublicFeatureFlags?.SceneAPI) {
      av.FeatureFlags.set(av.PublicFeatureFlags.SceneAPI, true)
    }
    av.Initializer({ env: "Local", api: "" }, resolve)
  })
  return initPromise
}

export async function createLocalScene(
  container: HTMLElement,
): Promise<LocalViewerHandle> {
  const av = await loadViewerRuntime()
  await initOnce(av)

  const viewer = new av.GuiViewer3D(container)
  const started = viewer.start()
  if (started > 0) throw new Error(`Viewer failed to start (code ${started})`)

  // Create a dynamic model and register it with the renderer before
  // touching its instance collection.
  const model = new av.Model()
  viewer.showModel(model)
  viewer.setBackgroundColor?.(18, 24, 27, 7, 11, 13)

  return {
    av,
    viewer,
    model,
    dispose: () => viewer.finish(),
  }
}

/**
 * Hello Triangle, verbatim from the Scene API tutorial:
 * https://aps.autodesk.com/en/docs/viewer/v7/developers_guide/scene_api/hello-triangle/
 */
export function addHelloTriangle(handle: LocalViewerHandle): number {
  const { av, viewer, model } = handle
  const avs = av.Scene
  const avm = av.Math

  const instances = model.getInstances()

  // Camera so the triangle is visible.
  viewer.getCamera().setView({
    position: new avm.Vector3(0, 0, 5),
    target: new avm.Vector3(0, 0, 0),
    up: new avm.Vector3(0, 1, 0),
  })

  // Triangle vertices (x/y/z), normals toward the camera, one indexed triangle.
  const positions = new Float32Array([
    -1.0, -1.0, 0.0, // bottom-left
    1.0, -1.0, 0.0, // bottom-right
    0.0, 1.0, 0.0, // top-center
  ])
  const normals = new Float32Array([
    0.0, 0.0, 1.0,
    0.0, 0.0, 1.0,
    0.0, 0.0, 1.0,
  ])
  const indices = new Uint16Array([0, 1, 2])

  const geometry = new avs.BufferGeometry()
  geometry.setAttribute("position", new avs.BufferAttribute(positions, 3))
  geometry.setAttribute("normal", new avs.BufferAttribute(normals, 3))
  geometry.setIndices(indices)

  const material = new avs.StandardMaterial({ color: 0x00cc88 })

  const id = instances.add(geometry, material)

  // Nothing renders until refresh.
  viewer.refresh(true)
  return id
}
