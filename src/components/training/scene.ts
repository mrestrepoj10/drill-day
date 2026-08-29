import {
  Stage,
  aFrameSignParts,
  ahuTrimParts,
  callPointParts,
  defineFacilityAssetGeometry,
  extinguisherTrimParts,
  fcuTrimParts,
  ladderTrayParts,
  placeDecorativeAsset,
  pumpTrimParts,
  roomPlaqueParts,
  serverRackParts,
  shade,
  switchboardParts,
  valveTrimParts,
  vesselParts,
  type StageItemInit,
  type Vec3,
} from "@layer0/scene-render"
import type { HighlightTone, TrainingElement, TrainingRenderer } from "@layer0/viewer-training"
import type { FitItem } from "@/lib/training/facility"
import {
  CEILING,
  ELEMENTS,
  ELEMENT_BY_ID,
  OPEN_TILE,
  RAMP,
  ROOMS,
  STOREY,
  SYSTEM_COLOR,
  doors,
  fitout,
  slabs,
  walls,
} from "@/lib/training/facility"

const FABRIC = 0x73787b
const SLAB = 0x686e72
const GHOST = 0xa7adb6
const TILE = 0xdfe2e6
const TBAR = 0x7e8589
const LUMINAIRE = 0xf7f9fb
const LEAF = 0x3d4347
const FRAME_ = 0x262b2e
const EXIT_SIGN = 0x009639
const HAZARD_YELLOW = 0xe4ae32
const WATER = 0x4d9ab5
/** Foil-faced pipe insulation — what a mains run actually looks like. */
const INSULATION = 0xbfc3c6
/** Galvanised sheet metal for ductwork and containment. */
const GALVANISED = 0xb9bdbf
const SAFETY_RED = 0xc8102e
const FURNITURE: Record<string, number> = {
  desk: 0xc0a67f,
  chair: 0x5a6674,
  rack: 0x2b3037,
  pallet: 0xbb9a6b,
  bench: 0x9aa2ab,
  table: 0xc0a67f,
  panel: 0x8d949c,
}
/** Tiles are drawn a hair transparent so a pick passes through to the void. */
const TILE_OPACITY = 0.96

const TONE_COLOR: Record<HighlightTone, number> = {
  ask: 0xf0b429,
  good: 0x35a06a,
  near: 0xe08a2e,
  bad: 0xd44236,
  trace: 0x3f8ecb,
}

/**
 * Draws the building, and answers the four questions the training extension
 * asks of a host: light these up, ghost everything but these, where is this,
 * and clear it. Keeping that interface this small is what lets the extension
 * stay ignorant of how the model was built.
 */
export class TrainingScene implements TrainingRenderer {
  private highlighted = new Map<string, HighlightTone>()
  private learningCues = new Set<string>()
  private selection: { id: string; tone: HighlightTone } | null = null
  private isolated: Set<string> | null = null
  private ceiling: string[] = []
  /** Element ids currently carrying a tone tint, for cleanup on change. */
  private tinted = new Set<string>()
  /** Cue-toned ids currently breathing, and the rAF driving them. */
  private shimmering = new Map<string, HighlightTone>()
  private shimmerFrame: number | null = null
  private ceilingSize = new Map<string, Vec3>()
  // Built in place, then lifted: the first view of the model is from outside.
  private ceilingDown = true
  private built = false

  constructor(private stage: Stage) {}

  build(): void {
    if (this.built) return
    const stage = this.stage
    defineFacilityAssetGeometry(stage)

    for (const slab of slabs()) {
      stage.set(`slab:${slab.id}`, {
        geometry: "box",
        position: slab.position,
        size: slab.size,
        color: SLAB,
        decorative: true,
      })
    }

    // The ramp is one tilted slab: `direction` aims the box's up-axis, so the
    // walking surface climbs without needing a flight of treads.
    stage.set("ramp", {
      geometry: "box",
      position: RAMP.position,
      size: RAMP.size,
      direction: RAMP.direction,
      color: shade(SLAB, 0.12),
      decorative: true,
    })

    for (const piece of walls()) {
      // Opaque: a wall that a hover ray passes through reads as a rendering
      // fault, and X-ray hover names equipment three rooms away.
      stage.set(`wall:${piece.id}`, {
        geometry: "box",
        position: piece.position,
        size: piece.size,
        color: FABRIC,
        decorative: true,
      })
    }

    this.buildDoors()
    this.buildFitout()
    this.buildCeiling()
    this.buildEnvironmentalDetails()
    this.setCeiling(false)

    for (const element of ELEMENTS) this.paint(element)
    this.buildTrainingAssetDetails()
    this.built = true
  }

