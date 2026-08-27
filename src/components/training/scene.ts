import {
  Stage,
  aFrameSignParts,
  ahuTrimParts,
  defineFacilityAssetGeometry,
  fcuTrimParts,
  ladderTrayParts,
  placeDecorativeAsset,
  roomPlaqueParts,
  serverRackParts,
  shade,
  switchboardParts,
  valveTrimParts,
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
const EXIT_SIGN = 0x2f8f5b
const ROUTE_BLUE = 0x2e718a
const HAZARD_YELLOW = 0xe4ae32
const WATER = 0x4d9ab5
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
  private isolated: Set<string> | null = null
  private ceiling: string[] = []
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
      stage.set(`wall:${piece.id}`, {
        geometry: "box",
        position: piece.position,
        size: piece.size,
        color: FABRIC,
        opacity: 0.96,
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
   * a route stripe, threshold markings, a wet floor and an FCU drip tray. They
   * are context, never answerable catalogue objects, so stable training ids
   * remain separate from the visual dressing.
   */
  private buildEnvironmentalDetails(): void {
    for (const level of [0, 1]) {
      const floor = level * STOREY
      this.stage.set(`detail:route:${level}`, {
        geometry: "box",
        position: [24, floor + 0.025, 16],
        size: [44, 0.025, 0.12],
        color: ROUTE_BLUE,
        unlit: true,
        opacity: 0.88,
        decorative: true,
      })
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
    const tone = this.highlighted.get(element.id)
    const base = SYSTEM_COLOR[element.system] ?? 0x8b939d
    const ghosted = this.isolated && !this.isolated.has(element.id)
    // A highlighted element takes the tone colour itself. Nothing is drawn in
    // front of it — the learner answers by clicking, and a solid halo would eat
    // the pick ray before it ever reached the element being marked.
    const color = tone ? TONE_COLOR[tone] : ghosted ? GHOST : base
    const [sx, sy, sz] = element.size

    if (/valve|isolator/i.test(element.name)) {
      return {
        geometry: "sphere",
        position: element.position,
        size: [sx * 1.3, sy * 1.08, sz * 1.3],
        color,
        unlit: !!tone,
        opacity: ghosted ? 0.3 : 1,
      }
    }

    if (/extinguisher/i.test(element.name)) {
      return {
        geometry: "cylinder",
        position: element.position,
        size: [sx, sy, sz],
        color,
        unlit: !!tone,
        opacity: ghosted ? 0.3 : 1,
      }
    }

    // Pipework reads as pipework: anything long and thin becomes a cylinder
    // aimed down its long axis.
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
        color,
        // Marked elements are drawn unlit. Half of this building is inside a
        // cupboard with no daylight, and a highlight that a shadow can swallow
        // is not a highlight.
        unlit: !!tone,
        opacity: ghosted ? 0.3 : 1,
      }
    }

    return {
      geometry: "box",
      position: element.position,
      size: element.size,
      color,
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
    const previous = [...this.highlighted.keys()]
    this.highlighted.clear()
    this.syncHighlights()
    for (const id of previous) this.repaint(id)
    this.stage.refresh()
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
   * Screen point → catalogue element. Exact Scene API hits win; small controls
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
    const snapped = this.stage.pickNearest(
      clientX,
      clientY,
      candidates,
      context.tolerancePx ?? 20,
    )
    return snapped?.id.startsWith("el:")
      ? ELEMENT_BY_ID.get(snapped.id.slice(3))
      : undefined
  }

  private syncHighlights(): void {
    const stage = this.stage
    const wanted = new Set<string>()
    for (const [id, tone] of this.highlighted) {
      const element = ELEMENT_BY_ID.get(id)
      if (!element) continue
      this.repaint(id)
      const key = `hl:${id}`
      wanted.add(key)
      const pad = 0.5
      // A wireframe cage, drawn through whatever is in front of it. Lines carry
      // no triangles, so this stays out of the way of hit testing.
      stage.set(key, {
        geometry: "boxEdges",
        position: element.position,
        size: [element.size[0] + pad, element.size[1] + pad, element.size[2] + pad],
        color: TONE_COLOR[tone],
        lines: true,
        throughWalls: true,
        decorative: true,
      })
    }
    for (const id of stage.ids()) {
      if (id.startsWith("hl:") && !wanted.has(id)) {
        stage.remove(id)
        this.repaint(id.slice(3))
      }
    }
    stage.refresh()
  }

  // --- replay ---------------------------------------------------------------

  /** Draws the walked path as a line on the floor of each level. */
  drawTrail(trail: Vec3[]): void {
    this.stage.removeWhere("trail:")
    if (trail.length < 2) return
    const positions: number[] = []
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1]
      const b = trail[i]
      // Skip the jump when a step teleports the learner to a new start point.
      if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 6) continue
      positions.push(a[0], a[1] - 1.55, a[2], b[0], b[1] - 1.55, b[2])
    }
    if (!positions.length) return
    this.stage.defineGeometry("trail", {
      positions: new Float32Array(positions),
      normals: new Float32Array(0),
      indices: new Uint16Array(0),
    })
    this.stage.set("trail:path", {
      geometry: "trail",
      position: [0, 0, 0],
      color: 0x2f80d8,
      lines: true,
      decorative: true,
    })
    this.stage.refresh()
  }

  clearTrail(): void {
    this.stage.removeWhere("trail:")
    this.stage.refresh()
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
