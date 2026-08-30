import type { GeometryBuffers } from "./geometry"

/**
 * Unit geometries, authored once at the origin and placed with per-instance
 * transforms.
 *
 * This is the opposite trade from `geometry.ts`, which bakes world position
 * into the vertex buffers. Baking is fine for content that is emitted once;
 * anything that *moves* after it is drawn needs its position in the transform,
 * so a rack can slide across the floor with `setTransformLocal` instead of
 * being torn down and rebuilt. It also means N instances share one
 * `BufferGeometry` upload.
 */

/** Axis-aligned cube, 1×1×1, centred on the origin. Flat normals per face. */
export function unitBox(): GeometryBuffers {
  const faces: { n: [number, number, number]; c: [number, number, number][] }[] = [
    { n: [1, 0, 0], c: [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]] },
    { n: [-1, 0, 0], c: [[-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5]] },
    { n: [0, 1, 0], c: [[-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]] },
    { n: [0, -1, 0], c: [[-0.5, -0.5, 0.5], [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5]] },
    { n: [0, 0, 1], c: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
    { n: [0, 0, -1], c: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] },
  ]
  const positions = new Float32Array(72)
  const normals = new Float32Array(72)
  const indices = new Uint16Array(36)
  faces.forEach((f, fi) => {
    f.c.forEach((corner, v) => {
      const i = (fi * 4 + v) * 3
      positions.set(corner, i)
      normals.set(f.n, i)
    })
    const b = fi * 4
    indices.set([b, b + 1, b + 2, b, b + 2, b + 3], fi * 6)
  })
  return { positions, normals, indices }
}

/** Cylinder about +Y, diameter 1, height 1, centred on the origin. */
export function unitCylinder(segments = 20): GeometryBuffers {
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  for (let s = 0; s <= segments; s++) {
    const a = (s / segments) * Math.PI * 2
    const nx = Math.cos(a)
    const nz = Math.sin(a)
    positions.push(nx * 0.5, -0.5, nz * 0.5, nx * 0.5, 0.5, nz * 0.5)
    normals.push(nx, 0, nz, nx, 0, nz)
  }
  for (let s = 0; s < segments; s++) {
    const b = s * 2
    indices.push(b, b + 1, b + 2, b + 2, b + 1, b + 3)
  }
  for (const dir of [1, -1] as const) {
    const centre = positions.length / 3
    positions.push(0, dir * 0.5, 0)
    normals.push(0, dir, 0)
    for (let s = 0; s <= segments; s++) {
      const a = (s / segments) * Math.PI * 2
      positions.push(Math.cos(a) * 0.5, dir * 0.5, Math.sin(a) * 0.5)
      normals.push(0, dir, 0)
    }
    for (let s = 0; s < segments; s++) {
      const rim = centre + 1 + s
      if (dir === 1) indices.push(centre, rim + 1, rim)
      else indices.push(centre, rim, rim + 1)
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  }
}

/** 1×1 quad in the XZ plane, normal +Y, centred on the origin. */
export function unitPlane(): GeometryBuffers {
  return {
    positions: new Float32Array([-0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, -0.5]),
    normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  }
}

/**
 * Arrow along +Y within a unit cube: a shaft plus a four-sided head. Used for
 * airflow, so it is cheap by design — one geometry, one instance per vector,
 * aimed with `direction` on the placement.
 */
export function unitArrow(): GeometryBuffers {
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  const quad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
    n: [number, number, number],
  ) => {
    const base = positions.length / 3
    for (const p of [a, b, c, d]) {
      positions.push(...p)
      normals.push(...n)
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  const r = 0.09
  const neck = 0.15
  // Shaft: four sides, from the tail to the neck.
  for (let s = 0; s < 4; s++) {
    const a0 = (s / 4) * Math.PI * 2
    const a1 = ((s + 1) / 4) * Math.PI * 2
    const [x0, z0] = [Math.cos(a0) * r, Math.sin(a0) * r]
    const [x1, z1] = [Math.cos(a1) * r, Math.sin(a1) * r]
    const nx = Math.cos((a0 + a1) / 2)
    const nz = Math.sin((a0 + a1) / 2)
    quad([x0, -0.5, z0], [x1, -0.5, z1], [x1, neck, z1], [x0, neck, z0], [nx, 0, nz])
  }
  // Head: four triangles meeting at the tip, plus the underside.
  const hr = 0.24
  for (let s = 0; s < 4; s++) {
    const a0 = (s / 4) * Math.PI * 2
    const a1 = ((s + 1) / 4) * Math.PI * 2
    const p0: [number, number, number] = [Math.cos(a0) * hr, neck, Math.sin(a0) * hr]
    const p1: [number, number, number] = [Math.cos(a1) * hr, neck, Math.sin(a1) * hr]
    const nx = Math.cos((a0 + a1) / 2) * 0.7
    const nz = Math.sin((a0 + a1) / 2) * 0.7
    quad(p0, p1, [0, 0.5, 0], [0, 0.5, 0], [nx, 0.5, nz])
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  }
}

/** Sphere of diameter 1 on the origin. Coarse by default — this is scenery. */
export function unitSphere(rings = 8, segments = 12): GeometryBuffers {
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * Math.PI
    for (let s = 0; s <= segments; s++) {
      const theta = (s / segments) * Math.PI * 2
      const x = Math.sin(phi) * Math.cos(theta)
      const y = Math.cos(phi)
      const z = Math.sin(phi) * Math.sin(theta)
      positions.push(x * 0.5, y * 0.5, z * 0.5)
      normals.push(x, y, z)
    }
  }
  const stride = segments + 1
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * stride + s
      const b = a + stride
      indices.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  }
}

