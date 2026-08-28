import type { Mission, Vec3 } from "@layer0/viewer-training"
import { ELEMENT_BY_ID, STOREY } from "./facility"

/**
 * Seven jobs, one building.
 *
 * Each mission is three steps and each step is written the way an instructor
 * would set it: what to do, what counts, and — the part that does the teaching
 * — which wrong answers are wrong for a reason worth hearing. A `nearMiss` is
 * not a consolation prize; it is the misconception the step exists to correct.
 */

export interface Role {
  id: string
  label: string
  blurb: string
}

export const ROLES: Role[] = [
  { id: "technician", label: "New facility technician", blurb: "Week two. A leak, and no one else on site." },
  { id: "safety", label: "Safety inspector", blurb: "Walk the escape routes and find what has drifted." },
  { id: "firefighter", label: "Firefighter", blurb: "Pre-incident familiarisation on an unfamiliar building." },
  { id: "construction", label: "Construction manager", blurb: "Close out a clash the coordination review flagged." },
  { id: "commissioning", label: "Commissioning engineer", blurb: "Prove which unit actually serves the server room." },
  { id: "maintenance", label: "Maintenance contractor", blurb: "Arrive, isolate, and work safely on someone else's plant." },
  { id: "operator", label: "Building operator", blurb: "Know your routes before you need them." },
]

/**
 * The tools a step leaves switched on when it wants the answer found rather
 * than looked up. Everything that reads one named element stays; anything that
 * lists or locates the catalogue goes.
 */
const NO_SEARCH = [
  "training_get_session",
  "training_inspect_element",
  "training_trace_system",
  "training_give_hint",
  "training_say",
  "training_cut_section",
]

const at = (id: string): Vec3 => ELEMENT_BY_ID.get(id)?.position ?? [24, 0, 16]
const L1 = STOREY

