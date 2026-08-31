import * as THREE from "three"
import type { LocalViewerHandle } from "@layer0/viewer"
import type { GeometryBuffers } from "./geometry"
import { parseColor, type Vec3 } from "./spec"
import {
  gridLines,
  unitArrow,
  unitBox,
  unitBoxCorners,
  unitBoxEdges,
  unitCylinder,
  unitExtinguisher,
  unitPlane,
  unitSphere,
  unitValve,
} from "./units"

/** Where an instance sits. Everything is expressed relative to the unit geometry. */
export interface Placement {
  /** Centre of the instance, in model space (metres, y up). */
  position: Vec3
  /** Multiplier on the unit geometry — for `box`, the full extents. */
  size?: Vec3
  /** Rotation about y, in radians. */
  rotationY?: number
  /** Aim the geometry's +Y axis along this vector (used by `arrow`). */
  direction?: Vec3
}

export interface Appearance {
  color: number | string
  /** < 1 turns the material transparent. */
  opacity?: number
  /** Draw unlit — flat colour regardless of lighting. Good for HUD-ish content. */
  unlit?: boolean
  /** Draw as line segments; requires a line geometry. */
  lines?: boolean
  metal?: boolean
  /** Draw on top of everything, ignoring depth — for guides and highlights. */
  throughWalls?: boolean
}

export interface StageItemInit extends Placement, Appearance {
  /** Key of a geometry registered with `defineGeometry`, or a built-in. */
  geometry: string
  /** Optional grouping key — `setGroupTransform` moves every member at once. */
  group?: string
  /** Excluded from picking (guides, arrows, outlines). */
  decorative?: boolean
}

export interface StageItem extends StageItemInit {
  id: string
}

export interface CameraView {
  position: Vec3
  target: Vec3
  up?: Vec3
}

const BUILT_INS: Record<string, () => GeometryBuffers> = {
  box: unitBox,
  cylinder: unitCylinder,
  plane: unitPlane,
  arrow: unitArrow,
  sphere: unitSphere,
  boxEdges: unitBoxEdges,
  boxCorners: () => unitBoxCorners(),
  grid: () => gridLines(1, 10),
  valve: unitValve,
  extinguisher: unitExtinguisher,
}

/**
 * A thin, mutable scene of shared unit geometries and per-item transforms.
 *
 * Geometry is uploaded once as a unit primitive and shared; placement lives in
 * the object's matrix and colour in its material, so moving a rack or
 * recolouring 200 floor tiles reallocates nothing and is cheap enough to run
 * inside an animation frame.
 *
 * Rendering is on-demand: mutations mark the stage dirty, `refresh` schedules
 * one redraw. There is no progressive renderer underneath any more, so a busy
 * frame can no longer flicker half-drawn.
 */
export class Stage {
  private geometries = new Map<string, THREE.BufferGeometry>()
  private items = new Map<string, StageItem>()
  private objects = new Map<string, THREE.Mesh | THREE.LineSegments>()
  private groups = new Map<string, { position: Vec3; rotationY: number }>()
  private cameraAnimation = 0
  private raycaster = new THREE.Raycaster()
  private dirty = false

  constructor(private handle: LocalViewerHandle) {}

  // --- geometry -----------------------------------------------------------

  /** Registers `buffers` under `key`; later `add`s reference it by name. */
  defineGeometry(key: string, buffers: GeometryBuffers): void {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", new THREE.BufferAttribute(buffers.positions, 3))
    if (buffers.normals.length) {
      geometry.setAttribute("normal", new THREE.BufferAttribute(buffers.normals, 3))
    }
    if (buffers.indices.length) {
      geometry.setIndex(new THREE.BufferAttribute(buffers.indices, 1))
    }
    this.geometries.set(key, geometry)
  }

  private geometry(key: string): THREE.BufferGeometry {
    const existing = this.geometries.get(key)
    if (existing) return existing
    const builtIn = BUILT_INS[key]
    if (!builtIn) throw new Error(`Stage: unknown geometry "${key}"`)
    this.defineGeometry(key, builtIn())
    return this.geometries.get(key)!
  }