  /**
   * Door leaves, drawn open and flat against the wall beside their opening.
   * A closed leaf would be a wall as far as the walker is concerned, and the
   * openings are the route through the building.
   */
  private buildDoors(): void {
    const stage = this.stage
    for (const door of doors()) {
      const [x, y, z] = door.position
      const leaf = Math.min(door.width, 1.1)
      // Head over the opening, so the hole reads as a door and not a gap.
      stage.set(`head:${door.id}`, {
        geometry: "box",
        position: [x, y + door.height + 0.12, z],
        size: door.spansX
          ? [door.width + 0.2, 0.24, door.thickness + 0.02]
          : [door.thickness + 0.02, 0.24, door.width + 0.2],
        color: shade(FABRIC, -0.08),
        decorative: true,
      })
      for (const side of door.width > 2 ? [-1, 1] : [1]) {
        const offset = door.width / 2 + leaf / 2
        stage.set(`leaf:${door.id}:${side}`, {
          geometry: "box",
          position: door.spansX
            ? [x + side * offset, y + door.height / 2, z + door.thickness * 0.7]
            : [x + door.thickness * 0.7, y + door.height / 2, z + side * offset],
          size: door.spansX
            ? [leaf, door.height, 0.05]
            : [0.05, door.height, leaf],
          color: LEAF,
          decorative: true,
        })
        stage.set(`jamb:${door.id}:${side}`, {
          geometry: "box",
          position: door.spansX
            ? [x + side * (door.width / 2), y + door.height / 2, z]
            : [x, y + door.height / 2, z + side * (door.width / 2)],
          size: door.spansX
            ? [0.08, door.height, door.thickness + 0.03]
            : [door.thickness + 0.03, door.height, 0.08],
          color: FRAME_,
          decorative: true,
        })
      }
      if (door.exit) {
        stage.set(`exit:${door.id}`, {
          geometry: "box",
          position: [x, y + door.height + 0.42, z],
          size: door.spansX ? [0.6, 0.22, 0.06] : [0.06, 0.22, 0.6],
          color: EXIT_SIGN,
          unlit: true,
          decorative: true,
        })
      }
    }
  }

  /** Desks, racking, benches and switchgear — scale, and a reason for a room. */
  private buildFitout(): void {
    const stage = this.stage
    for (const item of fitout()) {
      if (item.kind === "rack") {
        placeDecorativeAsset(stage, {
          id: `fit:${item.id}`,
          position: item.position,
          parts: serverRackParts(item.size),
        })
        continue
      }
      if (item.kind === "panel") {
        placeDecorativeAsset(stage, {
          id: `fit:${item.id}`,
          position: item.position,
          parts: switchboardParts(item.size),
        })
        continue
      }
      // A desk is a top on legs, not a block. The difference matters because
      // this is furniture seen from 1.7 m, in the room, at walking speed.
      if (item.kind === "desk" || item.kind === "table") {
        this.buildTable(item)
        continue
      }
      const seat = item.kind === "chair"
      // Every fit-out item is placed on its level's floor, so the floor is a
      // half-height below the centre the generator handed over.
      const floorY = item.position[1] - item.size[1] / 2
      const SEAT_H = 0.45
      stage.set(`fit:${item.id}`, {
        geometry: "box",
        position: seat ? [item.position[0], floorY + SEAT_H, item.position[2]] : item.position,
        size: seat ? [0.46, 0.08, 0.46] : item.size,
        color: FURNITURE[item.kind] ?? 0x9aa2ab,
        decorative: true,
      })
      if (seat) {
        stage.set(`fitleg:${item.id}`, {
          geometry: "cylinder",
          position: [item.position[0], floorY + SEAT_H / 2, item.position[2]],
          size: [0.09, SEAT_H, 0.09],
          color: 0x6d7681,
          decorative: true,
        })
      }
      if (seat) {
        // A seat and a back rather than a cube. At eye height in a walked
        // room, a cube is the thing that gives the model away.
        stage.set(`fitback:${item.id}`, {
          geometry: "box",
          position: [item.position[0], floorY + 0.72, item.position[2] + 0.21],
          size: [0.46, 0.46, 0.07],
          color: shade(FURNITURE.chair, -0.12),
          decorative: true,
        })
      }
    }
  }

  /** A laminate top, two gable legs and a modesty panel. */
  private buildTable(item: FitItem): void {
    const stage = this.stage
    const [x, cy, z] = item.position
    const [w, h, d] = item.size
    const floorY = cy - h / 2
    stage.set(`fit:${item.id}`, {
      geometry: "box",
      position: [x, floorY + h, z],
      size: [w * 1.06, 0.05, d * 1.12],
      color: 0xe4e0d8,
      decorative: true,
    })
    for (const side of [-1, 1]) {
      stage.set(`fitleg:${item.id}:${side}`, {
        geometry: "box",
        position: [x + side * (w / 2 - 0.06), floorY + (h - 0.05) / 2, z],
        size: [0.06, h - 0.05, d * 0.94],
        color: FURNITURE[item.kind],
        decorative: true,
      })
    }
    stage.set(`fitback:${item.id}`, {
      geometry: "box",
      position: [x, floorY + h * 0.62, z - d / 2 + 0.06],
      size: [w * 0.88, h * 0.5, 0.04],
      color: shade(FURNITURE[item.kind], -0.1),
      decorative: true,
    })
  }