/** The 12 edges of a unit cube as line-segment pairs (for `LineMaterial`). */
export function unitBoxEdges(): GeometryBuffers {
  const c: [number, number, number][] = [
    [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5],
    [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5],
  ]
  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ]
  const positions = new Float32Array(edges.length * 6)
  edges.forEach(([a, b], i) => {
    positions.set(c[a], i * 6)
    positions.set(c[b], i * 6 + 3)
  })
  // Line geometry carries neither normals nor indices: `LineMaterial` is unlit
  // and consumes the position buffer as consecutive segment pairs.
  return { positions, normals: new Float32Array(0), indices: new Uint16Array(0) }
}

/** Torus about +Y: ring radius `R`, tube radius `r`, both in unit-cube scale. */
export function torusBuffers(R: number, r: number, segments = 16, sides = 8): GeometryBuffers {
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  for (let s = 0; s <= segments; s++) {
    const a = (s / segments) * Math.PI * 2
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    for (let t = 0; t <= sides; t++) {
      const b = (t / sides) * Math.PI * 2
      const cb = Math.cos(b)
      const sb = Math.sin(b)
      positions.push(ca * (R + cb * r), sb * r, sa * (R + cb * r))
      normals.push(ca * cb, sb, sa * cb)
    }
  }
  const stride = sides + 1
  for (let s = 0; s < segments; s++) {
    for (let t = 0; t < sides; t++) {
      const a = s * stride + t
      const b = a + stride
      indices.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  }
}

/** Translate + scale a buffer set in place-composition (returns a copy). */
function placed(
  buffers: GeometryBuffers,
  scale: [number, number, number],
  translate: [number, number, number],
): GeometryBuffers {
  const positions = new Float32Array(buffers.positions.length)
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = buffers.positions[i] * scale[0] + translate[0]
    positions[i + 1] = buffers.positions[i + 1] * scale[1] + translate[1]
    positions[i + 2] = buffers.positions[i + 2] * scale[2] + translate[2]
  }
  // Normals survive axis-aligned scaling well enough for these low-poly parts.
  return { positions, normals: buffers.normals.slice(), indices: buffers.indices.slice() }
}

/** Concatenate buffer sets into one geometry, re-basing indices. */
function merged(parts: GeometryBuffers[]): GeometryBuffers {
  let vertexCount = 0
  let indexCount = 0
  for (const p of parts) {
    vertexCount += p.positions.length
    indexCount += p.indices.length
  }
  const positions = new Float32Array(vertexCount)
  const normals = new Float32Array(vertexCount)
  const indices = new Uint16Array(indexCount)
  let v = 0
  let i = 0
  for (const p of parts) {
    positions.set(p.positions, v)
    normals.set(p.normals, v)
    const base = v / 3
    for (let k = 0; k < p.indices.length; k++) indices[i + k] = p.indices[k] + base
    v += p.positions.length
    i += p.indices.length
  }
  return { positions, normals, indices }
}

/**
 * A flanged gate valve, the way one actually sits on a branch off a riser: the
 * pipe runs through a bolted body, a bonnet carries the stem up out of it, and
 * a handwheel sits on top.
 *
 * Everything is solid. The earlier version drew the flanges and the handwheel
 * as line rings, which read as CAD ghosting hovering around a blob rather than
 * as hardware — and it never needed to be lines, because decorative parts are
 * already excluded from picking.
 *
 * Fits the unit cube with the handwheel at the top; an element's `size`
 * stretches the whole assembly.
 */
