import type { TrainingElement, TrainingRoom, Vec3 } from "@layer0/viewer-training"

// Northgate Data & Logistics — the building the lessons are set in.
//
// Two storeys on a 48 × 32 m footprint, a corridor spine on each level, and a
// riser cupboard off it. Built as runtime geometry because the page runs without
// credentials; the shape of the data is the shape a translated design gives you
// — an id, a name, a room, a level, a bounding box, a property set, and, for
// anything on a system, the element that feeds it.
//
// `feedsFrom` is the part that does the teaching. It is the only reason the app
// can tell a valve upstream of a leak from one downstream of it, and therefore
// the only reason a wrong answer can be marked "close" instead of "no".

export const STOREY = 4
export const LEVELS = 2
export const EYE = 1.7
/** Clear height inside a room; the ceiling void sits above it. */
export const CLEAR = 3.2
export const FOOTPRINT = { x: 48, z: 32 }

export const ROOMS: TrainingRoom[] = [
  // level 0
  { id: "PLANT-L0", name: "Plant room", level: 0, bounds: [1, 1, 13, 13] },
  { id: "STORE-101", name: "Store 101", level: 0, bounds: [15, 1, 25, 13] },
  { id: "WORKSHOP-102", name: "Workshop 102", level: 0, bounds: [27, 1, 37, 13] },
  { id: "DOCK", name: "Loading dock", level: 0, bounds: [39, 1, 47, 13] },
  { id: "CORR-L0", name: "Ground corridor", level: 0, bounds: [1, 14, 47, 18] },
  { id: "RISER-L0", name: "Riser cupboard GF", level: 0, bounds: [19, 18.2, 22, 20.8] },
  { id: "ELEC-L0", name: "Electrical switchroom", level: 0, bounds: [1, 21, 13, 31] },
  { id: "OFFICE-103", name: "Office 103", level: 0, bounds: [15, 21, 25, 31] },
  { id: "OFFICE-104", name: "Office 104", level: 0, bounds: [27, 21, 37, 31] },
  { id: "CORE-L0", name: "Stair core", level: 0, bounds: [39, 21, 47, 31] },
  // level 1
  { id: "AHU-L1", name: "AHU plant room", level: 1, bounds: [1, 1, 13, 13] },
  { id: "ROOM-214", name: "Room 214", level: 1, bounds: [15, 1, 25, 13] },
  { id: "ROOM-215", name: "Room 215", level: 1, bounds: [27, 1, 37, 13] },
  { id: "ROOM-218", name: "Meeting 218", level: 1, bounds: [39, 1, 47, 13] },
  { id: "CORR-L1", name: "First floor corridor", level: 1, bounds: [1, 14, 47, 18] },
  { id: "RISER-L1", name: "Riser cupboard 1F", level: 1, bounds: [19, 18.2, 22, 20.8] },
  { id: "ROOM-216", name: "Room 216", level: 1, bounds: [1, 21, 13, 31] },
  { id: "ROOM-217", name: "Server room 217", level: 1, bounds: [15, 21, 25, 31] },
  { id: "ROOM-219", name: "Room 219", level: 1, bounds: [27, 21, 37, 31] },
  { id: "CORE-L1", name: "Stair core", level: 1, bounds: [39, 21, 47, 31] },
]

export function roomCentre(id: string): Vec3 {
  const room = ROOMS.find((r) => r.id === id)
  if (!room) return [24, 0, 16]
  const [minX, minZ, maxX, maxZ] = room.bounds
  return [(minX + maxX) / 2, room.level * STOREY, (minZ + maxZ) / 2]
}

// --- fabric ----------------------------------------------------------------

export interface Slab {
  id: string
  position: Vec3
  size: Vec3
}

/** One wall run, already split around its door openings. */
export interface WallPiece {
  id: string
  position: Vec3
  size: Vec3
}

interface WallSpec {
  /** Run from (x1, z1) to (x2, z2). One of the two axes must be constant. */
  x1: number
  z1: number
  x2: number
  z2: number
  level: number
  /** Door openings along the run, as distances from the start. */
  doors?: { at: number; width?: number }[]
  thickness?: number
  height?: number
}