  /**
   * The suspended ceiling: a T-bar grid drawn as lines, tiles laid into it, and
   * a luminaire on the module every few tiles.
   *
   * Tiles are slightly transparent, which is what keeps them out of the way of
   * picking — the viewer's hit test skips transparent material, so the learner
   * can still click the pipe running above the ceiling they are standing under.
   */
  private buildCeiling(): void {
    const stage = this.stage
    for (const room of ROOMS) {
      const [minX, minZ, maxX, maxZ] = room.bounds
      const y = room.level * STOREY + CEILING
      const w = maxX - minX
      const d = maxZ - minZ
      // Cupboards and risers are left open: they have no daylight of their
      // own, and a lid on a 3 m closet turns the one place the lesson happens
      // into a black box.
      if (w < 4 || d < 4) continue
      // Plant spaces run exposed-soffit, like the real thing — services on
      // show is the point of the room.
      if (room.id === "PLANT-L0" || room.id === "AHU-L1") continue

      stage.defineGeometry(`grid:${room.id}`, tbarMesh(w, d))
      this.ceiling.push(`tbar:${room.id}`)
      this.ceilingSize.set(`tbar:${room.id}`, [1, 1, 1])
      stage.set(`tbar:${room.id}`, {
        geometry: `grid:${room.id}`,
        position: [(minX + maxX) / 2, y + 0.03, (minZ + maxZ) / 2],
        color: TBAR,
        lines: true,
        decorative: true,
      })

      for (let x = minX + 0.6; x < maxX - 0.3; x += 1.2) {
        for (let z = minZ + 0.6; z < maxZ - 0.3; z += 1.2) {
          // The tile housekeeping pushed up to look at the leak. It is missing
          // here, and leaning against the wall over there.
          const open =
            room.id === OPEN_TILE.room &&
            Math.abs(x - OPEN_TILE.x) < 0.9 &&
            Math.abs(z - OPEN_TILE.z) < 0.9
          if (open) continue
          const lamp = (Math.round(x) + Math.round(z)) % 6 === 0
          const id = `tile:${room.id}:${x.toFixed(1)}:${z.toFixed(1)}`
          this.ceiling.push(id)
          this.ceilingSize.set(id, [1.14, 0.04, 1.14])
          stage.set(id, {
            geometry: "box",
            position: [x, y, z],
            size: [1.14, 0.04, 1.14],
            color: lamp ? LUMINAIRE : TILE,
            unlit: lamp,
            opacity: TILE_OPACITY,
            decorative: true,
          })
        }
      }
    }
    // The tile that came down, propped against the wall under the open module.
    stage.set("tile-down", {
      geometry: "box",
      position: [OPEN_TILE.x + 2.4, STOREY + 0.6, OPEN_TILE.z - 0.6],
      size: [1.14, 1.2, 0.06],
      direction: [0, Math.cos(0.28), Math.sin(0.28)],
      color: TILE,
      decorative: true,
    })
  }

  /**
   * Small operational cues taken from the generated incident briefing image:
   * threshold markings, a wet floor and an FCU drip tray. They are context,
   * never answerable catalogue objects, so stable training ids remain separate
   * from the visual dressing.
   */
  private buildEnvironmentalDetails(): void {
    for (const level of [0, 1]) {
      const floor = level * STOREY
      for (const offset of [-0.42, -0.14, 0.14, 0.42]) {
        this.stage.set(`detail:hazard:${level}:${offset}`, {
          geometry: "box",
          position: [20.5 + offset, floor + 0.03, 18.28],
          size: [0.18, 0.03, 0.62],
          color: HAZARD_YELLOW,
          unlit: true,
          decorative: true,
        })
      }
    }

    // The water tells the story from eye height before any label appears.
    this.stage.set("detail:puddle:214", {
      geometry: "sphere",
      position: [20, STOREY + 0.03, 5.35],
      size: [2.6, 0.045, 1.45],
      color: WATER,
      unlit: true,
      opacity: 0.38,
      decorative: true,
    })
    for (const [suffix, x, z, sx, sz] of [
      ["north", 19.25, 4.98, 1.1, 0.68],
      ["east", 21.08, 5.58, 0.92, 0.62],
      ["south", 19.6, 5.92, 1.25, 0.52],
    ] as const) {
      this.stage.set(`detail:puddle:214:${suffix}`, {
        geometry: "sphere",
        position: [x, STOREY + 0.035, z],
        size: [sx, 0.04, sz],
        color: WATER,
        unlit: true,
        opacity: 0.32,
        decorative: true,
      })
    }
    for (const [suffix, y, x, z, size] of [
      ["high", STOREY + 2.62, 20.02, 5.78, 0.08],
      ["mid", STOREY + 1.84, 19.98, 5.71, 0.065],
      ["low", STOREY + 0.88, 20.03, 5.62, 0.05],
    ] as const) {
      this.stage.set(`detail:drip:214:${suffix}`, {
        geometry: "sphere",
        position: [x, y, z],
        size: [size, size * 1.9, size],
        color: 0x7ec3d7,
        unlit: true,
        opacity: 0.72,
        decorative: true,
      })
    }
    this.stage.set("detail:drip-tray:214", {
      geometry: "box",
      position: [20, STOREY + 2.62, 3.4],
      size: [1.78, 0.06, 0.84],
      color: 0x66737a,
      decorative: true,
    })
    for (const [suffix, dx, dz, sx, sz] of [
      ["west", -0.66, 0, 0.16, 1.48],
      ["east", 0.66, 0, 0.16, 1.48],
      ["north", 0, -0.66, 1.48, 0.16],
      ["south", 0, 0.66, 1.48, 0.16],
    ] as const) {
      this.stage.set(`detail:wet-stain:214:${suffix}`, {
        geometry: "box",
        position: [OPEN_TILE.x + dx, STOREY + CEILING - 0.035, OPEN_TILE.z + dz],
        size: [sx, 0.025, sz],
        color: 0x79888c,
        opacity: 0.42,
        decorative: true,
      })
    }

    // A recognizable, route-safe operational prop from the incident plate.
    placeDecorativeAsset(this.stage, {
      id: "detail:room214:wet-floor-sign",
      position: [22.35, STOREY, 7.2],
      rotationY: -0.24,
      parts: aFrameSignParts(),
    })

    // The open tile reveals a populated plenum, not an empty box over a pipe.
    placeDecorativeAsset(this.stage, {
      id: "detail:room214:cable-tray",
      position: [17.25, STOREY + CEILING + 0.28, 4.05],
      parts: ladderTrayParts({ length: 3.2, width: 0.72 }),
    })

    // Physical wayfinding backs up the projected labels. Digits are authored
    // from exact seven-segment geometry rather than generated image text.
    for (const [label, x] of [["214", 19.22], ["215", 31.22], ["218", 42.15]] as const) {
      placeDecorativeAsset(this.stage, {
        id: `detail:wayfinding:${label}`,
        position: [x, STOREY + 1.56, 13.96],
        parts: roomPlaqueParts(label),
      })
    }

    // Mortar lines are cheap line geometry and give the north wall the same
    // painted-blockwork scale cue as the generated Room 214 reference.
    this.stage.set("detail:room214:blockwork", {
      geometry: "asset:blockwork",
      position: [20, STOREY + 1.62, 0.14],
      size: [9.5, 3.08, 1],
      color: 0x5f6568,
      lines: true,
      decorative: true,
    })

    // Server room 217 gets a cold-aisle cue and overhead containment, enough
    // to read as IT space before the learner studies individual equipment.
    this.stage.set("detail:server217:cold-aisle", {
      geometry: "box",
      position: [20, STOREY + 0.022, 24.2],
      size: [7.4, 0.022, 0.64],
      color: 0x2e718a,
      unlit: true,
      opacity: 0.48,
      decorative: true,
    })
    placeDecorativeAsset(this.stage, {
      id: "detail:server217:cable-tray",
      position: [20, STOREY + CEILING + 0.25, 22.25],
      parts: ladderTrayParts({ length: 7.2, width: 0.55, rungSpacing: 0.48 }),
    })

    // Switchroom standing clearance is operational information, not surface
    // decoration; the yellow boundary makes the equipment frontage legible.
    for (const [suffix, x, z, sx, sz] of [
      ["front", 7, 23.35, 10.4, 0.06],
      ["back", 7, 25.1, 10.4, 0.06],
      ["west", 1.8, 24.22, 0.06, 1.82],
      ["east", 12.2, 24.22, 0.06, 1.82],
    ] as const) {
      this.stage.set(`detail:switchroom:clearance:${suffix}`, {
        geometry: "box",
        position: [x, 0.025, z],
        size: [sx, 0.025, sz],
        color: HAZARD_YELLOW,
        unlit: true,
        decorative: true,
      })
    }

    this.buildDockDetails()
  }