  // --- instances ----------------------------------------------------------

  /** Adds the instance, or updates it in place if `id` already exists. */
  set(id: string, init: StageItemInit): void {
    const existing = this.items.get(id)
    if (!existing || existing.geometry !== init.geometry || !!existing.lines !== !!init.lines) {
      if (existing) this.remove(id)
      const geometry = this.geometry(init.geometry)
      const material = this.material(init)
      const object = init.lines
        ? new THREE.LineSegments(geometry, material)
        : new THREE.Mesh(geometry, material)
      object.matrixAutoUpdate = false
      object.matrix.copy(this.matrix(init))
      object.name = id
      if (init.throughWalls) object.renderOrder = 10
      this.handle.scene.add(object)
      this.items.set(id, { ...init, id })
      this.objects.set(id, object)
      this.dirty = true
      return
    }
    const next = { ...existing, ...init }
    const moved = !samePlacement(existing, next)
    const repainted = !sameAppearance(existing, next)
    const reclassified =
      !!existing.decorative !== !!next.decorative || existing.group !== next.group
    if (!moved && !repainted && !reclassified) return
    this.items.set(id, next)
    const object = this.objects.get(id)!
    if (moved || reclassified) object.matrix.copy(this.matrix(next))
    if (repainted) this.repaintObject(object, next)
    if (moved || repainted) this.dirty = true
  }

  /** Moves/resizes an existing instance without touching its material. */
  place(id: string, patch: Partial<Placement>): void {
    const item = this.items.get(id)
    if (!item) return
    const next = { ...item, ...patch }
    if (samePlacement(item, next)) return
    this.items.set(id, next)
    this.objects.get(id)!.matrix.copy(this.matrix(next))
    this.dirty = true
  }

  /** Repaints an existing instance without touching its transform. */
  paint(id: string, patch: Partial<Appearance>): void {
    const item = this.items.get(id)
    if (!item) return
    const next = { ...item, ...patch }
    if (sameAppearance(item, next)) return
    this.items.set(id, next)
    this.repaintObject(this.objects.get(id)!, next)
    this.dirty = true
  }

  remove(id: string): void {
    const object = this.objects.get(id)
    if (!object) return
    this.handle.scene.remove(object)
    ;(object.material as THREE.Material).dispose()
    this.objects.delete(id)
    this.items.delete(id)
    this.dirty = true
  }

  /** Removes every instance whose id starts with `prefix`. */
  removeWhere(prefix: string): void {
    for (const id of [...this.items.keys()]) {
      if (id.startsWith(prefix)) this.remove(id)
    }
  }

  clear(): void {
    for (const id of [...this.items.keys()]) this.remove(id)
    this.groups.clear()
  }

  has(id: string): boolean {
    return this.items.has(id)
  }

  get(id: string): StageItem | undefined {
    return this.items.get(id)
  }

  ids(): string[] {
    return [...this.items.keys()]
  }

  get count(): number {
    return this.items.size
  }

  // --- groups -------------------------------------------------------------

  /**
   * Sets a group's transform and re-composes every member's matrix. One call
   * slides a whole rack row, or a whole massing proposal, in a single frame.
   */
  setGroupTransform(group: string, transform: { position?: Vec3; rotationY?: number }): void {
    const current = this.groups.get(group) ?? { position: [0, 0, 0] as Vec3, rotationY: 0 }
    const next = {
      position: transform.position ?? current.position,
      rotationY: transform.rotationY ?? current.rotationY,
    }
    this.groups.set(group, next)
    for (const item of this.items.values()) {
      if (item.group === group) this.objects.get(item.id)!.matrix.copy(this.matrix(item))
    }
    this.dirty = true
  }

  groupTransform(group: string): { position: Vec3; rotationY: number } {
    return this.groups.get(group) ?? { position: [0, 0, 0], rotationY: 0 }
  }

  // --- picking ------------------------------------------------------------