const WALLS: WallSpec[] = [
  // --- envelope, both levels ---
  ...[0, 1].flatMap((level): WallSpec[] => [
    // west, with the final exit on the ground floor
    { x1: 0, z1: 0, x2: 0, z2: 32, level, doors: level === 0 ? [{ at: 16, width: 2.4 }] : [] },
    // east, with the dock roller door on the ground floor
    { x1: 48, z1: 0, x2: 48, z2: 32, level, doors: level === 0 ? [{ at: 7, width: 4 }] : [] },
    { x1: 0, z1: 0, x2: 48, z2: 0, level },
    { x1: 0, z1: 32, x2: 48, z2: 32, level },
  ]),

  // --- corridor partitions, north side (doors into each north room) ---
  ...[0, 1].flatMap((level): WallSpec[] => [
    {
      x1: 0,
      z1: 13.8,
      x2: 48,
      z2: 13.8,
      level,
      doors: [{ at: 7 }, { at: 20 }, { at: 32 }, { at: 43, width: 3 }],
    },
    // south side: doors into the south rooms, plus the riser cupboard
    {
      x1: 0,
      z1: 18.2,
      x2: 48,
      z2: 18.2,
      level,
      doors: [{ at: 7 }, { at: 20.5, width: 1.1 }, { at: 31 }, { at: 43, width: 1.6 }],
    },
  ]),

  // --- cross partitions, north band ---
  ...[0, 1].flatMap((level): WallSpec[] =>
    [14, 26, 38].map((x) => ({ x1: x, z1: 0, x2: x, z2: 13.8, level })),
  ),
  // --- cross partitions, south band ---
  ...[0, 1].flatMap((level): WallSpec[] =>
    [14, 26, 38].map((x) => ({ x1: x, z1: 20.8, x2: x, z2: 32, level })),
  ),
  // --- the riser cupboard: a 3 m slot hanging off the corridor ---
  ...[0, 1].flatMap((level): WallSpec[] => [
    { x1: 19, z1: 18.2, x2: 19, z2: 21, level },
    { x1: 22, z1: 18.2, x2: 22, z2: 21, level },
    { x1: 19, z1: 21, x2: 22, z2: 21, level },
  ]),
  // --- the south band starts at z = 21, so close the strip either side ---
  ...[0, 1].flatMap((level): WallSpec[] => [
    { x1: 0, z1: 21, x2: 19, z2: 21, level, doors: [{ at: 7 }] },
    { x1: 22, z1: 21, x2: 48, z2: 21, level, doors: [{ at: 9 }, { at: 21 }] },
  ]),
]

const WALL_T = 0.25
const WALL_H = 3.4

/** Splits every wall run around its openings and returns the pieces. */
export function walls(): WallPiece[] {
  const out: WallPiece[] = []
  WALLS.forEach((spec, n) => {
    const horizontal = spec.z1 === spec.z2
    const start = horizontal ? spec.x1 : spec.z1
    const end = horizontal ? spec.x2 : spec.z2
    const fixed = horizontal ? spec.z1 : spec.x1
    const t = spec.thickness ?? WALL_T
    const h = spec.height ?? WALL_H
    const y = spec.level * STOREY + h / 2

    const cuts = (spec.doors ?? [])
      .map((d) => ({ from: d.at - (d.width ?? 1) / 2, to: d.at + (d.width ?? 1) / 2 }))
      .sort((a, b) => a.from - b.from)

    let cursor = start
    const pieces: [number, number][] = []
    for (const cut of cuts) {
      if (cut.from > cursor) pieces.push([cursor, Math.min(cut.from, end)])
      cursor = Math.max(cursor, cut.to)
    }
    if (cursor < end) pieces.push([cursor, end])

    pieces.forEach(([a, b], i) => {
      if (b - a < 0.05) return
      const mid = (a + b) / 2
      out.push({
        id: `wall-${n}-${i}`,
        position: horizontal ? [mid, y, fixed] : [fixed, y, mid],
        size: horizontal ? [b - a, h, t] : [t, h, b - a],
      })
    })
  })
  return out
}

