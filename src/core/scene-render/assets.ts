import type { GeometryBuffers } from "./geometry"
import type { Stage, StageItemInit } from "./stage"
import type { Vec3 } from "./spec"

/**
 * One piece of a compound, decorative scene asset. Semantic training elements
 * deliberately do not use this type: their single `el:*` instance remains the
 * stable picking and highlighting contract.
 */
export interface AssetPart
  extends Omit<StageItemInit, "position" | "group" | "decorative"> {
  key: string
  offset: Vec3
}

export interface DecorativeAsset {
  id: string
  position: Vec3
  rotationY?: number
  parts: readonly AssetPart[]
}

/** Places a reusable compound asset and forces every child to stay decorative. */
export function placeDecorativeAsset(stage: Stage, asset: DecorativeAsset): readonly string[] {
  stage.setGroupTransform(asset.id, {
    position: asset.position,
    rotationY: asset.rotationY ?? 0,
  })
  return asset.parts.map(({ key, offset, ...part }) => {
    const id = `${asset.id}:${key}`
    stage.set(id, {
      ...part,
      position: offset,
      group: asset.id,
      decorative: true,
    })
    return id
  })
}

/** Shared line meshes used by the facilities-detail recipes below. */
export function defineFacilityAssetGeometry(stage: Stage): void {
  stage.defineGeometry("asset:ring-xz", ringLines("xz", true))
  stage.defineGeometry("asset:ring-yz", ringLines("yz"))
  stage.defineGeometry("asset:grille", grilleLines())
  stage.defineGeometry("asset:cabinet-front", cabinetFrontLines())
  stage.defineGeometry("asset:blockwork", blockworkLines())
}

export function aFrameSignParts(color = 0xe4ae32): readonly AssetPart[] {
  return [
    {
      key: "panel-front",
      geometry: "box",
      offset: [0, 0.39, -0.1],
      size: [0.46, 0.66, 0.035],
      direction: [0, 0.94, 0.34],
      color,
    },
    {
      key: "panel-back",
      geometry: "box",
      offset: [0, 0.39, 0.1],
      size: [0.46, 0.66, 0.035],
      direction: [0, 0.94, -0.34],
      color,
    },
    {
      key: "hinge",
      geometry: "cylinder",
      offset: [0, 0.72, 0],
      size: [0.045, 0.5, 0.045],
      direction: [1, 0, 0],
      color: 0x5d5540,
      metal: true,
    },
    {
      key: "foot-front",
      geometry: "box",
      offset: [0, 0.035, -0.22],
      size: [0.54, 0.07, 0.09],
      color: 0x6f5721,
    },
    {
      key: "foot-back",
      geometry: "box",
      offset: [0, 0.035, 0.22],
      size: [0.54, 0.07, 0.09],
      color: 0x6f5721,
    },
  ]
}

export function ladderTrayParts({
  length,
  width,
  rungSpacing = 0.42,
}: {
  length: number
  width: number
  rungSpacing?: number
}): readonly AssetPart[] {
  const metal = 0x687077
  const parts: AssetPart[] = [
    {
      key: "rail-left",
      geometry: "box",
      offset: [0, 0, -width / 2],
      size: [length, 0.1, 0.07],
      color: metal,
      metal: true,
    },
    {
      key: "rail-right",
      geometry: "box",
      offset: [0, 0, width / 2],
      size: [length, 0.1, 0.07],
      color: metal,
      metal: true,
    },
  ]

  let rung = 0
  for (let x = -length / 2 + rungSpacing / 2; x < length / 2; x += rungSpacing) {
    parts.push({
      key: `rung-${rung++}`,
      geometry: "box",
      offset: [x, -0.01, 0],
      size: [0.055, 0.055, width],
      color: 0x778087,
      metal: true,
    })
  }

  for (const x of [-length * 0.34, length * 0.34]) {
    for (const z of [-width / 2, width / 2]) {
      parts.push({
        key: `hanger-${x < 0 ? "west" : "east"}-${z < 0 ? "north" : "south"}`,
        geometry: "cylinder",
        offset: [x, 0.34, z],
        size: [0.025, 0.68, 0.025],
        color: 0x858d93,
        metal: true,
      })
    }
  }
  return parts
}