  private buildDockDetails(): void {
    // Dock bumpers and bollards frame the roller door while staying clear of
    // the leveller and the walkable centerline.
    for (const [suffix, z] of [["north", 4.55], ["south", 9.45]] as const) {
      this.stage.set(`detail:dock:bollard:${suffix}`, {
        geometry: "cylinder",
        position: [46.65, 0.55, z],
        size: [0.22, 1.1, 0.22],
        color: HAZARD_YELLOW,
        metal: true,
        decorative: true,
      })
    }
    for (const [suffix, z] of [["north", 5.05], ["south", 8.95]] as const) {
      this.stage.set(`detail:dock:bumper:${suffix}`, {
        geometry: "box",
        position: [47.68, 0.58, z],
        size: [0.35, 0.8, 0.4],
        color: 0x202428,
        decorative: true,
      })
    }
    placeDecorativeAsset(this.stage, {
      id: "detail:dock:roller-slats",
      position: [47.72, 1.6, 7],
      rotationY: Math.PI / 2,
      parts: [{
        key: "slats",
        geometry: "asset:grille",
        offset: [0, 0, 0],
        size: [3.7, 3, 1],
        color: 0x3c4347,
        lines: true,
      }],
    })
    for (const offset of [-1.25, -0.75, -0.25, 0.25, 0.75, 1.25]) {
      this.stage.set(`detail:dock:approach:${offset}`, {
        geometry: "box",
        position: [43.15 + offset, 0.025, 10.85],
        size: [0.22, 0.025, 1.6],
        color: HAZARD_YELLOW,
        unlit: true,
        decorative: true,
      })
    }
  }

  /**
   * Compound visual trim around answerable elements. The semantic `el:*`
   * fragment remains untouched; these line-heavy children only improve the
   * silhouette and stay excluded from training selection.
   */
  private buildTrainingAssetDetails(): void {
    const fcu = ELEMENT_BY_ID.get("CHW-FCU-214")
    if (fcu) {
      placeDecorativeAsset(this.stage, {
        id: "detail:equipment:CHW-FCU-214",
        position: fcu.position,
        parts: fcuTrimParts(fcu.size),
      })
    }

    for (const id of ["AHU-01", "AHU-02"] as const) {
      const element = ELEMENT_BY_ID.get(id)
      if (!element) continue
      placeDecorativeAsset(this.stage, {
        id: `detail:equipment:${id}`,
        position: element.position,
        parts: ahuTrimParts(element.size),
      })
    }

    const crac = ELEMENT_BY_ID.get("CHW-CRAC-217")
    if (crac) {
      placeDecorativeAsset(this.stage, {
        id: "detail:equipment:CHW-CRAC-217",
        position: crac.position,
        parts: fcuTrimParts(crac.size),
      })
    }

    for (const id of ["DUCT-D12", "VAV-217"] as const) {
      const element = ELEMENT_BY_ID.get(id)
      if (!element) continue
      placeDecorativeAsset(this.stage, {
        id: `detail:equipment:${id}`,
        position: element.position,
        parts: [{
          key: "seams",
          geometry: "boxEdges",
          offset: [0, 0, 0],
          size: [element.size[0] + 0.025, element.size[1] + 0.025, element.size[2] + 0.025],
          color: 0x444b50,
          lines: true,
        }],
      })
    }

    for (const id of ["CHW-VLV-L1", "HTG-VLV-L1", "CHW-VLV-214"] as const) {
      const element = ELEMENT_BY_ID.get(id)
      if (!element) continue
      placeDecorativeAsset(this.stage, {
        id: `detail:valve:${id}`,
        position: element.position,
        parts: valveTrimParts(element.size, SYSTEM_COLOR[element.system] ?? 0x7b858b),
      })
    }

    this.buildPipeIdBands()
    this.buildLifeSafetyDetails()
    this.buildPlantRoomDetails()
  }

