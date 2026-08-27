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
 * A stem, handwheel and flange outlines around a still-single semantic valve
 * body. All prominent trim is line geometry so it cannot steal the hit ray.
 */
export function valveTrimParts(size: Vec3, color: number): readonly AssetPart[] {
  const wheel = Math.max(size[0], size[2]) * 1.45
  return [
    {
      key: "stem",
      geometry: "cylinder",
      offset: [0, size[1] * 0.62, 0],
      size: [0.075, size[1] * 0.55, 0.075],
      color: 0x33383c,
      metal: true,
    },
    {
      key: "handwheel",
      geometry: "asset:ring-xz",
      offset: [0, size[1] * 1.02, 0],
      size: [wheel, 1, wheel],
      color: 0x25292c,
      lines: true,
    },
    {
      key: "flange-west",
      geometry: "asset:ring-yz",
      offset: [-size[0] * 0.64, 0, 0],
      size: [1, size[1] * 1.08, size[2] * 1.08],
      color,
      lines: true,
    },
    {
      key: "flange-east",
      geometry: "asset:ring-yz",
      offset: [size[0] * 0.64, 0, 0],
      size: [1, size[1] * 1.08, size[2] * 1.08],
      color,
      lines: true,
    },
    {
      key: "tag",
      geometry: "boxEdges",
      offset: [wheel * 0.52, size[1] * 0.95, 0],
      size: [wheel * 0.34, wheel * 0.22, 0.025],
      color: 0xd8dde0,
      lines: true,
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