/** Line-only trim keeps the semantic FCU body fully pickable. */
export function fcuTrimParts(size: Vec3): readonly AssetPart[] {
  const [width, height, depth] = size
  return [
    {
      key: "cabinet-seams",
      geometry: "boxEdges",
      offset: [0, 0, 0],
      size: [width + 0.025, height + 0.025, depth + 0.025],
      color: 0x2e3438,
      lines: true,
    },
    {
      key: "return-grille",
      geometry: "asset:grille",
      offset: [0, -height * 0.02, depth / 2 + 0.018],
      size: [width * 0.72, height * 0.52, 1],
      color: 0x23282b,
      lines: true,
    },
    {
      key: "drain",
      geometry: "cylinder",
      offset: [width * 0.32, -height * 0.72, depth * 0.18],
      size: [0.055, height * 0.55, 0.055],
      color: 0x5f686d,
      metal: true,
    },
  ]
}

/** Modular AHU detailing, kept mostly line-only over the semantic cabinet. */
export function ahuTrimParts(size: Vec3): readonly AssetPart[] {
  const [width, height, depth] = size
  const parts: AssetPart[] = [
    {
      key: "cabinet-seams",
      geometry: "boxEdges",
      offset: [0, 0, 0],
      size: [width + 0.025, height + 0.025, depth + 0.025],
      color: 0x33393d,
      lines: true,
    },
    {
      key: "service-front",
      geometry: "asset:cabinet-front",
      offset: [0, -height * 0.02, depth / 2 + 0.018],
      size: [width * 0.92, height * 0.78, 1],
      color: 0x30363a,
      lines: true,
    },
    {
      key: "filter-grille",
      geometry: "asset:grille",
      offset: [-width * 0.34, -height * 0.08, depth / 2 + 0.026],
      size: [width * 0.2, height * 0.42, 1],
      color: 0x24292c,
      lines: true,
    },
    {
      key: "housekeeping-pad",
      geometry: "box",
      offset: [0, -height / 2 - 0.08, 0],
      size: [width + 0.32, 0.16, depth + 0.32],
      color: 0x62686b,
    },
    {
      key: "pad-edge",
      geometry: "box",
      offset: [0, -height / 2 - 0.065, depth / 2 + 0.17],
      size: [width + 0.34, 0.08, 0.045],
      color: 0xd2a22f,
      unlit: true,
    },
    {
      key: "condensate-drain",
      geometry: "cylinder",
      offset: [width * 0.43, -height * 0.56, depth * 0.22],
      size: [0.07, height * 0.3, 0.07],
      color: 0x566065,
      metal: true,
    },
  ]

  for (const side of [-1, 1]) {
    for (const z of [-1, 1]) {
      parts.push({
        key: `isolator-${side < 0 ? "west" : "east"}-${z < 0 ? "north" : "south"}`,
        geometry: "cylinder",
        offset: [side * width * 0.43, -height / 2 - 0.01, z * depth * 0.42],
        size: [0.11, 0.16, 0.11],
        color: 0x252a2d,
        metal: true,
      })
    }
  }
  return parts
}

/** A compact, recognisable server cabinet used for non-answerable fit-out. */
export function serverRackParts(size: Vec3): readonly AssetPart[] {
  const [width, height, depth] = size
  const dark = 0x202529
  const rail = 0x3d4449
  return [
    {
      key: "body",
      geometry: "box",
      offset: [0, 0, 0],
      size: [width * 0.88, height * 0.94, depth * 0.92],
      color: dark,
      metal: true,
    },
    {
      key: "frame",
      geometry: "boxEdges",
      offset: [0, 0, 0],
      size: [width, height, depth],
      color: 0x697176,
      lines: true,
    },
    {
      key: "front-rails",
      geometry: "asset:grille",
      offset: [0, 0, depth / 2 + 0.012],
      size: [width * 0.76, height * 0.9, 1],
      color: rail,
      lines: true,
    },
    {
      key: "rear-rails",
      geometry: "asset:grille",
      offset: [0, 0, -depth / 2 - 0.012],
      size: [width * 0.76, height * 0.9, 1],
      color: rail,
      lines: true,
    },
    {
      key: "handle",
      geometry: "box",
      offset: [width * 0.31, 0, depth / 2 + 0.028],
      size: [0.035, 0.24, 0.035],
      color: 0x858d92,
      metal: true,
    },
  ]
}