  /**
   * BS 1710 identification bands: mains runs are silver insulation, and every
   * few metres a band names the service in its system colour. Reading the band
   * — not the pipe — is how the real building is labelled, so it is how this
   * one teaches.
   */
  private buildPipeIdBands(): void {
    for (const element of ELEMENTS) {
      const [sx, sy, sz] = element.size
      const longest = Math.max(sx, sy, sz)
      const girth = Math.min(sx, sy, sz)
      const pipey = /riser|drop|main|header|branch/i.test(element.name) && longest > girth * 3
      if (!pipey) continue
      const axis: Vec3 = sy === longest ? [0, 1, 0] : sx === longest ? [1, 0, 0] : [0, 0, 1]
      const color = SYSTEM_COLOR[element.system] ?? 0x8b939d
      const bands = Math.min(6, Math.max(2, Math.floor(longest / 5)))
      const step = longest / (bands + 1)
      const parts = []
      for (let n = 1; n <= bands; n++) {
        const t = -longest / 2 + n * step
        parts.push({
          key: `band-${n}`,
          geometry: "cylinder" as const,
          offset: [axis[0] * t, axis[1] * t, axis[2] * t] as Vec3,
          size: [girth * 1.12, 0.16, girth * 1.12] as Vec3,
          direction: axis,
          color,
          unlit: true,
        })
      }
      placeDecorativeAsset(this.stage, {
        id: `detail:pipe-id:${element.id}`,
        position: element.position,
        parts,
      })
    }
  }

  /**
   * BS EN 3 / BS 5306-8 dressing: extinguishers get their agent band, bracket
   * and (for CO2) horn; every exit door gets a manual call point at 1.4 m.
   */
  private buildLifeSafetyDetails(): void {
    for (const element of ELEMENTS) {
      if (!/extinguisher/i.test(element.name)) continue
      const type = typeof element.props?.type === "string" ? element.props.type : undefined
      placeDecorativeAsset(this.stage, {
        id: `detail:ext:${element.id}`,
        position: element.position,
        parts: extinguisherTrimParts(element.size, type, -1),
      })
    }

    // Call points: beside the west final exit, the stair core doors, and the
    // plant room door — the places a real fire strategy drawing puts them.
    const callPoints: [string, Vec3, 1 | -1][] = [
      ["exit-west", [1.2, 1.4, 15], -1],
      ["core-l0", [39.4, 1.4, 21.35], 1],
      ["core-l1", [39.4, STOREY + 1.4, 21.35], 1],
      ["plant", [8.1, 1.4, 14.05], 1],
    ]
    for (const [key, position, wall] of callPoints) {
      placeDecorativeAsset(this.stage, {
        id: `detail:callpoint:${key}`,
        position,
        parts: callPointParts(wall),
      })
    }

    // Sprinkler mains: a red pipe down each corridor void with pendent drops
    // at tile-module intervals. Painted safety red end to end, as the one
    // service that is never insulated.
    for (const level of [0, 1]) {
      const y = level * STOREY + CEILING + 0.42
      this.stage.set(`detail:sprinkler:run:${level}`, {
        geometry: "cylinder",
        position: [24, y, 16.9],
        size: [0.09, 44, 0.09],
        direction: [1, 0, 0],
        color: SAFETY_RED,
        decorative: true,
      })
      for (let x = 4; x <= 44; x += 4.8) {
        this.stage.set(`detail:sprinkler:drop:${level}:${x}`, {
          geometry: "cylinder",
          position: [x, level * STOREY + CEILING + 0.2, 16.9],
          size: [0.035, 0.44, 0.035],
          color: SAFETY_RED,
          decorative: true,
        })
        this.stage.set(`detail:sprinkler:head:${level}:${x}`, {
          geometry: "sphere",
          position: [x, level * STOREY + CEILING - 0.04, 16.9],
          size: [0.09, 0.07, 0.09],
          color: 0xd8b25a,
          metal: true,
          decorative: true,
        })
      }
    }
  }