export function unitValve(): GeometryBuffers {
  // The parts on the pipe axis are authored upright and tipped over together,
  // so their offsets read as "along the pipe" while being written as heights.
  const inline = tippedOntoX(
    merged([
      placed(unitCylinder(14), [0.26, 1, 0.26], [0, 0, 0]), // pipe through the body
      placed(unitCylinder(16), [0.46, 0.42, 0.46], [0, 0, 0]), // body
      placed(unitCylinder(16), [0.56, 0.06, 0.56], [0, 0.26, 0]), // flange
      placed(unitCylinder(16), [0.56, 0.06, 0.56], [0, -0.26, 0]), // flange
    ]),
  )

  return merged([
    inline,
    placed(unitCylinder(14), [0.3, 0.2, 0.3], [0, 0.26, 0]), // bonnet
    placed(unitCylinder(10), [0.15, 0.07, 0.15], [0, 0.38, 0]), // gland nut
    placed(unitCylinder(8), [0.055, 0.22, 0.055], [0, 0.36, 0]), // stem
    placed(torusBuffers(0.5, 0.07, 20, 8), [0.42, 0.42, 0.42], [0, 0.46, 0]), // handwheel
    placed(unitCylinder(8), [0.09, 0.05, 0.09], [0, 0.46, 0]), // wheel hub
  ])
}

/**
 * Lays an upright assembly on its side, along +X.
 *
 * A rotation, not an axis swap: swapping two axes mirrors the geometry, which
 * reverses every triangle's winding and leaves the faces culled from the side
 * you are looking at.
 */
function tippedOntoX(buffers: GeometryBuffers): GeometryBuffers {
  const positions = buffers.positions.slice()
  const normals = buffers.normals.slice()
  for (const values of [positions, normals]) {
    for (let i = 0; i < values.length; i += 3) {
      const x = values[i]
      values[i] = values[i + 1]
      values[i + 1] = -x
    }
  }
  return { positions, normals, indices: buffers.indices.slice() }
}

/**
 * A fire extinguisher silhouette: bottle, domed shoulder, neck and a squeeze
 * handle. Authored upright in the unit cube, base at y = −0.5.
 */
export function unitExtinguisher(): GeometryBuffers {
  return merged([
    placed(unitCylinder(14), [0.62, 0.72, 0.62], [0, -0.13, 0]), // bottle
    placed(unitSphere(8, 14), [0.62, 0.36, 0.62], [0, 0.23, 0]), // shoulder dome
    placed(unitCylinder(10), [0.16, 0.18, 0.16], [0, 0.4, 0]), // neck
    placed(unitBox(), [0.3, 0.07, 0.09], [0.08, 0.48, 0]), // carry/squeeze lever
    placed(unitBox(), [0.07, 0.16, 0.09], [-0.1, 0.44, 0]), // trigger grip
  ])
}

/**
 * Corner brackets of a unit cube: at each of the 8 corners, three short ticks
 * run inward along the edges — a viewfinder, not a cage. `tick` is the tick
 * length as a fraction of the edge.
 */
export function unitBoxCorners(tick = 0.28): GeometryBuffers {
  const positions: number[] = []
  for (const sx of [-0.5, 0.5]) {
    for (const sy of [-0.5, 0.5]) {
      for (const sz of [-0.5, 0.5]) {
        positions.push(sx, sy, sz, sx - Math.sign(sx) * tick, sy, sz)
        positions.push(sx, sy, sz, sx, sy - Math.sign(sy) * tick, sz)
        positions.push(sx, sy, sz, sx, sy, sz - Math.sign(sz) * tick)
      }
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(0),
    indices: new Uint16Array(0),
  }
}

/** A flat grid of line segments in the XZ plane, `divisions` cells per side. */
export function gridLines(size: number, divisions: number): GeometryBuffers {
  const positions: number[] = []
  const half = size / 2
  for (let i = 0; i <= divisions; i++) {
    const t = -half + (i / divisions) * size
    positions.push(t, 0, -half, t, 0, half, -half, 0, t, half, 0, t)
  }
  const arr = new Float32Array(positions)
  return { positions: arr, normals: new Float32Array(0), indices: new Uint16Array(0) }
}