/** A door opening in a wall run, with everything needed to fill it in. */
export interface Opening {
  id: string
  /** Centre of the opening, at the level's floor. */
  position: Vec3
  width: number
  height: number
  thickness: number
  /** True when the run is horizontal, so the opening spans x. */
  spansX: boolean
  /** On the escape route out of the building — gets a sign over it. */
  exit: boolean
}

const DOOR_H = 2.1

/**
 * The openings `walls()` leaves behind. Same traversal, same numbers — a door
 * leaf drawn from a second guess at where the hole is would not line up with
 * the hole.
 */
export function doors(): Opening[] {
  const out: Opening[] = []
  WALLS.forEach((spec, n) => {
    const horizontal = spec.z1 === spec.z2
    const fixed = horizontal ? spec.z1 : spec.x1
    const t = spec.thickness ?? WALL_T
    const y = spec.level * STOREY
    const envelope = spec.x1 === spec.x2 ? fixed === 0 || fixed === 48 : fixed === 0 || fixed === 32
    ;(spec.doors ?? []).forEach((door, k) => {
      const width = door.width ?? 1
      out.push({
        id: `door-${n}-${k}`,
        position: horizontal ? [door.at, y, fixed] : [fixed, y, door.at],
        width,
        height: width > 3 ? 3.2 : DOOR_H,
        thickness: t,
        spansX: horizontal,
        exit: envelope && spec.level === 0,
      })
    })
  })
  return out
}

/** Floor slabs, one per level, with a void over the stair core. */
export function slabs(): Slab[] {
  const out: Slab[] = []
  for (let level = 0; level < LEVELS; level++) {
    const y = level * STOREY
    // The core is open from ground to first, so the level-1 slab is split
    // around it rather than laid as one piece.
    if (level === 0) {
      out.push({ id: `slab-${level}`, position: [24, y - 0.15, 16], size: [50, 0.3, 34] })
    } else {
      out.push({ id: `slab-${level}-w`, position: [19, y - 0.15, 16], size: [40, 0.3, 34] })
      out.push({ id: `slab-${level}-n`, position: [43, y - 0.15, 7.5], size: [12, 0.3, 17] })
      out.push({ id: `slab-${level}-c`, position: [43, y - 0.15, 19], size: [12, 0.3, 6] })
    }
  }
  // Roof.
  out.push({ id: "roof", position: [24, LEVELS * STOREY - 0.15, 16], size: [50, 0.3, 34] })
  // Apron outside the west exit, so the assembly point stands on something.
  out.push({ id: "apron", position: [-6, -0.15, 16], size: [14, 0.3, 20] })
  return out
}

/**
 * The ramp up to level one, inside the stair core. A straight run rather than
 * a stair: the walk rig climbs a slope reliably on runtime geometry, and a flight of
 * treads is a lot of instances for something you cross twice.
 */
export const RAMP = {
  id: "ramp",
  position: [43, STOREY / 2, 26] as Vec3,
  size: [5, 0.3, 12.6] as Vec3,
  /** Aim the slab's up-axis so the surface climbs toward +z. */
  direction: [0, Math.cos(0.322), -Math.sin(0.322)] as Vec3,
}

// --- the service catalogue -------------------------------------------------

const L1 = STOREY
/** Height of a pipe run in a ceiling void on a given level. */
const voidY = (level: number) => level * STOREY + CLEAR + 0.2