/** Sectional switchgear cabinet for non-answerable room fit-out. */
export function switchboardParts(size: Vec3): readonly AssetPart[] {
  const [width, height, depth] = size
  return [
    {
      key: "body",
      geometry: "box",
      offset: [0, 0, 0],
      size,
      color: 0x6f767a,
      metal: true,
    },
    {
      key: "edges",
      geometry: "boxEdges",
      offset: [0, 0, 0],
      size: [width + 0.02, height + 0.02, depth + 0.02],
      color: 0x31373a,
      lines: true,
    },
    {
      key: "front",
      geometry: "asset:cabinet-front",
      offset: [0, 0, depth / 2 + 0.018],
      size: [width * 0.9, height * 0.9, 1],
      color: 0x3e4549,
      lines: true,
    },
    {
      key: "handle",
      geometry: "box",
      offset: [width * 0.3, 0, depth / 2 + 0.035],
      size: [0.04, 0.22, 0.04],
      color: 0x252a2d,
      metal: true,
    },
  ]
}

/**
 * The one thing the valve geometry cannot carry: its identity.
 *
 * Stem, bonnet, flanges and handwheel now live in the valve mesh itself, so all
 * that is left here is the stamped tag every real isolation valve wears — which
 * is what the learner is being taught to read, rather than to guess a valve by
 * its position on the bracket.
 */
export function valveTrimParts(size: Vec3, color: number): readonly AssetPart[] {
  const across = Math.max(size[0], size[2])
  return [
    // Hung off the side of the body, clear of the flanges on the pipe axis.
    {
      key: "tag",
      geometry: "box",
      offset: [0, size[1] * 0.1, across * 0.36],
      size: [across * 0.26, across * 0.17, 0.012],
      color: 0xc3cace,
      metal: true,
    },
    // A collar in the service colour around the bonnet: the same identification
    // language as the pipe bands, at the point of use. Sized to sit proud of
    // the bonnet and inside the handwheel, so it reads as a band on the valve
    // rather than as another disc competing with the wheel.
    {
      key: "id-collar",
      geometry: "cylinder",
      offset: [0, size[1] * 0.28, 0],
      size: [across * 0.42, size[1] * 0.06, across * 0.42],
      color,
    },
  ]
}

/**
 * An end-suction pump set the way a plant room actually holds one: a concrete
 * inertia base, the volute with its suction/discharge flanges, and a motor
 * lying along the shaft. `size` is the catalogue element's bounding box; the
 * semantic body stays pickable inside these decorations.
 */
export function pumpTrimParts(size: Vec3): readonly AssetPart[] {
  const [w, h, d] = size
  const baseH = 0.15
  return [
    // Concrete inertia base, 150 mm larger each side (Kinetics-style).
    {
      key: "inertia-base",
      geometry: "box",
      offset: [0, -h / 2 + baseH / 2, 0],
      size: [w + 0.3, baseH, d + 0.3],
      color: 0xb8b8b8,
    },
    // Motor: a horizontal cylinder along the pump axis.
    {
      key: "motor",
      geometry: "cylinder",
      offset: [w * 0.18, -h / 2 + baseH + 0.32, 0],
      size: [0.34, w * 0.55, 0.34],
      direction: [1, 0, 0],
      color: 0x3a5a40,
      metal: true,
    },
    // Volute casing at the drive end.
    {
      key: "volute",
      geometry: "sphere",
      offset: [-w * 0.28, -h / 2 + baseH + 0.3, 0],
      size: [0.5, 0.52, 0.44],
      color: 0x2f4f38,
      metal: true,
    },
    // Discharge riser out of the volute.
    {
      key: "discharge",
      geometry: "cylinder",
      offset: [-w * 0.28, -h / 2 + baseH + 0.72, 0],
      size: [0.16, 0.7, 0.16],
      color: 0xc0c4c7,
      metal: true,
    },
  ]
}

/**
 * A pressure vessel: red expansion vessels and silver buffer vessels are the
 * two objects everyone recognises in a plant room photograph.
 */