  /**
   * Screen point → stage id.
   *
   * Looks *past* decoration rather than being stopped by it. The ray already
   * arrives as a distance-sorted list, so the first selectable thing along it
   * is the answer; taking hit[0] and dropping it when it happened to be trim
   * meant a bracket or an ID collar in front of a valve silently cost the
   * exact hit, leaving only a centre-distance tolerance that works from some
   * angles and not others.
   */
  pick(clientX: number, clientY: number): StageItem | undefined {
    return this.rawHit(clientX, clientY, true)?.item
  }

  /**
   * A tolerant semantic pick for controls smaller than a comfortable pointer
   * target. Exact geometry wins; otherwise projected item centres are tested
   * inside `radiusPx`. A frontmost decorative hit is also used as an
   * occlusion guard, so this does not turn walls into X-ray selection.
   */
  pickNearest(
    clientX: number,
    clientY: number,
    ids: readonly string[],
    radiusPx = 18,
    /**
     * Ids exempt from the occlusion guard. An element the scene is already
     * showing through walls (a highlight cage) must also be clickable through
     * them — seeing it and not being able to answer with it is a trap.
     */
    xray: ReadonlySet<string> = EMPTY_SET,
  ): StageItem | undefined {
    const exact = this.pick(clientX, clientY)
    if (exact) return exact

    const rect = this.handle.canvas.getBoundingClientRect()
    const pointerX = clientX - rect.left
    const pointerY = clientY - rect.top
    const blocker = this.rawHit(clientX, clientY)
    const view = this.currentView()
    let best: { item: StageItem; score: number } | undefined

    for (const id of ids) {
      const item = this.items.get(id)
      if (!item || item.decorative) continue
      const projected = this.project(item.position)
      if (!projected) continue
      const screenDistance = Math.hypot(projected.x - pointerX, projected.y - pointerY)
      // An x-ray candidate is being shown as a whole cage; anywhere inside
      // its projected extent is a fair answer, not just its centre.
      let effectiveRadius = radiusPx
      if (xray.has(id)) {
        const size = item.size ?? [1, 1, 1]
        const worldRadius = Math.hypot(size[0], size[1], size[2]) / 2
        const eye = this.handle.camera.position
        const away = Math.hypot(
          item.position[0] - eye.x,
          item.position[1] - eye.y,
          item.position[2] - eye.z,
        )
        const focal = rect.height / (2 * Math.tan((this.handle.camera.fov * Math.PI) / 360))
        effectiveRadius = Math.max(radiusPx, (worldRadius / Math.max(away, 0.1)) * focal)
      }
      if (screenDistance > effectiveRadius) continue

      let cameraDistance = 0
      if (view) {
        cameraDistance = Math.hypot(
          item.position[0] - view.position[0],
          item.position[1] - view.position[1],
          item.position[2] - view.position[2],
        )
        const size = item.size ?? [1, 1, 1]
        const itemRadius = Math.hypot(size[0], size[1], size[2]) / 2
        if (
          !xray.has(id) &&
          blocker?.item?.decorative &&
          blocker.distance + 0.25 < cameraDistance - itemRadius
        ) {
          continue
        }
      }

      const score = screenDistance + cameraDistance * 0.015
      if (!best || score < best.score) best = { item, score }
    }

    return best?.item
  }

  private rawHit(
    clientX: number,
    clientY: number,
    /** Skip guides and trim, and keep going to whatever is behind them. */
    selectableOnly = false,
  ): { item?: StageItem; distance: number } | undefined {
    const rect = this.handle.canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(ndc, this.handle.camera)
    // Respect the cutaway: anything above the section plane is invisible, so
    // it must not swallow picks aimed at the storey below it.
    const planes = this.handle.renderer.clippingPlanes
    for (const hit of this.raycaster.intersectObjects(
      [...this.objects.values()].filter((o) => o.visible && o.type === "Mesh"),
      false,
    )) {
      const item = this.items.get(hit.object.name)
      if (!item) continue
      // Transparent content (ceiling tiles, ghosted context) is pick-through,
      // matching the old `hitTest(..., ignoreTransparent)` behaviour.
      if ((item.opacity ?? 1) < 1) continue
      if (planes.some((p) => p.distanceToPoint(hit.point) < 0)) continue
      if (selectableOnly && item.decorative) continue
      return { item, distance: hit.distance }
    }
    return undefined
  }