export const ELEMENTS: TrainingElement[] = [
  // ---- chilled water: the system the leak is on ----
  {
    id: "CHW-CH-01", name: "Chiller CH-01", system: "chilled water", room: "PLANT-L0", level: 0,
    position: [4.5, 1.2, 5], size: [3.2, 2.4, 2],
    props: { tag: "CH-01", duty_kW: 420, status: "running" },
  },
  {
    id: "CHW-PMP-01", name: "Primary pump P-01", system: "chilled water", room: "PLANT-L0", level: 0,
    position: [9, 0.6, 5], size: [1, 1.2, 1], feedsFrom: "CHW-CH-01",
    props: { tag: "P-01", status: "running" },
  },
  {
    id: "CHW-VLV-MAIN", name: "Main isolation valve", system: "chilled water", room: "PLANT-L0", level: 0,
    position: [11, 1.5, 8], size: [0.45, 0.55, 0.45], feedsFrom: "CHW-PMP-01",
    props: { tag: "V-CHW-000", size: "DN150", normally: "open", isolates: "the whole building" },
  },
  {
    id: "CHW-HDR-L0", name: "Ground floor header", system: "chilled water", room: "CORR-L0", level: 0,
    position: [16, voidY(0), 16], size: [30, 0.3, 0.3], feedsFrom: "CHW-VLV-MAIN",
    props: { size: "DN100" },
  },
  {
    id: "CHW-RSR-01", name: "Chilled water riser", system: "chilled water", room: "RISER-L0", level: 0,
    position: [20.2, 4, 19.4], size: [0.34, 8, 0.34], feedsFrom: "CHW-HDR-L0",
    props: { size: "DN100", route: "GF to 1F, riser cupboard" },
  },
  {
    id: "CHW-VLV-L0", name: "GF branch isolation", system: "chilled water", room: "RISER-L0", level: 0,
    position: [21.1, 1.5, 19.4], size: [0.4, 0.5, 0.4], feedsFrom: "CHW-RSR-01",
    props: { tag: "V-CHW-G01", size: "DN80", serves: "ground floor only" },
  },
  {
    id: "CHW-VLV-L1", name: "1F branch isolation", system: "chilled water", room: "RISER-L1", level: 1,
    position: [21.1, L1 + 1.5, 19.4], size: [0.4, 0.5, 0.4], feedsFrom: "CHW-RSR-01",
    props: { tag: "V-CHW-101", size: "DN80", serves: "first floor only", normally: "open" },
  },
  {
    id: "CHW-BR-L1", name: "1F branch main", system: "chilled water", room: "CORR-L1", level: 1,
    position: [28, voidY(1), 16], size: [22, 0.26, 0.26], feedsFrom: "CHW-VLV-L1",
    props: { size: "DN80" },
  },
  {
    id: "CHW-DROP-214", name: "Supply drop to Room 214", system: "chilled water", room: "ROOM-214", level: 1,
    position: [20, L1 + 2.9, 6], size: [0.24, 1.4, 0.24], feedsFrom: "CHW-BR-L1",
    props: { defect: "split at the weld — reported 07:42", status: "leaking" },
  },
  {
    id: "CHW-VLV-214", name: "Room 214 terminal valve", system: "chilled water", room: "ROOM-214", level: 1,
    position: [20, L1 + 2.2, 5.2], size: [0.3, 0.36, 0.3], feedsFrom: "CHW-DROP-214",
    props: { tag: "V-CHW-214", size: "DN25", serves: "FCU-214 only" },
  },
  {
    id: "CHW-FCU-214", name: "Fan coil FCU-214", system: "chilled water", room: "ROOM-214", level: 1,
    position: [20, L1 + 2.9, 3.4], size: [1.6, 0.5, 0.7], feedsFrom: "CHW-VLV-214",
  },
  {
    id: "CHW-VLV-215", name: "Room 215 terminal valve", system: "chilled water", room: "ROOM-215", level: 1,
    position: [32, L1 + 2.2, 5.2], size: [0.3, 0.36, 0.3], feedsFrom: "CHW-BR-L1",
    props: { tag: "V-CHW-215", size: "DN25" },
  },
  {
    id: "CHW-VLV-217", name: "CRAC isolation valve", system: "chilled water", room: "ROOM-217", level: 1,
    position: [17.5, L1 + 1.4, 23], size: [0.32, 0.4, 0.32], feedsFrom: "CHW-BR-L1",
    props: { tag: "V-CHW-217", size: "DN50", serves: "CRAC-217" },
  },
  {
    id: "CHW-CRAC-217", name: "CRAC unit 217", system: "chilled water", room: "ROOM-217", level: 1,
    position: [17.5, L1 + 1.1, 25], size: [1.2, 2.2, 1], feedsFrom: "CHW-VLV-217",
  },

  // ---- heating: the decoy that sits right next to the answer ----
  {
    id: "HTG-BLR-01", name: "Boiler B-01", system: "heating", room: "PLANT-L0", level: 0,
    position: [4.5, 1, 10.5], size: [2.4, 2, 1.6],
  },
  {
    id: "HTG-RSR-01", name: "Heating riser", system: "heating", room: "RISER-L0", level: 0,
    position: [20.2, 4, 20.2], size: [0.3, 8, 0.3], feedsFrom: "HTG-BLR-01",
  },
  {
    id: "HTG-VLV-L1", name: "1F heating branch isolation", system: "heating", room: "RISER-L1", level: 1,
    position: [21.1, L1 + 2.1, 20.2], size: [0.38, 0.46, 0.38], feedsFrom: "HTG-RSR-01",
    props: { tag: "V-LTHW-101", size: "DN65", serves: "first floor radiators" },
  },

  // ---- fire ----
  {
    id: "FIRE-INLET-01", name: "Dry riser inlet", system: "fire", level: 0,
    position: [48.5, 0.9, 10], size: [0.7, 0.9, 0.5],
    props: { type: "2-way inlet", pressure: "dry" },
  },
  {
    id: "FIRE-RSR-01", name: "Dry riser", system: "fire", room: "CORE-L0", level: 0,
    position: [40.5, 4, 22.5], size: [0.32, 8, 0.32], feedsFrom: "FIRE-INLET-01",
  },
  {
    id: "FIRE-STPIPE-L0", name: "GF landing valve", system: "fire", room: "CORE-L0", level: 0,
    position: [41.3, 1.1, 22.5], size: [0.34, 0.4, 0.34], feedsFrom: "FIRE-RSR-01",
  },
  {
    id: "FIRE-STPIPE-L1", name: "1F landing valve", system: "fire", room: "CORE-L1", level: 1,
    position: [41.3, L1 + 1.1, 22.5], size: [0.34, 0.4, 0.34], feedsFrom: "FIRE-RSR-01",
  },
  {
    id: "FIRE-PANEL-01", name: "Fire alarm panel", system: "fire", room: "CORR-L0", level: 0,
    position: [2, 1.5, 14.4], size: [0.5, 0.7, 0.2],
  },
  {
    id: "FIRE-EXT-L0-01", name: "Extinguisher GF-01", system: "fire", room: "CORR-L0", level: 0,
    position: [10, 0.7, 14.3], size: [0.3, 0.7, 0.3],
    props: { type: "CO2", lastServiced: "2025-04" },
  },
  {
    id: "FIRE-EXT-L0-02", name: "Extinguisher GF-02", system: "fire", room: "CORR-L0", level: 0,
    position: [34, 0.7, 14.3], size: [0.3, 0.7, 0.3],
    props: { type: "water", lastServiced: "2025-04" },
  },
  {
    id: "FIRE-EXT-L1-01", name: "Extinguisher 1F-01", system: "fire", room: "CORR-L1", level: 1,
    position: [10, L1 + 0.7, 14.3], size: [0.3, 0.7, 0.3],
    props: { type: "CO2", lastServiced: "2025-04" },
  },
  {
    id: "FIRE-EXT-L1-02", name: "Extinguisher 1F-02", system: "fire", room: "CORR-L1", level: 1,
    position: [34, L1 + 0.7, 14.3], size: [0.3, 0.7, 0.3],
    props: { type: "water", lastServiced: "2019-11", status: "overdue" },
  },

  // ---- egress ----
  {
    id: "DOOR-EXIT-W", name: "West final exit", system: "egress", room: "CORR-L0", level: 0,
    position: [0.2, 1.05, 16], size: [0.3, 2.1, 2.4],
    props: { swing: "outward", capacity: 120 },
  },
  {
    id: "DOOR-DOCK-E", name: "Dock roller door", system: "egress", room: "DOCK", level: 0,
    position: [47.9, 1.6, 7], size: [0.3, 3.2, 4],
  },
  {
    id: "DOOR-CORE-L1", name: "1F stair core fire door", system: "egress", room: "CORE-L1", level: 1,
    position: [38, L1 + 1.05, 30], size: [0.3, 2.1, 1.6],
    props: { rating: "FD30S", closer: "fitted" },
  },
  {
    id: "OBSTRUCTION-01", name: "Pallet stack", system: "egress", room: "CORR-L1", level: 1,
    position: [37, L1 + 0.75, 16], size: [1.2, 1.5, 1.2],
    props: { note: "left in the escape route 11 days ago", blocks: "route to the stair core" },
  },
  {
    id: "MUSTER-01", name: "Assembly point", system: "egress", level: 0,
    position: [-7, 1.1, 16], size: [0.8, 2.2, 0.15],
  },

  // ---- electrical ----
  {
    id: "ELEC-DB-01", name: "Main distribution board", system: "electrical", room: "ELEC-L0", level: 0,
    position: [3, 1.1, 26], size: [0.6, 2.2, 2.4],
  },
  {
    id: "ELEC-ISO-217", name: "Server room isolator", system: "electrical", room: "ELEC-L0", level: 0,
    position: [3, 1.4, 29.5], size: [0.4, 0.6, 0.4], feedsFrom: "ELEC-DB-01",
    props: { serves: "Server room 217", locked: "off-position padlockable" },
  },
  {
    id: "ELEC-UPS-01", name: "UPS", system: "electrical", room: "ELEC-L0", level: 0,
    position: [10, 1, 26], size: [1.6, 2, 0.9], feedsFrom: "ELEC-DB-01",
  },

  // ---- air ----
  {
    id: "AHU-01", name: "AHU-01", system: "air", room: "AHU-L1", level: 1,
    position: [5, L1 + 1.4, 5], size: [4.5, 2.8, 2.4],
    props: { serves: "Server room 217", volume_m3s: 3.2 },
  },
  {
    id: "AHU-02", name: "AHU-02", system: "air", room: "AHU-L1", level: 1,
    position: [5, L1 + 1.4, 10], size: [4.5, 2.8, 2.4],
    props: { serves: "Rooms 214, 215, 218", volume_m3s: 2.1 },
  },
  {
    id: "DUCT-D12", name: "Supply duct D12", system: "air", room: "CORR-L1", level: 1,
    position: [24, voidY(1) - 0.05, 15.4], size: [34, 0.5, 0.6], feedsFrom: "AHU-01",
    props: { size: "600 × 500", note: "flagged in the coordination review" },
  },
  {
    id: "VAV-217", name: "VAV box 217", system: "air", room: "ROOM-217", level: 1,
    position: [21, voidY(1) - 0.1, 23], size: [1.1, 0.45, 0.6], feedsFrom: "DUCT-D12",
    props: { tag: "VAV-217", setpoint_C: 22 },
  },
  {
    id: "DIFF-217", name: "Supply diffuser 217", system: "air", room: "ROOM-217", level: 1,
    position: [21, L1 + CLEAR - 0.05, 26], size: [0.6, 0.1, 0.6], feedsFrom: "VAV-217",
  },
  {
    id: "ACCESS-PANEL-217", name: "Ceiling access panel", system: "air", room: "ROOM-217", level: 1,
    position: [21, L1 + CLEAR - 0.02, 23.9], size: [0.7, 0.06, 0.7],
    props: { gives_access_to: "VAV-217", size: "600 × 600" },
  },

  // ---- dock ----
  {
    id: "DOCK-LEVELLER-01", name: "Dock leveller", system: "logistics", room: "DOCK", level: 0,
    position: [45, 0.35, 7], size: [3, 0.4, 3.4],
  },
  {
    id: "DOCK-ESTOP-01", name: "Leveller emergency stop", system: "logistics", room: "DOCK", level: 0,
    position: [42.5, 1.2, 4.6], size: [0.3, 0.4, 0.3], feedsFrom: "DOCK-LEVELLER-01",
    props: { type: "mushroom head, latching" },
  },
]