export function vesselParts({
  diameter,
  height,
  color,
}: {
  diameter: number
  height: number
  color: number
}): readonly AssetPart[] {
  const parts: AssetPart[] = [
    {
      key: "shell",
      geometry: "cylinder",
      offset: [0, height / 2 + 0.18, 0],
      size: [diameter, height, diameter],
      color,
      metal: true,
    },
    {
      key: "dome",
      geometry: "sphere",
      offset: [0, height + 0.18, 0],
      size: [diameter, diameter * 0.55, diameter],
      color,
      metal: true,
    },
  ]
  for (const [key, dx, dz] of [
    ["leg-a", -0.3, -0.3],
    ["leg-b", 0.3, -0.3],
    ["leg-c", 0, 0.36],
  ] as const) {
    parts.push({
      key,
      geometry: "box",
      offset: [dx * diameter, 0.09, dz * diameter],
      size: [0.06, 0.18, 0.06],
      color: 0x44494d,
      metal: true,
    })
  }
  return parts
}

/**
 * BS EN 3 extinguisher identity: the body is safety red; the agent is named by
 * a colour band across the shoulder (CO2 black, foam cream, powder blue,
 * water plain red), and CO2 carries its swan-neck horn. A wall bracket plate
 * ties it to the wall the way BS 5306-8 hangs it.
 */
export function extinguisherTrimParts(
  size: Vec3,
  type: string | undefined,
  wall: 1 | -1,
): readonly AssetPart[] {
  const band: Record<string, number> = {
    co2: 0x101010,
    foam: 0xf1e4c0,
    powder: 0x1e6aa8,
    "wet chemical": 0xf4c400,
  }
  const bandColor = band[(type ?? "").toLowerCase()]
  const [sx, sy, sz] = size
  const parts: AssetPart[] = [
    // Bracket plate against the wall behind the cylinder.
    {
      key: "bracket",
      geometry: "box",
      offset: [0, sy * 0.18, wall * (sz * 0.62)],
      size: [0.1, 0.34, 0.03],
      color: 0x53595e,
      metal: true,
    },
    // Black handle/valve assembly on top.
    {
      key: "valve",
      geometry: "box",
      offset: [0.05, sy * 0.62, 0],
      size: [0.2, 0.07, 0.05],
      color: 0x17191b,
    },
  ]
  if (bandColor !== undefined) {
    parts.push({
      key: "agent-band",
      geometry: "cylinder",
      offset: [0, sy * 0.3, 0],
      size: [sx * 0.66, sy * 0.22, sz * 0.66],
      color: bandColor,
      unlit: true,
    })
  }
  if ((type ?? "").toLowerCase() === "co2") {
    parts.push({
      key: "horn",
      geometry: "cylinder",
      offset: [-sx * 0.5, sy * 0.34, 0],
      size: [0.1, sy * 0.42, 0.16],
      direction: [-0.35, 1, 0],
      color: 0x0d0f10,
    })
  }
  return parts
}

/** A manual call point: the red 87 mm box at 1.4 m beside every exit door. */
export function callPointParts(wall: 1 | -1): readonly AssetPart[] {
  return [
    {
      key: "box",
      geometry: "box",
      offset: [0, 0, wall * 0.05],
      size: [0.09, 0.09, 0.06],
      color: 0xc8102e,
      unlit: true,
    },
    {
      key: "element",
      geometry: "box",
      offset: [0, -0.005, wall * 0.085],
      size: [0.05, 0.04, 0.012],
      color: 0xe8ecee,
      unlit: true,
    },
  ]
}

/** Exact code-native room numbers; generated imagery is never trusted for text. */
export function roomPlaqueParts(label: string): readonly AssetPart[] {
  const parts: AssetPart[] = [
    {
      key: "plate",
      geometry: "box",
      offset: [0, 0, 0],
      size: [0.48, 0.24, 0.035],
      color: 0x24282b,
      metal: true,
    },
    {
      key: "border",
      geometry: "boxEdges",
      offset: [0, 0, 0.02],
      size: [0.45, 0.21, 0.01],
      color: 0x777f84,
      lines: true,
    },
  ]

  const digits = label.slice(0, 3).split("")
  const totalWidth = digits.length * 0.105
  digits.forEach((digit, index) => {
    const x = index * 0.105 - totalWidth / 2 + 0.0525
    for (const segment of digitSegments(digit)) {
      const horizontal = segment === "a" || segment === "g" || segment === "d"
      const [dx, dy] = segmentOffset(segment)
      parts.push({
        key: `digit-${index}-${segment}`,
        geometry: "box",
        offset: [x + dx, dy, 0.027],
        size: horizontal ? [0.064, 0.012, 0.012] : [0.012, 0.052, 0.012],
        color: 0xe8ecee,
        unlit: true,
      })
    }
  })
  return parts
}

