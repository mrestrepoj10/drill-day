import type {
  LocalViewerHandle,
  Matrix4,
  MaterialParams,
  SceneMaterial,
  Vector3,
} from "@layer0/viewer"
import type { GeometryBuffers } from "./geometry"
import { parseColor, type Vec3 } from "./spec"
import { gridLines, unitArrow, unitBox, unitBoxEdges, unitCylinder, unitPlane, unitSphere } from "./units"

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
  /** Draw as line segments (`LineMaterial`); requires a line geometry. */
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
  lmvId: number
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
  grid: () => gridLines(1, 10),
}

/**
 * A thin, mutable scene on top of `InstanceCollection3D`.
 *
 * `SceneRenderer` (see `render.ts`) renders a *document*: emit a new spec, diff
 * it, swap what changed. That is the right model for content an agent authors
 * in one shot. It is the wrong model for a scene that is being simulated —
 * every temperature tick would tear down and rebuild geometry.
 *
 * `Stage` is the other half: geometry is uploaded once as a unit primitive and
 * shared, placement lives in a per-instance `Matrix4`, and colour lives in the
 * material. Moving a rack is `setTransformLocal`; recolouring 200 floor tiles
 * to a new heat field is 200 `setMaterial` calls and one `refresh`. Nothing is
 * reallocated, so the same call is cheap enough to run inside an animation
 * frame.
 *
 * Grouping is composed here rather than in the viewer. `avs.Node3D` /
 * `avs.InstanceNode3D` do exist in the 7.x bundle, but on the build we tested
 * neither a node transform nor a node visibility state propagates to instances
 * added through the collection, so `Stage` multiplies the group matrix into
 * each child's local matrix itself.
 */
export class Stage {
  private geometries = new Map<string, unknown>()
  private items = new Map<string, StageItem>()
  private byLmvId = new Map<number, string>()
  private groups = new Map<string, { position: Vec3; rotationY: number }>()
  private cameraAnimation = 0
  /**
   * Whether anything has actually changed since the last redraw.
   *
   * A simulated scene calls `sync` on every tick, and most of those ticks
   * change nothing — the same temperature, the same transform. Passing them all
   * through to `viewer.refresh` restarts the viewer's progressive render before
   * it has finished, so a busy hall never draws its last few hundred
   * instances. Writes that are genuinely no-ops are dropped here instead.
   */
  private dirty = false

  constructor(private handle: LocalViewerHandle) {}

  // --- geometry -----------------------------------------------------------

  /** Uploads a `BufferGeometry` under `key`; later `add`s reference it by name. */
  defineGeometry(key: string, buffers: GeometryBuffers): void {
    const avs = this.handle.av.Scene
    const geometry = new avs.BufferGeometry()
    geometry.setAttribute("position", new avs.BufferAttribute(buffers.positions, 3))
    if (buffers.normals.length) {
      geometry.setAttribute("normal", new avs.BufferAttribute(buffers.normals, 3))
    }
    if (buffers.indices.length) geometry.setIndices(buffers.indices)
    this.geometries.set(key, geometry)
  }