export const ELEMENT_BY_ID = new Map(ELEMENTS.map((e) => [e.id, e]))

/**
 * Colour per system, so the model reads as disciplines rather than shapes.
 *
 * Hexes sit as close to the real identification standards as a screen allows:
 * BS 1710 auxiliary blue for chilled water, crimson 04-D-45 for LTHW, safety
 * red 04-E-53 for fire, exit green for egress. Mains pipework is drawn as
 * silver insulation and carries these as ID bands — reading the band is the
 * same skill the building teaches in real life.
 */
export const SYSTEM_COLOR: Record<string, number> = {
  "chilled water": 0x1e6aa8,
  heating: 0x9b2d30,
  fire: 0xc8102e,
  egress: 0x009639,
  electrical: 0xd8a63a,
  air: 0x7d6ec9,
  logistics: 0x808a97,
}

// --- fit-out ---------------------------------------------------------------

/**
 * Everything in the building that is furniture rather than plant.
 *
 * None of it is in the catalogue, so none of it can be selected as an answer —
 * it exists to give the rooms a use and the walker a sense of scale. It is
 * generated from the room bounds rather than hand-placed, and it is always kept
 * against the room's north wall, which is what leaves the middle of every room
 * clear for someone walking through it.
 */
export type FitKind = "desk" | "chair" | "rack" | "pallet" | "bench" | "table" | "panel"