export const MISSIONS: Record<string, Mission> = {
  // -------------------------------------------------------------------------
  technician: {
    id: "m-technician",
    role: "technician",
    author: "built-in",
    title: "Leak in Room 214",
    brief:
      "07:42. Housekeeping reports water coming through a ceiling tile in Room 214. " +
      "You are on the first floor, east end. Find the room, find the break, and stop it — " +
      "and do it without searching the model.",
    steps: [
      {
        id: "t1",
        mode: "reach",
        prompt: "Find Room 214 on Level 1. Follow the corridor west and read the building signs.",
        startState: { walkTo: [44, L1, 16], facing: [20, L1, 16] },
        validDestination: { room: "ROOM-214" },
        allowedTools: NO_SEARCH,
        hints: [
          { text: "The rooms on this floor run along the north side of the corridor, numbered west to east." },
          { text: "214 is the second door on your right as you walk west. Its fan coil is lit up now.", reveals: ["CHW-FCU-214"] },
        ],
        successMessage: "Room 214. The tile is down and the void is open above you.",
      },
      {
        id: "t2",
        mode: "select",
        prompt: "Look above the missing ceiling tile. Hover to identify components, then select the source of the leak.",
        startState: { walkTo: [20, L1, 10], facing: [20, L1, 3] },
        validSelections: ["CHW-DROP-214"],
        nearMisses: [
          {
            id: "CHW-FCU-214",
            diagnosis:
              "The coil is soaked, so it is a reasonable place to start — but water runs downhill. " +
              "Something above it is putting water on it.",
          },
          {
            id: "CHW-VLV-214",
            diagnosis:
              "That is the terminal valve for this room, and it is dry. It sits below the break, not at it.",
          },
        ],
        allowedTools: NO_SEARCH,
        hints: [
          { text: "Look up. Everything on this floor is fed from the ceiling void." },
          { text: "The drop coming down to the coil has a weld in it.", reveals: ["CHW-DROP-214"] },
        ],
        successMessage: "The drop to FCU-214, split at the weld. That is your leak.",
      },
      {
        id: "t3",
        mode: "select",
        prompt:
          "Trace the pipe upstream. Select the nearest chilled-water valve that stops this leak without shutting down the whole building.",
        guidance:
          "The valve is not in Room 214. Leave the room and cross the corridor to the Level 1 riser cupboard, then hover over the paired valves in 3D to distinguish chilled water from heating.",
        validSelections: ["CHW-VLV-L1"],
        nearMisses: [
          {
            id: "CHW-VLV-214",
            diagnosis:
              "Right system, wrong side of the break. That valve is downstream of the split — close it and " +
              "the leak is still fed from the branch above.",
          },
          {
            id: "CHW-VLV-MAIN",
            diagnosis:
              "That would stop it, and it would also take chilled water off the whole building, including " +
              "the CRAC in the server room. There is a closer one that only costs you this floor.",
          },
          {
            id: "CHW-VLV-L0",
            diagnosis: "Right riser, wrong floor. That one serves the ground floor branch.",
          },
          {
            id: "HTG-VLV-L1",
            diagnosis:
              "That is the heating branch. It is mounted about 300 mm from the one you want, on the same " +
              "bracket, which is exactly why it gets closed by mistake at three in the morning.",
          },
        ],
        allowedTools: NO_SEARCH,
        hints: [
          { text: "Trace the pipe backwards from the split. Where does this floor get its water?" },
          { text: "Every service on this floor comes up one cupboard off the corridor.", reveals: ["CHW-RSR-01"] },
          {
            text: "Two valves on that riser at first floor level. One is chilled water.",
            reveals: ["CHW-VLV-L1", "HTG-VLV-L1"],
            view: { walkTo: [20.5, L1, 16.6], facing: [21.2, L1, 20.5] },
          },
        ],
        successState: { highlight: [{ ids: ["CHW-VLV-L1"], tone: "good" }] },
        successMessage: "V-CHW-101. First floor off, rest of the building still cooled.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  safety: {
    id: "m-safety",
    role: "safety",
    author: "built-in",
    title: "First floor egress inspection",
    brief:
      "Routine inspection of the first floor. Two things are wrong up here — one you will trip over, " +
      "one you have to read a label to catch.",
    steps: [
      {
        id: "s1",
        mode: "select",
        prompt: "Something in this corridor should not be here. Select it.",
        startState: { walkTo: [30, L1, 16], facing: [44, L1, 16] },
        validSelections: ["OBSTRUCTION-01"],
        nearMisses: [
          {
            id: "FIRE-EXT-L1-02",
            diagnosis: "That is a problem too, and you will come back to it — but it is not blocking anything.",
          },
        ],
        hints: [{ text: "Look along the corridor toward the stair core." }],
        successMessage: "A pallet stack in the escape route, eleven days old.",
      },
      {
        id: "s2",
        mode: "reach",
        prompt:
          "Walk the route an occupant of Room 216 would take to the stair core. Do not cut through the server room.",
        startState: { walkTo: [7, L1, 26], facing: [7, L1, 18] },
        validDestination: { room: "CORE-L1" },
        avoidRooms: ["ROOM-217"],
        hints: [{ text: "Out to the corridor, then east. The server room is not an escape route." }],
        successMessage: "That is the route, and now you have walked past the obstruction yourself.",
      },
      {
        id: "s3",
        mode: "select",
        prompt: "One extinguisher on this floor is out of service. Select it.",
        validSelections: ["FIRE-EXT-L1-02"],
        nearMisses: [
          { id: "FIRE-EXT-L1-01", diagnosis: "Serviced last April. That one is fine." },
        ],
        hints: [
          { text: "There are two on this floor. The label carries the service date." },
          { text: "The one at the east end has not been touched since 2019.", reveals: ["FIRE-EXT-L1-02"] },
        ],
        successMessage: "Water extinguisher 1F-02, last serviced November 2019.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  firefighter: {
    id: "m-firefighter",
    role: "firefighter",
    author: "built-in",
    title: "Pre-incident familiarisation",
    brief:
      "You have never been in this building. Fire on the first floor, server room adjacent. " +
      "Charge the riser, get to the landing valve, and make the server room safe to put water near.",
    steps: [
      {
        id: "f1",
        mode: "select",
        prompt: "Before anyone goes in — select the dry riser inlet.",
        startState: {
          camera: { position: [64, 10, 10], target: [46, 2, 10] },
        },
        validSelections: ["FIRE-INLET-01"],
        nearMisses: [
          { id: "DOOR-DOCK-E", diagnosis: "That is the way in for people, not for water." },
        ],
        hints: [{ text: "East elevation, low down, near the dock." }],
        successMessage: "Two-way inlet on the east elevation. Riser charged.",
      },
      {
        id: "f2",
        mode: "reach",
        prompt: "Now get to the first floor landing valve.",
        startState: { walkTo: [44, 0, 7], facing: [44, 0, 20] },
        validDestination: { room: "CORE-L1" },
        hints: [
          { text: "The riser runs up the stair core at the south-east corner." },
          { text: "The ramp out of the core takes you to the first floor landing.", reveals: ["FIRE-RSR-01"] },
        ],
        successMessage: "First floor landing valve, on the same riser you just charged.",
      },
      {
        id: "f3",
        mode: "select",
        prompt:
          "There is a server room on this floor. Before water goes anywhere near it, kill its supply. " +
          "Select the isolator.",
        validSelections: ["ELEC-ISO-217"],
        nearMisses: [
          {
            id: "ELEC-DB-01",
            diagnosis:
              "That is the whole board. It would drop the server room, and also the smoke vents and the " +
              "lift you may still want.",
          },
          {
            id: "CHW-VLV-217",
            diagnosis: "Wrong service — that is the chilled water to the CRAC, not its power.",
          },
        ],
        hints: [
          { text: "It is not in the room at risk. Isolators live with the board." },
          { text: "Ground floor, south-west corner — the switchroom.", reveals: ["ELEC-ISO-217"] },
        ],
        successMessage:
          "Padlockable isolator, labelled for Server room 217, two floors from the room it protects.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  construction: {
    id: "m-construction",
    role: "construction",
    author: "built-in",
    title: "Close out a coordination clash",
    brief:
      "The coordination review flagged a hard clash in the first floor corridor ceiling. " +
      "Go and look at it, then name both halves.",
    steps: [
      {
        id: "c1",
        mode: "reach",
        prompt: "Stand under the flagged zone in the first floor corridor.",
        startState: { walkTo: [6, L1, 16], facing: [30, L1, 16] },
        validDestination: { box: [[20, L1 - 1, 14], [30, L1 + 3, 18]] },
        hints: [{ text: "Middle of the corridor, roughly above the riser cupboard door." }],
        successMessage: "You are under it. Ceiling tiles out, both services visible.",
      },
      {
        id: "c2",
        mode: "select",
        prompt: "Select the duct in the clash.",
        startState: { sectionY: L1 + 3.9 },
        validSelections: ["DUCT-D12"],
        nearMisses: [
          { id: "CHW-BR-L1", diagnosis: "That is the other half of it. Take the duct first." },
        ],
        hints: [{ text: "600 × 500, running the length of the corridor." }],
        successMessage: "D12, off AHU-01, at the same level as the branch main.",
      },
      {
        id: "c3",
        mode: "select",
        prompt: "And the service it collides with.",
        validSelections: ["CHW-BR-L1"],
        nearMisses: [
          { id: "CHW-HDR-L0", diagnosis: "That is the ground floor header, a storey down." },
          { id: "HTG-RSR-01", diagnosis: "Heating, and vertical — it never meets the duct." },
        ],
        hints: [{ text: "It is the pipe feeding every terminal on this floor.", reveals: ["CHW-BR-L1"] }],
        successState: { highlight: [{ ids: ["DUCT-D12", "CHW-BR-L1"], tone: "bad" }] },
        successMessage: "DN80 branch main against a 600 × 500 duct, same 200 mm of void.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  commissioning: {
    id: "m-commissioning",
    role: "commissioning",
    author: "built-in",
    title: "Prove the air path to 217",
    brief:
      "Server room 217 is running warm and the contractor says the air is there. " +
      "Prove the path, unit by unit, before anyone believes a schedule.",
    steps: [
      {
        id: "g1",
        mode: "select",
        prompt: "Select the air handling unit that serves Server room 217.",
        startState: { camera: { position: [-6, 16, -6], target: [12, 5, 8] } },
        validSelections: ["AHU-01"],
        nearMisses: [
          {
            id: "AHU-02",
            diagnosis:
              "That one serves 214, 215 and 218. Easy mistake — they are identical units on the same slab.",
          },
        ],
        hints: [{ text: "Two units in the first floor plant room. Their schedules differ." }],
        successMessage: "AHU-01, 3.2 m³/s, scheduled for the server room.",
      },
      {
        id: "g2",
        mode: "select",
        prompt: "Follow its supply to the terminal unit for 217.",
        validSelections: ["VAV-217"],
        nearMisses: [
          { id: "DUCT-D12", diagnosis: "That is the duct between them, not the terminal." },
          { id: "DIFF-217", diagnosis: "That is the diffuser at the end of it — one step too far." },
        ],
        hints: [{ text: "Out of the unit, along the corridor void, then south into the room." }],
        successMessage: "VAV-217, set to 22 °C, fed from D12.",
      },
      {
        id: "g3",
        mode: "reach",
        prompt: "Go and stand under the diffuser it feeds.",
        startState: { walkTo: [21, L1, 16], facing: [21, L1, 26] },
        validDestination: { at: at("DIFF-217"), radius: 3 },
        hints: [{ text: "Server room 217, south side of the first floor corridor." }],
        successMessage: "Under the diffuser. Now you can measure it instead of arguing about it.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  maintenance: {
    id: "m-maintenance",
    role: "maintenance",
    author: "built-in",
    title: "Isolate before you open",
    brief:
      "You are booked to pull the coil on VAV-217. You have never been in this building. " +
      "Get there, find your access, and make it safe before you touch anything.",
    steps: [
      {
        id: "n1",
        mode: "reach",
        prompt: "Get to Server room 217.",
        startState: { walkTo: [2, 0, 16], facing: [20, 0, 16] },
        validDestination: { room: "ROOM-217" },
        hints: [
          { text: "First floor, south side. The ramp is in the stair core at the far end." },
        ],
        successMessage: "Server room 217.",
      },
      {
        id: "n2",
        mode: "select",
        prompt: "Select the access you will be working through.",
        startState: { sectionY: L1 + 3.9 },
        validSelections: ["ACCESS-PANEL-217"],
        nearMisses: [
          { id: "DIFF-217", diagnosis: "The diffuser comes out, but it is not the access panel." },
        ],
        hints: [{ text: "600 × 600, in the ceiling, next to the box itself.", reveals: ["ACCESS-PANEL-217"] }],
        successMessage: "The panel is directly under VAV-217. Ladder goes here.",
      },
      {
        id: "n3",
        mode: "select",
        prompt: "Before the panel comes off, isolate the water. Select the valve.",
        validSelections: ["CHW-VLV-217"],
        nearMisses: [
          {
            id: "CHW-VLV-L1",
            diagnosis:
              "That works, and it takes cooling off the whole first floor while you do a one-hour job.",
          },
          { id: "CHW-VLV-214", diagnosis: "Wrong room — that one is Room 214's terminal." },
        ],
        hints: [{ text: "There is a local valve in this room, on the CRAC feed." }],
        successMessage: "V-CHW-217. One room off, everyone else still cooled.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  operator: {
    id: "m-operator",
    role: "operator",
    author: "built-in",
    title: "Routes you need before you need them",
    brief:
      "Two routes and one control. Walk them now, so you are not reading a drawing at the time.",
    steps: [
      {
        id: "o1",
        mode: "reach",
        prompt:
          "Show me the safest route from the plant room to the loading dock. Walk it — " +
          "and do not cut through the switchroom.",
        startState: { walkTo: [7, 0, 7], facing: [7, 0, 16] },
        validDestination: { room: "DOCK" },
        avoidRooms: ["ELEC-L0"],
        hints: [
          { text: "Corridor the whole way. The shortcut through the switchroom is not a route." },
        ],
        successMessage: "Loading dock, without going anywhere near live switchgear.",
      },
      {
        id: "o2",
        mode: "select",
        prompt: "Someone is caught in the leveller. Select the control you hit.",
        validSelections: ["DOCK-ESTOP-01"],
        nearMisses: [
          { id: "DOCK-LEVELLER-01", diagnosis: "That is the leveller itself, not its stop." },
        ],
        hints: [{ text: "Wall-mounted, on the way in, where you can reach it while running." }],
        successMessage: "Latching mushroom head, by the door rather than by the plant.",
      },
      {
        id: "o3",
        mode: "reach",
        prompt: "Now take the evacuation route out and get to the assembly point.",
        validDestination: { at: at("MUSTER-01"), radius: 6 },
        hints: [{ text: "West along the corridor and out of the final exit." }],
        successMessage: "Assembly point. That is the route you would be asked to lead.",
      },
    ],
  },
}

export function missionFor(role: string): Mission | undefined {
  return MISSIONS[role]
}