  /**
   * True when the segment from `from` to `to` passes through an item whose id
   * starts with one of `prefixes` — the walk-mode collision test. A margin
   * keeps the camera's near plane out of the wall face.
   */
  blocked(from: Vec3, to: Vec3, prefixes: readonly string[], margin = 0.35): boolean {
    const origin = new THREE.Vector3(...from)
    const target = new THREE.Vector3(...to)
    const direction = target.clone().sub(origin)
    const distance = direction.length()
    if (distance < 1e-6) return false
    this.raycaster.set(origin, direction.normalize())
    this.raycaster.far = distance + margin
    const solids = [...this.objects.values()].filter(
      (o) => o.type === "Mesh" && prefixes.some((p) => o.name.startsWith(p)),
    )
    const hit = this.raycaster.intersectObjects(solids, false).length > 0
    this.raycaster.far = Infinity
    return hit
  }

  /**
   * The walking surface under plan position (x, z), probed downward from just
   * below eye level so an upper storey doesn't shadow the one being walked.
   */
  groundHeight(x: number, z: number, eyeY: number, prefixes: readonly string[]): number | null {
    this.raycaster.set(new THREE.Vector3(x, eyeY - 0.2, z), new THREE.Vector3(0, -1, 0))
    this.raycaster.far = 4
    const solids = [...this.objects.values()].filter(
      (o) => o.type === "Mesh" && prefixes.some((p) => o.name.startsWith(p)),
    )
    const hit = this.raycaster.intersectObjects(solids, false)[0]
    this.raycaster.far = Infinity
    return hit ? hit.point.y : null
  }

  // --- camera -------------------------------------------------------------

  /** Snaps the camera. */
  setView(view: CameraView): void {
    this.cameraAnimation++
    this.handle.rig.setView(view)
    this.refresh(true)
  }