  /**
   * The plant room composed the way a real one is: housekeeping pads under
   * floor-mounted plant, a duty/standby pump pair on inertia bases, the red
   * expansion vessel and silver buffer vessel everyone recognises, and a
   * painted floor.
   */
  private buildPlantRoomDetails(): void {
    const stage = this.stage

    // Painted plant floors: ground plant room and the L1 AHU room.
    for (const [key, level] of [["plant", 0], ["ahu", 1]] as const) {
      stage.set(`detail:plantfloor:${key}`, {
        geometry: "box",
        position: [7, level * STOREY + 0.012, 7],
        size: [11.8, 0.024, 11.8],
        color: 0x5c6660,
        decorative: true,
      })
    }

    // Housekeeping pads, 150 mm proud of each footprint.
    const pads: [string, string][] = [
      ["CHW-CH-01", "chiller"],
      ["HTG-BLR-01", "boiler"],
      ["CHW-PMP-01", "pump"],
    ]
    for (const [id, key] of pads) {
      const element = ELEMENT_BY_ID.get(id)
      if (!element) continue
      const [sx, , sz] = element.size
      const floorY = element.position[1] - element.size[1] / 2
      stage.set(`detail:pad:${key}`, {
        geometry: "box",
        position: [element.position[0], floorY + 0.05, element.position[2]],
        size: [sx + 0.3, 0.1, sz + 0.3],
        color: 0xb8b8b8,
        decorative: true,
      })
    }

    // The duty pump's mechanical dressing, and a standby twin beside it —
    // pumps come in pairs, and the pair is what makes the room read as real.
    const pump = ELEMENT_BY_ID.get("CHW-PMP-01")
    if (pump) {
      placeDecorativeAsset(stage, {
        id: "detail:pump:duty",
        position: pump.position,
        parts: pumpTrimParts(pump.size),
      })
      const standby: Vec3 = [pump.position[0], pump.position[1], pump.position[2] + 1.8]
      placeDecorativeAsset(stage, {
        id: "detail:pump:standby",
        position: standby,
        parts: [
          ...pumpTrimParts(pump.size),
          {
            key: "body",
            geometry: "box",
            offset: [0, 0.05, 0],
            size: [pump.size[0], pump.size[1] * 0.8, pump.size[2] * 0.8],
            color: 0x4a5158,
            metal: true,
          },
        ],
      })
    }

    // Vessels along the south wall: LTHW expansion (red) and CHW buffer
    // (insulated silver).
    placeDecorativeAsset(stage, {
      id: "detail:vessel:expansion",
      position: [7.3, 0, 11.2],
      parts: vesselParts({ diameter: 0.6, height: 1.2, color: 0xb03a2e }),
    })
    placeDecorativeAsset(stage, {
      id: "detail:vessel:buffer",
      position: [9.4, 0, 11],
      parts: vesselParts({ diameter: 0.85, height: 1.8, color: INSULATION }),
    })

    // Boiler flue rising to the roof of the room.
    stage.set("detail:boiler:flue", {
      geometry: "cylinder",
      position: [4.5, 2.9, 10.5],
      size: [0.2, 1.9, 0.2],
      color: GALVANISED,
      metal: true,
      decorative: true,
    })

    // The chilled-water circuit as continuous pipework. The catalogue's
    // answerable elements sit *in* this run; without it the main valve floats
    // in mid-air, which is the single loudest tell that a model is fake.
    const runs: [string, Vec3, number, Vec3][] = [
      // suction: chiller east face to the pump
      ["suction", [7.4, 1.1, 5], 2.7, [1, 0, 0]],
      // pump discharge heading for the valve group
      ["disch-z", [9.3, 1.5, 6.6], 2.9, [0, 0, 1]],
      ["disch-x", [10.9, 1.5, 8], 3.4, [1, 0, 0]],
      // elbow up into the void and away to the corridor header
      ["rise", [12.5, 2.45, 8], 2, [0, 1, 0]],
      ["void-z", [12.5, 3.4, 12], 8.2, [0, 0, 1]],
    ]
    for (const [key, position, length, direction] of runs) {
      stage.set(`detail:chw-run:${key}`, {
        geometry: "cylinder",
        position,
        size: [0.18, length, 0.18],
        direction,
        color: INSULATION,
        metal: true,
        decorative: true,
      })
    }
    for (const [key, position] of [
      ["a", [9.3, 1.5, 5.2]],
      ["b", [9.3, 1.5, 8]],
      ["c", [12.5, 1.5, 8]],
      ["d", [12.5, 3.4, 8]],
    ] as [string, Vec3][]) {
      stage.set(`detail:chw-elbow:${key}`, {
        geometry: "sphere",
        position,
        size: [0.22, 0.22, 0.22],
        color: INSULATION,
        metal: true,
        decorative: true,
      })
    }

    // Chiller dressing: panel seams and a louvred condenser end.
    const chiller = ELEMENT_BY_ID.get("CHW-CH-01")
    if (chiller) {
      placeDecorativeAsset(stage, {
        id: "detail:equipment:CHW-CH-01",
        position: chiller.position,
        parts: [
          {
            key: "seams",
            geometry: "boxEdges",
            offset: [0, 0, 0],
            size: [chiller.size[0] + 0.03, chiller.size[1] + 0.03, chiller.size[2] + 0.03],
            color: 0x444b50,
            lines: true,
          },
          {
            key: "louvres",
            geometry: "asset:grille",
            offset: [-chiller.size[0] / 2 - 0.03, 0.1, 0],
            size: [chiller.size[2] * 0.86, chiller.size[1] * 0.7, 1],
            rotationY: Math.PI / 2,
            color: 0x2c3236,
            lines: true,
          },
          // Manufacturer accent stripe in the system colour — identity without
          // painting the whole cabinet.
          {
            key: "accent",
            geometry: "box",
            offset: [0, -chiller.size[1] * 0.32, 0],
            size: [chiller.size[0] + 0.04, 0.22, chiller.size[2] + 0.04],
            color: SYSTEM_COLOR["chilled water"],
            unlit: true,
          },
        ],
      })
    }

    const boiler = ELEMENT_BY_ID.get("HTG-BLR-01")
    if (boiler) {
      placeDecorativeAsset(stage, {
        id: "detail:equipment:HTG-BLR-01",
        position: boiler.position,
        parts: [
          {
            key: "seams",
            geometry: "boxEdges",
            offset: [0, 0, 0],
            size: [boiler.size[0] + 0.03, boiler.size[1] + 0.03, boiler.size[2] + 0.03],
            color: 0x50565a,
            lines: true,
          },
          {
            key: "accent",
            geometry: "box",
            offset: [0, -boiler.size[1] * 0.34, 0],
            size: [boiler.size[0] + 0.04, 0.18, boiler.size[2] + 0.04],
            color: SYSTEM_COLOR.heating,
            unlit: true,
          },
        ],
      })
    }

    // Plant rooms have batten luminaires, not ceiling tiles — without them the
    // room is a cave and every colour cue below dies in shadow.
    for (const [key, level] of [["plant", 0], ["ahu", 1]] as const) {
      for (const z of [4, 9]) {
        stage.set(`detail:plantlight:${key}:${z}`, {
          geometry: "box",
          position: [7, level * STOREY + 3.55, z],
          size: [8, 0.06, 0.18],
          color: LUMINAIRE,
          unlit: true,
          decorative: true,
        })
      }
    }
  }