function ringLines(plane: "xz" | "yz", spokes = false, segments = 28): GeometryBuffers {
  const positions: number[] = []
  const point = (angle: number): Vec3 => {
    const a = Math.cos(angle) * 0.5
    const b = Math.sin(angle) * 0.5
    return plane === "xz" ? [a, 0, b] : [0, a, b]
  }
  for (let i = 0; i < segments; i++) {
    positions.push(...point((i / segments) * Math.PI * 2))
    positions.push(...point(((i + 1) / segments) * Math.PI * 2))
  }
  if (spokes) {
    for (let i = 0; i < 4; i++) {
      positions.push(0, 0, 0, ...point((i / 4) * Math.PI * 2))
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(0),
    indices: new Uint16Array(0),
  }
}

function grilleLines(): GeometryBuffers {
  const positions: number[] = []
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    positions.push(x1, y1, 0, x2, y2, 0)
  line(-0.5, -0.5, 0.5, -0.5)
  line(0.5, -0.5, 0.5, 0.5)
  line(0.5, 0.5, -0.5, 0.5)
  line(-0.5, 0.5, -0.5, -0.5)
  for (let y = -0.36; y <= 0.36; y += 0.12) line(-0.46, y, 0.46, y)
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(0),
    indices: new Uint16Array(0),
  }
}

function cabinetFrontLines(): GeometryBuffers {
  const positions: number[] = []
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    positions.push(x1, y1, 0, x2, y2, 0)
  line(-0.5, -0.5, 0.5, -0.5)
  line(0.5, -0.5, 0.5, 0.5)
  line(0.5, 0.5, -0.5, 0.5)
  line(-0.5, 0.5, -0.5, -0.5)
  for (const x of [-0.25, 0, 0.25]) line(x, -0.5, x, 0.5)
  for (const x of [-0.365, -0.115, 0.135, 0.385]) line(x, -0.08, x + 0.025, -0.08)
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(0),
    indices: new Uint16Array(0),
  }
}

function blockworkLines(): GeometryBuffers {
  const positions: number[] = []
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    positions.push(x1, y1, 0, x2, y2, 0)
  const rows = 12
  for (let row = 0; row <= rows; row++) {
    const y = -0.5 + row / rows
    line(-0.5, y, 0.5, y)
    if (row === rows) continue
    const offset = row % 2 ? 0.05 : 0
    for (let x = -0.45 + offset; x < 0.5; x += 0.1) {
      line(x, y, x, y + 1 / rows)
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(0),
    indices: new Uint16Array(0),
  }
}

const DIGITS: Record<string, readonly string[]> = {
  "0": ["a", "b", "c", "d", "e", "f"],
  "1": ["b", "c"],
  "2": ["a", "b", "g", "e", "d"],
  "3": ["a", "b", "g", "c", "d"],
  "4": ["f", "g", "b", "c"],
  "5": ["a", "f", "g", "c", "d"],
  "6": ["a", "f", "g", "e", "c", "d"],
  "7": ["a", "b", "c"],
  "8": ["a", "b", "c", "d", "e", "f", "g"],
  "9": ["a", "b", "c", "d", "f", "g"],
}

function digitSegments(digit: string): readonly string[] {
  return DIGITS[digit] ?? []
}

function segmentOffset(segment: string): readonly [number, number] {
  switch (segment) {
    case "a": return [0, 0.067]
    case "b": return [0.037, 0.035]
    case "c": return [0.037, -0.035]
    case "d": return [0, -0.067]
    case "e": return [-0.037, -0.035]
    case "f": return [-0.037, 0.035]
    default: return [0, 0]
  }
}