  /**
   * Eases the camera to `view` over `ms`. Agent-driven camera moves read as
   * navigation rather than teleportation, which is most of what makes a remote
   * tool call legible to the human watching.
   */
  flyTo(view: CameraView, ms = 900): Promise<void> {
    const from = this.currentView()
    const token = ++this.cameraAnimation
    if (!from || ms <= 0) {
      this.setView(view)
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      const start = performance.now()
      const step = () => {
        if (token !== this.cameraAnimation) return resolve()
        const t = Math.min(1, (performance.now() - start) / ms)
        const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2 // easeInOutQuad
        this.handle.rig.setView({
          position: lerp3(from.position, view.position, e),
          target: lerp3(from.target, view.target, e),
        })
        this.refresh(true)
        if (t < 1) requestAnimationFrame(step)
        else resolve()
      }
      requestAnimationFrame(step)
    })
  }

  /** Current camera position/target, read back off the rig. */
  currentView(): CameraView | undefined {
    return this.handle.rig.getView()
  }

  /** A three-quarter view framing a box of `size` centred on `centre`. */
  static frame(centre: Vec3, size: number, azimuth = 0.9, elevation = 0.55): CameraView {
    const d = Math.max(size, 1) * 1.5
    return {
      position: [
        centre[0] + Math.cos(azimuth) * d * Math.cos(elevation),
        centre[1] + d * Math.sin(elevation),
        centre[2] + Math.sin(azimuth) * d * Math.cos(elevation),
      ],
      target: centre,
    }
  }

  // --- projection ---------------------------------------------------------

  /**
   * World point → canvas pixels, for HTML labels pinned to 3D positions.
   * Points behind the eye plane are dropped rather than drawn mirrored on the
   * wrong side of the screen.
   */
  project(point: Vec3): { x: number; y: number } | undefined {
    const camera = this.handle.camera
    const world = new THREE.Vector3(...point)
    const toPoint = world.clone().sub(camera.position)
    const forward = camera.getWorldDirection(new THREE.Vector3())
    if (toPoint.dot(forward) <= 0) return undefined
    const ndc = world.project(camera)
    if (!Number.isFinite(ndc.x) || !Number.isFinite(ndc.y)) return undefined
    const rect = this.handle.canvas.getBoundingClientRect()
    return { x: ((ndc.x + 1) / 2) * rect.width, y: ((1 - ndc.y) / 2) * rect.height }
  }

  /**
   * Screen point → the point where that ray crosses the horizontal plane at
   * `planeY`. This is what makes dragging a mass across the site feel direct:
   * the pointer stays under the geometry instead of the geometry chasing it.
   */
  groundPoint(clientX: number, clientY: number, planeY = 0): Vec3 | undefined {
    const rect = this.handle.canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(ndc, this.handle.camera)
    const ray = this.raycaster.ray
    const dy = ray.direction.y
    if (Math.abs(dy) < 1e-6) return undefined
    const t = (planeY - ray.origin.y) / dy
    if (t < 0) return undefined
    return [
      ray.origin.x + ray.direction.x * t,
      planeY,
      ray.origin.z + ray.direction.z * t,
    ]
  }

  /**
   * Redraws, if there is anything to redraw. `force` is for changes this class
   * cannot see — a camera move, or a viewer-level setting like a cut plane.
   */
  refresh(force = false): void {
    if (!force && !this.dirty) return
    this.dirty = false
    this.handle.requestRender()
  }

  // --- internals ----------------------------------------------------------

  private material(a: Appearance): THREE.Material {
    const color = parseColor(a.color)
    const transparent = a.opacity !== undefined && a.opacity < 1
    const opacity = transparent ? a.opacity! : 1
    let material: THREE.Material
    if (a.lines) {
      material = new THREE.LineBasicMaterial({ color, transparent, opacity })
    } else if (a.unlit) {
      material = new THREE.MeshBasicMaterial({ color, transparent, opacity })
    } else {
      material = new THREE.MeshStandardMaterial({
        color,
        transparent,
        opacity,
        // Without an environment map high metalness reads as near-black, so
        // "metal" here means brushed sheet, not chrome.
        metalness: a.metal ? 0.45 : 0.05,
        roughness: a.metal ? 0.4 : 0.85,
      })
    }
    if (a.throughWalls) {
      material.depthTest = false
      material.depthWrite = false
    }
    return material
  }

  private repaintObject(object: THREE.Mesh | THREE.LineSegments, next: Appearance): void {
    ;(object.material as THREE.Material).dispose()
    object.material = this.material(next)
    object.renderOrder = next.throughWalls ? 10 : 0
  }

  private matrix(p: Placement & { group?: string }): THREE.Matrix4 {
    const size = p.size ?? [1, 1, 1]
    const quaternion = new THREE.Quaternion()
    if (p.direction) {
      const [dx, dy, dz] = p.direction
      const len = Math.hypot(dx, dy, dz) || 1
      quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(dx / len, dy / len, dz / len),
      )
    } else if (p.rotationY) {
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotationY)
    }
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(...p.position),
      quaternion,
      new THREE.Vector3(...size),
    )
    const group = p.group ? this.groups.get(p.group) : undefined
    if (!group) return local
    const parent = new THREE.Matrix4().compose(
      new THREE.Vector3(...group.position),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), group.rotationY),
      new THREE.Vector3(1, 1, 1),
    )
    return new THREE.Matrix4().multiplyMatrices(parent, local)
  }
}

const EMPTY_SET: ReadonlySet<string> = new Set()

function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function sameVec(a: Vec3 | undefined, b: Vec3 | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
}

function samePlacement(a: Placement, b: Placement): boolean {
  return (
    sameVec(a.position, b.position) &&
    sameVec(a.size, b.size) &&
    sameVec(a.direction, b.direction) &&
    (a.rotationY ?? 0) === (b.rotationY ?? 0)
  )
}

function sameAppearance(a: Appearance, b: Appearance): boolean {
  return (
    a.color === b.color &&
    (a.opacity ?? 1) === (b.opacity ?? 1) &&
    !!a.unlit === !!b.unlit &&
    !!a.lines === !!b.lines &&
    !!a.metal === !!b.metal &&
    !!a.throughWalls === !!b.throughWalls
  )
}
