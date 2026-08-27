import type { Shape, Vec3 } from "./spec"

export interface GeometryBuffers {
  positions: Float32Array
  normals: Float32Array
  indices: Uint16Array
}

/**
 * Axis-aligned box with baked world position (no per-instance transform
 * needed): 24 vertices (4 per face) so normals stay flat.
 */
export function boxBuffers(center: Vec3, size: Vec3): GeometryBuffers {
  const [cx, cy, cz] = center
  const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2]

  // Each face: normal + 4 corners (CCW when viewed from outside).
  const faces: { n: Vec3; corners: Vec3[] }[] = [
    { n: [1, 0, 0], corners: [[hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [hx, -hy, hz]] },
    { n: [-1, 0, 0], corners: [[-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-hx, -hy, -hz]] },
    { n: [0, 1, 0], corners: [[-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz]] },
    { n: [0, -1, 0], corners: [[-hx, -hy, hz], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz]] },
    { n: [0, 0, 1], corners: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
    { n: [0, 0, -1], corners: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
  ]

  const positions = new Float32Array(24 * 3)
  const normals = new Float32Array(24 * 3)
  const indices = new Uint16Array(36)

  faces.forEach((face, f) => {
    face.corners.forEach((corner, v) => {
      const i = (f * 4 + v) * 3
      positions[i] = cx + corner[0]
      positions[i + 1] = cy + corner[1]
      positions[i + 2] = cz + corner[2]
      normals[i] = face.n[0]
      normals[i + 1] = face.n[1]
      normals[i + 2] = face.n[2]
    })
    const base = f * 4
    indices.set([base, base + 1, base + 2, base, base + 2, base + 3], f * 6)
  })

  return { positions, normals, indices }
}

/**
 * Upright cylinder (y axis) with baked world position: side quads with
 * per-vertex radial normals, plus flat-shaded top/bottom caps.
 */
export function cylinderBuffers(
  center: Vec3,
  radius: number,
  height: number,
  segments = 24,
): GeometryBuffers {
  const [cx, cy, cz] = center
  const hy = height / 2
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []

  // Side ring: 2 vertices per segment step (bottom, top), seam duplicated.
  for (let s = 0; s <= segments; s++) {
    const a = (s / segments) * Math.PI * 2
    const nx = Math.cos(a)
    const nz = Math.sin(a)
    positions.push(cx + nx * radius, cy - hy, cz + nz * radius)
    positions.push(cx + nx * radius, cy + hy, cz + nz * radius)
    normals.push(nx, 0, nz, nx, 0, nz)
  }
  for (let s = 0; s < segments; s++) {
    const b = s * 2
    indices.push(b, b + 1, b + 2, b + 2, b + 1, b + 3)
  }

  // Caps: center + rim fan, flat normals.
  for (const dir of [1, -1] as const) {
    const centerIdx = positions.length / 3
    positions.push(cx, cy + dir * hy, cz)
    normals.push(0, dir, 0)
    for (let s = 0; s <= segments; s++) {
      const a = (s / segments) * Math.PI * 2
      positions.push(cx + Math.cos(a) * radius, cy + dir * hy, cz + Math.sin(a) * radius)
      normals.push(0, dir, 0)
    }
    for (let s = 0; s < segments; s++) {
      const rim = centerIdx + 1 + s
      if (dir === 1) indices.push(centerIdx, rim + 1, rim)
      else indices.push(centerIdx, rim, rim + 1)
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint16Array(indices),
  }
}

/** Buffers for any spec shape. */
export function shapeBuffers(shape: Shape): GeometryBuffers {
  switch (shape.type) {
    case "box":
      return boxBuffers(shape.position, shape.size)
    case "cylinder":
      return cylinderBuffers(shape.position, shape.radius, shape.height, shape.segments)
  }
}