  private geometry(key: string): unknown {
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
    if (!existing || existing.geometry !== init.geometry) {
      if (existing) this.remove(id)
      const lmvId = this.handle.model
        .getInstances()
        .add(this.geometry(init.geometry), this.material(init), this.matrix(init))
      this.items.set(id, { ...init, id, lmvId })
      this.byLmvId.set(lmvId, id)
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
    const instances = this.handle.model.getInstances()
    if (moved) instances.setTransformLocal(existing.lmvId, this.matrix(next))
    if (repainted) instances.setMaterial(existing.lmvId, this.material(next))
    if (moved || repainted) this.dirty = true
  }

  /** Moves/resizes an existing instance without touching its material. */
  place(id: string, patch: Partial<Placement>): void {
    const item = this.items.get(id)
    if (!item) return
    const next = { ...item, ...patch }
    if (samePlacement(item, next)) return
    this.items.set(id, next)
    this.handle.model.getInstances().setTransformLocal(item.lmvId, this.matrix(next))
    this.dirty = true
  }

  /** Repaints an existing instance without touching its transform. */
  paint(id: string, patch: Partial<Appearance>): void {
    const item = this.items.get(id)
    if (!item) return
    const next = { ...item, ...patch }
    if (sameAppearance(item, next)) return
    this.items.set(id, next)
    this.handle.model.getInstances().setMaterial(item.lmvId, this.material(next))
    this.dirty = true
  }

  remove(id: string): void {
    const item = this.items.get(id)
    if (!item) return
    this.handle.model.getInstances().remove(item.lmvId)
    this.byLmvId.delete(item.lmvId)
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
    const instances = this.handle.model.getInstances()
    for (const item of this.items.values()) {
      if (item.group === group) instances.setTransformLocal(item.lmvId, this.matrix(item))
    }
  }

  groupTransform(group: string): { position: Vec3; rotationY: number } {
    return this.groups.get(group) ?? { position: [0, 0, 0], rotationY: 0 }
  }

  // --- picking ------------------------------------------------------------

  /**
   * Screen point → stage id. `impl.hitTest` returns `fragId`, which for a
   * dynamic model is exactly the id `instances.add` handed back.
   */
  pick(clientX: number, clientY: number): StageItem | undefined {
    const hit = this.rawHit(clientX, clientY)
    return hit?.item && !hit.item.decorative ? hit.item : undefined
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
  ): StageItem | undefined {
    const exact = this.pick(clientX, clientY)
    if (exact) return exact

    const rect = this.handle.viewer.impl.getCanvasBoundingClientRect()
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
      if (screenDistance > radiusPx) continue

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
  ): { item?: StageItem; distance: number } | undefined {
    const rect = this.handle.viewer.impl.getCanvasBoundingClientRect()
    const hit = this.handle.viewer.impl.hitTest(clientX - rect.left, clientY - rect.top, true)
    if (!hit) return undefined
    const id = this.byLmvId.get(hit.fragId)
    return { item: id ? this.items.get(id) : undefined, distance: hit.distance }
  }

  // --- camera -------------------------------------------------------------

  /** Snaps the camera. */
  setView(view: CameraView): void {
    const { Vector3 } = this.handle.av.Math
    this.cameraAnimation++
    this.handle.viewer.getCamera().setView({
      position: new Vector3(...view.position),
      target: new Vector3(...view.target),
      up: new Vector3(...(view.up ?? [0, 1, 0])),
    })
    this.refresh(true)
  }

  /**
   * Eases the camera to `view` over `ms`. Agent-driven camera moves read as
   * navigation rather than teleportation, which is most of what makes a remote
   * tool call legible to the human watching.
   */
  flyTo(view: CameraView, ms = 900): Promise<void> {
    const { Vector3 } = this.handle.av.Math
    const camera = this.handle.viewer.getCamera()
    const from = this.currentView()
    const token = ++this.cameraAnimation
    const up = new Vector3(...(view.up ?? [0, 1, 0]))
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
        camera.setView({
          position: new Vector3(...lerp3(from.position, view.position, e)),
          target: new Vector3(...lerp3(from.target, view.target, e)),
          up,
        })
        this.refresh(true)
        if (t < 1) requestAnimationFrame(step)
        else resolve()
      }
      requestAnimationFrame(step)
    })
  }

  /** Current camera position/target, read back off the viewer. */
  currentView(): CameraView | undefined {
    const nav = this.handle.viewer.navigation as
      | { getPosition?: () => Vector3; getTarget?: () => Vector3 }
      | undefined
    const p = nav?.getPosition?.()
    const t = nav?.getTarget?.()
    if (!p || !t) return undefined
    return { position: [p.x, p.y, p.z], target: [t.x, t.y, t.z] }
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
   *
   * `impl.worldToClient` gives the pixel position but its `z` is not a reliable
   * "is this behind me" flag across builds, so the facing test is done directly
   * against the camera: a point on the far side of the eye plane is dropped
   * rather than drawn mirrored on the wrong side of the screen.
   */
  project(point: Vec3): { x: number; y: number } | undefined {
    const { Vector3 } = this.handle.av.Math
    const view = this.currentView()
    if (view) {
      const [px, py, pz] = view.position
      const [tx, ty, tz] = view.target
      const fx = tx - px
      const fy = ty - py
      const fz = tz - pz
      const dot = (point[0] - px) * fx + (point[1] - py) * fy + (point[2] - pz) * fz
      if (dot <= 0) return undefined
    }
    const p = this.handle.viewer.impl.worldToClient(new Vector3(...point))
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return undefined
    return { x: p.x, y: p.y }
  }

  /**
   * Screen point → the point where that ray crosses the horizontal plane at
   * `planeY`. This is what makes dragging a mass across the site feel direct:
   * the pointer stays under the geometry instead of the geometry chasing it.
   */
  groundPoint(clientX: number, clientY: number, planeY = 0): Vec3 | undefined {
    const impl = this.handle.viewer.impl
    const rect = impl.getCanvasBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    try {
      const ray = impl.viewportToRay(impl.clientToViewport(x, y))
      const dy = ray.direction.y
      if (Math.abs(dy) < 1e-6) return undefined
      const t = (planeY - ray.origin.y) / dy
      if (t < 0) return undefined
      return [
        ray.origin.x + ray.direction.x * t,
        planeY,
        ray.origin.z + ray.direction.z * t,
      ]
    } catch {
      return undefined
    }
  }

  /**
   * Redraws, if there is anything to redraw. `force` is for changes this class
   * cannot see — a camera move, or a viewer-level setting like a cut plane.
   */
  refresh(force = false): void {
    if (!force && !this.dirty) return
    this.dirty = false
    this.handle.viewer.refresh(true)
  }

  // --- internals ----------------------------------------------------------

  private material(a: Appearance): SceneMaterial {
    const avs = this.handle.av.Scene
    const params: MaterialParams = { color: parseColor(a.color) }
    if (a.opacity !== undefined && a.opacity < 1) {
      params.opacity = a.opacity
      params.transparent = true
    }
    if (a.throughWalls) {
      params.depthTest = false
      params.depthWrite = false
    }
    if (a.lines) return new avs.LineMaterial(params)
    if (a.unlit) return new avs.UnlitMaterial(params)
    if (a.metal) params.metal = true
    return new avs.StandardMaterial(params)
  }

  private matrix(p: Placement & { group?: string }): Matrix4 {
    const { Vector3, Quaternion, Matrix4 } = this.handle.av.Math
    const size = p.size ?? [1, 1, 1]
    const quaternion = new Quaternion()
    if (p.direction) {
      const [dx, dy, dz] = p.direction
      const len = Math.hypot(dx, dy, dz) || 1
      quaternion.setFromUnitVectors(
        new Vector3(0, 1, 0),
        new Vector3(dx / len, dy / len, dz / len),
      )
    } else if (p.rotationY) {
      quaternion.setFromAxisAngle(new Vector3(0, 1, 0), p.rotationY)
    }
    const local = new Matrix4().compose(
      new Vector3(...p.position),
      quaternion,
      new Vector3(...size),
    )
    const group = p.group ? this.groups.get(p.group) : undefined
    if (!group) return local
    const parent = new Matrix4().compose(
      new Vector3(...group.position),
      new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), group.rotationY),
      new Vector3(1, 1, 1),
    )
    return new Matrix4().multiplyMatrices(parent, local)
  }
}

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
