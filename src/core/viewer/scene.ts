import * as THREE from "three"
import { CameraRig, type RigView, type Vec3 } from "./rig"

export type { RigView, Vec3 }

/**
 * The rendering half of the viewer, on plain three.js.
 *
 * This used to boot Autodesk's LMV with the experimental Scene API. Every
 * capability the app actually used — dynamic instances, hit testing,
 * world-to-client projection, cut planes, first-person walking — is small
 * enough to own directly, and owning it removes the preview-API flicker and
 * layering faults that came with the wrapper. `Stage` (in `@layer0/scene-render`)
 * keeps the same public API it always had; this handle is what it draws with.
 */
export interface LocalViewerHandle {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  canvas: HTMLCanvasElement
  rig: CameraRig
  /** Schedules a redraw; consecutive calls in one frame coalesce. */
  requestRender: () => void
  /** Horizontal cutaway: hides everything above `y`. `null` restores. */
  setCutY: (y: number | null) => void
  dispose: () => void
}

export function createLocalScene(container: HTMLElement): Promise<LocalViewerHandle> {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x12181b)
  scene.fog = new THREE.Fog(0x12181b, 90, 260)

  const camera = new THREE.PerspectiveCamera(
    50,
    Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
    0.1,
    600,
  )

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.localClippingEnabled = false
  const canvas = renderer.domElement
  canvas.style.display = "block"
  canvas.style.touchAction = "none"
  canvas.tabIndex = 0
  container.appendChild(canvas)

  // Flat, legible lighting: one key from above, soft fill so cupboard interiors
  // stay readable when the ceiling is on.
  scene.add(new THREE.AmbientLight(0xffffff, 0.75))
  const key = new THREE.DirectionalLight(0xffffff, 1.4)
  key.position.set(24, 40, 14)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xbfd4e2, 0.35)
  fill.position.set(-18, 22, -26)
  scene.add(fill)

  const rig = new CameraRig(camera, container)

  let renderQueued = false
  const draw = () => {
    renderQueued = false
    renderer.render(scene, camera)
  }
  const requestRender = () => {
    if (renderQueued) return
    renderQueued = true
    requestAnimationFrame(draw)
  }
  const offRig = rig.onChange(requestRender)

  const resize = new ResizeObserver(() => {
    const w = Math.max(1, container.clientWidth)
    const h = Math.max(1, container.clientHeight)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    requestRender()
  })
  resize.observe(container)

  const setCutY = (y: number | null) => {
    // A plane clips where its signed distance goes negative; normal −Y with
    // constant `y` keeps everything at or below the cut height.
    renderer.clippingPlanes =
      y === null ? [] : [new THREE.Plane(new THREE.Vector3(0, -1, 0), y)]
    requestRender()
  }

  requestRender()

  return Promise.resolve({
    scene,
    camera,
    renderer,
    canvas,
    rig,
    requestRender,
    setCutY,
    dispose: () => {
      resize.disconnect()
      offRig()
      rig.dispose()
      renderer.dispose()
      canvas.remove()
    },
  })
}