  /** One instance per catalogue element, shaped by what it is. */
  private paint(element: TrainingElement): void {
    this.stage.set(`el:${element.id}`, this.itemFor(element))
  }

  private repaint(id: string): void {
    const element = ELEMENT_BY_ID.get(id)
    if (element) this.paint(element)
  }

  private itemFor(element: TrainingElement): StageItemInit {
    const tone = this.selection?.id === element.id
      ? this.selection.tone
      : this.highlighted.get(element.id)
    const base = SYSTEM_COLOR[element.system] ?? 0x8b939d
    const ghosted = this.isolated && !this.isolated.has(element.id)
    // A highlighted element takes the tone colour itself. Nothing is drawn in
    // front of it — the learner answers by clicking, and a solid halo would eat
    // the pick ray before it ever reached the element being marked.
    const color = tone ? TONE_COLOR[tone] : ghosted ? GHOST : base
    // A cue must stay visible wherever the old cages were — including through
    // fabric — so cue-toned components render as a through-wall silhouette.
    const xray = tone === "trace" || tone === "ask"
    const [sx, sy, sz] = element.size

    if (/valve|isolator/i.test(element.name)) {
      return {
        geometry: "valve",
        position: element.position,
        size: [sx * 1.3, sy * 1.08, sz * 1.3],
        color,
        unlit: !!tone,
        throughWalls: xray,
        opacity: ghosted ? 0.3 : 1,
      }
    }

    if (/extinguisher/i.test(element.name)) {
      // BS EN 3: the body is safety red regardless of agent; the agent is the
      // shoulder band the trim adds. Verdict tones still take the whole body.
      return {
        geometry: "extinguisher",
        position: element.position,
        size: [sx, sy, sz],
        color: tone ? color : ghosted ? GHOST : SAFETY_RED,
        unlit: !!tone,
        throughWalls: xray,
        opacity: ghosted ? 0.3 : 1,
      }
    }

    // Pipework reads as pipework: anything long and thin becomes a cylinder
    // aimed down its long axis — and a mains run wears foil-faced insulation,
    // not discipline paint. The discipline lives in the ID bands the trim
    // paints on, which is how BS 1710 labels the real thing.
    const longest = Math.max(sx, sy, sz)
    const girth = Math.min(sx, sy, sz)
    const pipey = /riser|drop|main|header|branch/i.test(element.name) && longest > girth * 3
    if (pipey) {
      const direction: Vec3 = sy === longest ? [0, 1, 0] : sx === longest ? [1, 0, 0] : [0, 0, 1]
      return {
        geometry: "cylinder",
        position: element.position,
        size: [girth, longest, girth],
        direction,
        color: tone ? color : ghosted ? GHOST : INSULATION,
        metal: !tone && !ghosted,
        throughWalls: xray,
        // Marked elements are drawn unlit. Half of this building is inside a
        // cupboard with no daylight, and a highlight that a shadow can swallow
        // is not a highlight.
        unlit: !!tone,
        opacity: ghosted ? 0.3 : 1,
      }
    }

    // Ductwork is galvanised sheet, and packaged plant wears factory casing —
    // pale panels, never discipline paint. The discipline lives in the pipes,
    // bands and accents around it, which is how the real kit is labelled.
    const ducty = /duct/i.test(element.name)
    const casing = /chiller/i.test(element.name)
      ? 0xdcdcd8
      : /boiler/i.test(element.name)
        ? 0xe9e7e2
        : /AHU/i.test(element.name)
          ? 0xd9d9d6
          : /fan coil|CRAC|VAV|UPS/i.test(element.name)
            ? 0xcfd3d5
            : /pump/i.test(element.name)
              ? 0x3a5a40
              : /pallet/i.test(element.name)
                ? 0xbb9a6b
                : /door|final exit/i.test(element.name)
                  ? LEAF
                  : undefined
    return {
      geometry: "box",
      position: element.position,
      size: element.size,
      color: tone ? color : ghosted ? GHOST : ducty ? GALVANISED : casing ?? base,
      metal: ducty && !tone && !ghosted,
      throughWalls: xray,
      unlit: !!tone,
      opacity: ghosted ? 0.3 : 1,
    }
  }

  // --- TrainingRenderer -----------------------------------------------------

  /**
   * A ceiling you only ever see from underneath. Lifted whenever the model is
   * being looked at from outside, which is every view except walking.
   */
  setCeiling(down: boolean): void {
    if (down === this.ceilingDown) return
    this.ceilingDown = down
    for (const id of this.ceiling) {
      const size = this.ceilingSize.get(id)
      if (size) this.stage.place(id, { size: down ? size : [0, 0, 0] })
    }
    this.stage.place("tile-down", { size: down ? [1.14, 1.2, 0.06] : [0, 0, 0] })
    this.stage.refresh()
  }

  highlight(groups: { ids: string[]; tone: HighlightTone }[]): void {
    for (const group of groups) {
      for (const id of group.ids) this.highlighted.set(id, group.tone)
    }
    this.syncHighlights()
  }