export interface FitItem {
  id: string
  kind: FitKind
  position: Vec3
  size: Vec3
}

const FIT_OUT: Record<string, FitKind> = {
  "STORE-101": "pallet",
  "WORKSHOP-102": "bench",
  "ELEC-L0": "panel",
  "OFFICE-103": "desk",
  "OFFICE-104": "desk",
  "ROOM-214": "desk",
  "ROOM-215": "desk",
  "ROOM-216": "desk",
  "ROOM-219": "desk",
  "ROOM-217": "rack",
  "ROOM-218": "table",
  DOCK: "pallet",
}

export function fitout(): FitItem[] {
  const out: FitItem[] = []
  for (const room of ROOMS) {
    const kind = FIT_OUT[room.id]
    if (!kind) continue
    const [minX, minZ, maxX, maxZ] = room.bounds
    const y = room.level * STOREY
    const push = (n: number, k: FitKind, position: Vec3, size: Vec3) =>
      out.push({ id: `${room.id}:${k}:${n}`, kind: k, position, size })

    if (kind === "table") {
      const cx = (minX + maxX) / 2
      const cz = (minZ + maxZ) / 2
      push(0, "table", [cx, y + 0.37, cz], [3.4, 0.74, 1.4])
      for (const [n, [dx, dz]] of [
        [-1.1, -1.1],
        [0, -1.1],
        [1.1, -1.1],
        [-1.1, 1.1],
        [0, 1.1],
        [1.1, 1.1],
      ].entries()) {
        push(n, "chair", [cx + dx, y + 0.25, cz + dz], [0.5, 0.5, 0.5])
      }
      continue
    }

    // Everything else lines the north wall in a row, 1.4 m in.
    const depth = kind === "rack" ? 1.1 : kind === "panel" ? 0.5 : kind === "pallet" ? 1.2 : 0.8
    const width = kind === "rack" ? 0.6 : kind === "panel" ? 0.9 : kind === "pallet" ? 1.2 : 1.6
    const height = kind === "rack" ? 2 : kind === "panel" ? 2.2 : kind === "pallet" ? 1.1 : 0.74
    const pitch = width + (kind === "desk" ? 0.9 : 0.25)
    const z = minZ + 1.4
    let n = 0
    for (let x = minX + 1.6; x <= maxX - 1.6; x += pitch) {
      push(n, kind, [x, y + height / 2, z], [width, height, depth])
      if (kind === "desk") push(n, "chair", [x, y + 0.25, z + 1.1], [0.5, 0.5, 0.5])
      n++
    }
    // A second run for racks and pallets, which come in aisles.
    if (kind === "rack" || kind === "pallet") {
      const z2 = minZ + 1.4 + depth + 2.2
      let m = 100
      for (let x = minX + 1.6; x <= maxX - 1.6; x += pitch) {
        push(m++, kind, [x, y + height / 2, z2], [width, height, depth])
      }
    }
  }
  return out
}

// --- ceiling ---------------------------------------------------------------

/** Height of the suspended ceiling above each level's floor. */
export const CEILING = CLEAR

/**
 * The rooms that get a suspended ceiling, and the one tile that is missing.
 *
 * The exercise opens with housekeeping having pushed a tile up to look at the
 * leak, so the void over Room 214 is open — which is both the reason the
 * learner can see the pipework at all and the first thing the model tells them
 * about what happened here.
 */
export const OPEN_TILE = { room: "ROOM-214", x: 20, z: 5 }
