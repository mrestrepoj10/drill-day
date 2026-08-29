// The scene spec — "json-render for 3D".
// A flat, declarative JSON document an agent (or a form) can emit,
// rendered 1:1 onto scene instances. Stable `id`s are the contract
// that makes diffing, patching, and incremental re-render possible.

export type Vec3 = [number, number, number]

export interface BoxShape {
  type: "box"
  /** Center of the box in model space. */
  position: Vec3
  /** Full extents along x/y/z. */
  size: Vec3
}

export interface CylinderShape {
  type: "cylinder"
  /** Center of the cylinder in model space. */
  position: Vec3
  radius: number
  /** Full height along y. */
  height: number
  /** Radial segments (default 24). */
  segments?: number
}

export type Shape = BoxShape | CylinderShape

export interface SceneInstanceSpec {
  /** Stable identity — required. Same id across specs = same logical element. */
  id: string
  shape: Shape
  /** Hex color, e.g. 0x8899aa or "#8899aa". */
  color?: number | string
  /** Semantic tag (e.g. "column" | "slab") for takeoffs/filtering. */
  tag?: string
  /** Optional level/story index for sequencing and grouping. */
  level?: number
  /** Human-readable name for panels ("Columna B-2"). */
  name?: string
  /** Arbitrary property-set metadata shown in the properties panel. */
  props?: Record<string, string | number | boolean>
}

export interface SceneSpec {
  instances: SceneInstanceSpec[]
  camera?: { position: Vec3; target: Vec3; up?: Vec3 }
}

// --- Patches: the unit of change between specs ---

export interface ScenePatch {
  add: SceneInstanceSpec[]
  /** ids to remove. */
  remove: string[]
  /** Full replacement specs for changed ids (geometry is baked, so update = swap). */
  update: SceneInstanceSpec[]
  camera?: SceneSpec["camera"]
}

/** Structural diff of two specs by id. */
export function diffSpecs(prev: SceneSpec, next: SceneSpec): ScenePatch {
  const prevById = new Map(prev.instances.map((i) => [i.id, i]))
  const patch: ScenePatch = { add: [], remove: [], update: [], camera: next.camera }

  for (const inst of next.instances) {
    const old = prevById.get(inst.id)
    if (!old) patch.add.push(inst)
    else {
      if (JSON.stringify(old) !== JSON.stringify(inst)) patch.update.push(inst)
      prevById.delete(inst.id)
    }
  }
  patch.remove = [...prevById.keys()]
  return patch
}

export function parseColor(c: number | string | undefined, fallback = 0x9aa4af): number {
  if (typeof c === "number") return c
  if (typeof c === "string") {
    const n = parseInt(c.replace(/^#/, ""), 16)
    if (!Number.isNaN(n)) return n
  }
  return fallback
}