  clearHighlights(): void {
    this.highlighted.clear()
    this.syncHighlights()
  }

  setLearningCues(ids: string[]): void {
    this.learningCues = new Set(ids)
    this.syncHighlights()
  }

  setSelection(selection: { id: string; tone: HighlightTone } | null): void {
    this.selection = selection
    this.syncHighlights()
  }

  /** Emphasise a set and ghost everything else. Null restores the full model. */
  isolate(ids: string[] | null): void {
    this.isolated = ids && ids.length ? new Set(ids) : null
    for (const element of ELEMENTS) this.paint(element)
    this.stage.refresh()
  }

  boundsOf(id: string): { position: Vec3; size: Vec3 } | undefined {
    const element = ELEMENT_BY_ID.get(id)
    return element ? { position: element.position, size: element.size } : undefined
  }

  // --- picking --------------------------------------------------------------

  /**
   * Screen point → catalogue element. Exact geometry hits win; small controls
   * then get a screen-space tolerance while the Stage occlusion guard prevents
   * selecting through opaque context geometry.
   */
  pick(
    clientX: number,
    clientY: number,
    context: {
      level?: number
      room?: string
      targetIds?: string[]
      tolerancePx?: number
    } = {},
  ): TrainingElement | undefined {
    const hit = this.stage.pick(clientX, clientY)
    if (hit?.id.startsWith("el:")) return ELEMENT_BY_ID.get(hit.id.slice(3))

    const targets = new Set(context.targetIds ?? [])
    const candidates = ELEMENTS.filter((element) => {
      if (targets.has(element.id)) return true
      if (context.level !== undefined && element.level !== context.level) return false
      return !context.room || element.room === context.room
    }).map((element) => `el:${element.id}`)
    // Anything the scene is currently marking through walls is answerable
    // through them too.
    const xray = new Set<string>()
    for (const id of this.highlighted.keys()) xray.add(`el:${id}`)
    for (const id of this.learningCues) xray.add(`el:${id}`)
    if (this.selection) xray.add(`el:${this.selection.id}`)
    const snapped = this.stage.pickNearest(
      clientX,
      clientY,
      candidates,
      context.tolerancePx ?? 20,
      xray,
    )
    return snapped?.id.startsWith("el:")
      ? ELEMENT_BY_ID.get(snapped.id.slice(3))
      : undefined
  }

  private syncHighlights(): void {
    const stage = this.stage
    const wanted = new Set<string>()
    const visible = new Map<string, HighlightTone>(
      [...this.learningCues].map((id) => [id, "trace"]),
    )
    for (const [id, tone] of this.highlighted) visible.set(id, tone)
    if (this.selection) visible.set(this.selection.id, this.selection.tone)
    for (const id of visible.keys()) {
      if (!ELEMENT_BY_ID.has(id)) continue
      this.repaint(id)
      wanted.add(id)
    }
    // No cages, no brackets: the marked component itself carries the tone.
    // Anything left from an older marking style is cleared.
    for (const id of stage.ids()) {
      if (id.startsWith("hl:")) stage.remove(id)
    }
    this.syncShimmer(
      new Map(
        [...visible].filter(([, tone]) => tone === "trace" || tone === "ask"),
      ),
    )
    for (const id of this.tinted) {
      if (!wanted.has(id)) this.repaint(id)
    }
    this.tinted = wanted
    stage.refresh()
  }

  /**
   * Cues shimmer instead of wearing a box: a slow luminance breath on the
   * component itself (2.4 s, matching the plan's `.plan-cue` pulse), subtle
   * enough to live on screen constantly. Verdict and selection tones stay
   * steady — they are state, not attention. Honours `prefers-reduced-motion`
   * by holding a static tint.
   */
  private syncShimmer(cues: Map<string, HighlightTone>): void {
    this.shimmering = cues
    const reduced =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches
    if (!cues.size || reduced) {
      if (this.shimmerFrame !== null) cancelAnimationFrame(this.shimmerFrame)
      this.shimmerFrame = null
      return
    }
    if (this.shimmerFrame !== null) return
    let last = 0
    const step = (t: number) => {
      if (!this.shimmering.size) {
        this.shimmerFrame = null
        return
      }
      this.shimmerFrame = requestAnimationFrame(step)
      if (t - last < 33) return // 30 fps is plenty for a breath
      last = t
      const k = 0.5 - 0.5 * Math.cos(((t % 2400) / 2400) * Math.PI * 2)
      for (const [id, tone] of this.shimmering) {
        this.stage.paint(`el:${id}`, {
          color: shade(TONE_COLOR[tone], 0.08 + 0.3 * k),
        })
      }
      this.stage.refresh()
    }
    this.shimmerFrame = requestAnimationFrame(step)
  }
}

/**
 * A ceiling grid as line segments: the T-bars on a 1.2 m module, plus the
 * perimeter trim.
 */
function tbarMesh(width: number, depth: number) {
  const positions: number[] = []
  const hw = width / 2
  const hd = depth / 2
  for (let x = -hw; x <= hw + 0.001; x += 1.2) positions.push(x, 0, -hd, x, 0, hd)
  for (let z = -hd; z <= hd + 0.001; z += 1.2) positions.push(-hw, 0, z, hw, 0, z)
  positions.push(-hw, 0, -hd, hw, 0, -hd, hw, 0, -hd, hw, 0, hd)
  positions.push(hw, 0, hd, -hw, 0, hd, -hw, 0, hd, -hw, 0, -hd)
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(0),
    indices: new Uint16Array(0),
  }
}
