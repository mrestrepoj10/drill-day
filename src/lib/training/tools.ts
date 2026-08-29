import { schema, type ModelContextTool } from "@layer0/webmcp"
import type { Mission, TrainingStep, ViewerTraining } from "@layer0/viewer-training"
import { ELEMENT_BY_ID, LEVELS, ROOMS, STOREY } from "./facility"
import { MISSIONS, ROLES } from "./missions"

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface TrainingToolHooks {
  /** The extension, once the viewer has booted. */
  getTraining: () => ViewerTraining | null
  /** Runs the end-of-session replay and resolves when it finishes. */
  replay: () => Promise<void>
  /** Puts the page into the chosen role, so the panel and the mission agree. */
  setRole: (role: string) => void
}

/**
 * The building's Site tools.
 *
 * Two halves. The reads are how an agent gets to know a model it has never seen
 * — the catalogue, one element in detail, and the system either side of it —
 * which is what it needs to *write* a mission out of real elements rather than
 * inventing a plausible-sounding one. The writes are how it teaches: set the
 * exercise, spend a hint, move the camera, say something, move the learner on.
 *
 * What it cannot do is mark the answer. That belongs to the model.
 */
export function trainingTools({ getTraining, replay, setRole }: TrainingToolHooks): ModelContextTool<any>[] {
  const need = (): ViewerTraining => {
    const t = getTraining()
    if (!t) throw new Error("the viewer is still booting — try again in a moment")
    return t
  }

  /**
   * Every tool passes through the step's allow-list before it runs. A refusal
   * is part of the lesson, so the error the agent reads tells it what to do
   * *instead* — coach, don't retry.
   */
  const guard = (name: string): ViewerTraining => {
    const t = need()
    try {
      t.guardTool(name)
    } catch (cause) {
      const base = cause instanceof Error ? cause.message : String(cause)
      const instead = REFUSAL_GUIDANCE[name]
      throw new Error(instead ? `${base} ${instead}` : base)
    }
    return t
  }

  const describe = (id: string) => {
    const t = need()
    const element = t.element(id)
    if (!element) throw new Error(`no element "${id}" in this model`)
    return {
      id: element.id,
      name: element.name,
      system: element.system,
      room: element.room ? ROOMS.find((r) => r.id === element.room)?.name ?? element.room : undefined,
      level: element.level,
      position: element.position.map((n) => Math.round(n * 10) / 10),
      properties: element.props ?? {},
      fedBy: element.feedsFrom ? t.element(element.feedsFrom)?.name ?? element.feedsFrom : null,
      feeds: t.elements().filter((e) => e.feedsFrom === element.id).map((e) => e.name),
    }
  }

  return [
    {
      name: "training_get_session",
      title: "Read the session",
      description:
        "Where the learner is standing, which room that is, the step they are on and its exact wording, " +
        "how many attempts and hints they have spent, what they got wrong and why, and which tools this " +
        "step allows. Call it before you say anything — they move while you are thinking.",
      inputSchema: schema({}),
      annotations: { readOnlyHint: true },
      execute: () => {
        const t = need()
        const s = t.snapshot()
        const step = s.step
        return {
          status: s.status,
          mission: s.mission
            ? { id: s.mission.id, title: s.mission.title, role: s.mission.role, author: s.mission.author }
            : null,
          stepNumber: s.mission ? `${s.stepIndex + 1} of ${s.mission.steps.length}` : null,
          step: step
            ? {
                id: step.id,
                prompt: step.prompt,
                guidance: step.guidance,
                mode: step.mode,
                attempts: s.attempts,
                hintsUsed: s.hintsUsed,
                hintsLeft: step.hints.length - s.hintsUsed,
                toolsAllowedHere: step.allowedTools ?? "all",
              }
            : null,
          learner: {
            position: s.position?.map((n) => Math.round(n * 10) / 10),
            room: s.room ? ROOMS.find((r) => r.id === s.room)?.name ?? s.room : "outside",
            level: s.level,
            metresWalked: Math.round(pathLength(s.trail)),
            selectedElement: s.selection
              ? t.element(s.selection.element)?.name ?? s.selection.element
              : null,
          },
          recentDecisions: s.decisions.slice(-6).map((d) => ({
            step: d.stepId,
            kind: d.kind,
            element: d.element ? t.element(d.element)?.name ?? d.element : undefined,
            verdict: d.verdict?.kind,
            why: d.verdict?.diagnosis,
          })),
          coaching: s.coaching.slice(-4),
        }
      },
    },
    {
      name: "training_list_elements",
      title: "Browse the model",
      description:
        "The catalogue this building actually contains, filtered by system, room, level or a name " +
        "fragment. Use it to build a mission out of real elements. Steps that are testing wayfinding " +
        "switch it off.",
      inputSchema: schema({
        system: { type: "string", maxLength: 60, description: "e.g. chilled water, fire, egress, air, electrical" },
        room: { type: "string", maxLength: 60 },
        level: { type: "number", minimum: 0, maximum: LEVELS - 1 },
        nameContains: { type: "string", maxLength: 80 },
      }),
      annotations: { readOnlyHint: true },
      execute: (input: { system?: string; room?: string; level?: number; nameContains?: string }) => {
        const t = guard("training_list_elements")
        const q = (input.nameContains ?? "").toLowerCase()
        const rows = t
          .elements()
          .filter((e) => !input.system || e.system === input.system)
          .filter((e) => !input.room || e.room === input.room)
          .filter((e) => input.level === undefined || e.level === input.level)
          .filter((e) => !q || e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q))
          .map((e) => ({ id: e.id, name: e.name, system: e.system, room: e.room, level: e.level }))
        return {
          count: rows.length,
          systems: [...new Set(t.elements().map((e) => e.system))],
          rooms: ROOMS.map((r) => ({ id: r.id, name: r.name, level: r.level })),
          elements: rows,
        }
      },
    },
    {
      name: "training_inspect_element",
      title: "Inspect one element",
      description:
        "Full detail for a single element: its property set, the room and level it sits in, what feeds " +
        "it and what it feeds. Allowed on every step — knowing what a thing is has never been the " +
        "part worth withholding.",
      inputSchema: schema({ id: { type: "string", maxLength: 80 } }, ["id"]),
      annotations: { readOnlyHint: true },
      execute: ({ id }: { id: string }) => describe(id),
    },
    {
      name: "training_trace_system",
      title: "Trace a system",
      description:
        "Walks a system from an element back to its source, and forward to everything it serves. This " +
        "is what turns \"let's trace the riser together\" into something the model can answer.",
      inputSchema: schema({ id: { type: "string", maxLength: 80 } }, ["id"]),
      annotations: { readOnlyHint: true },
      execute: ({ id }: { id: string }) => {
        const t = guard("training_trace_system")
        if (!t.element(id)) throw new Error(`no element "${id}"`)
        return {
          upstream: t.upstream(id).map((e) => ({ id: e.id, name: e.name, room: e.room, level: e.level })),
          downstream: t.downstream(id).map((e) => ({ id: e.id, name: e.name, room: e.room, level: e.level })),
        }
      },
    },
    {
      name: "training_locate_element",
      title: "Find it for them",
      description:
        "Puts the camera on an element and lights it up. This is the shortcut a wayfinding step exists " +
        "to prevent, so it is the first tool a step switches off.",
      inputSchema: schema(
        {
          id: { type: "string", maxLength: 80 },
          alsoHighlight: { type: "array", maxItems: 12, items: { type: "string", maxLength: 80 } },
        },
        ["id"],
      ),
      execute: async ({ id, alsoHighlight = [] }: { id: string; alsoHighlight?: string[] }) => {
        const t = guard("training_locate_element")
        const element = t.element(id)
        if (!element) throw new Error(`no element "${id}"`)
        for (const other of alsoHighlight) {
          if (!t.element(other)) throw new Error(`no element "${other}"`)
        }
        const [x, y, z] = element.position
        await t.applyViewerState({
          camera: { position: [x + 7, y + 5, z + 7], target: [x, y, z] },
          highlight: [{ ids: [id, ...alsoHighlight], tone: "ask" }],
        })
        return { located: element.name, position: element.position }
      },
    },

    {
      name: "training_author_mission",
      title: "Write a mission",
      description:
        "Compose a mission out of elements that actually exist in this model. Every id is checked; a " +
        "step with `forbidSearch` runs with browsing and locating switched off. Near misses are the " +
        "point of the format — name the wrong answer a learner will reach for, and the sentence that " +
        "explains why it is wrong.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", minLength: 3, maxLength: 100 },
          brief: { type: "string", minLength: 10, maxLength: 600 },
          role: { type: "string", maxLength: 60 },
          steps: {
            type: "array",
            minItems: 1,
            maxItems: 6,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                prompt: { type: "string", minLength: 5, maxLength: 320 },
                guidance: { type: "string", minLength: 5, maxLength: 320 },
                mode: { type: "string", enum: ["select", "reach"] },
                selectIds: { type: "array", maxItems: 12, items: { type: "string", maxLength: 80 } },
                nearMisses: {
                  type: "array",
                  maxItems: 12,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      id: { type: "string", maxLength: 80 },
                      diagnosis: { type: "string", minLength: 5, maxLength: 400 },
                    },
                    required: ["id", "diagnosis"],
                  },
                },
                destinationRoom: { type: "string", enum: ROOMS.map((room) => room.id) },
                avoidRooms: {
                  type: "array",
                  maxItems: 8,
                  items: { type: "string", enum: ROOMS.map((room) => room.id) },
                },
                startAtRoom: { type: "string", enum: ROOMS.map((room) => room.id) },
                hints: { type: "array", maxItems: 5, items: { type: "string", maxLength: 260 } },
                successMessage: { type: "string", minLength: 3, maxLength: 320 },
                forbidSearch: { type: "boolean" },
              },
              required: ["prompt", "mode", "successMessage"],
            },
          },
        },
        required: ["title", "brief", "steps"],
      },
      execute: (input: AuthoredMission) => {
        const t = need()
        const mission = compile(input, t)
        t.loadMission(mission)
        setRole(mission.role)
        return {
          started: mission.title,
          steps: mission.steps.length,
          firstPrompt: mission.steps[0].prompt,
        }
      },
    },
    {
      name: "training_start_mission",
      title: "Start a role's mission",
      description:
        "Loads one of the built-in missions by role and drops the learner into its opening state.",
      inputSchema: schema(
        { role: { type: "string", enum: ROLES.map((r) => r.id) } },
        ["role"],
      ),
      execute: ({ role }: { role: string }) => {
        const mission = MISSIONS[role]
        if (!mission) throw new Error(`no built-in mission for "${role}"`)
        setRole(role)
        need().loadMission(mission)
        return { started: mission.title, brief: mission.brief, steps: mission.steps.length }
      },
    },
    {
      name: "training_give_hint",
      title: "Spend a hint",
      description:
        "Reveals the next hint on this step, in the order the step defines, and lights up whatever it " +
        "points at. Hints are counted against the step, so use one when the learner is stuck rather " +
        "than when you are.",
      inputSchema: schema({}),
      execute: () => {
        const t = guard("training_give_hint")
        const hint = t.nextHint()
        if (!hint) return { hint: null, note: "no hints left on this step" }
        return { hint: hint.text, revealed: hint.reveals ?? [] }
      },
    },
    {
      name: "training_say",
      title: "Say something to the learner",
      description:
        "Puts a line in the learner's panel, next to the model. Use it for the sentence that a verdict " +
        "cannot generate — why the mistake was reasonable, what to look at next, what this would cost " +
        "on a real site.",
      inputSchema: schema({ text: { type: "string", minLength: 1, maxLength: 500 } }, ["text"]),
      execute: ({ text }: { text: string }) => {
        guard("training_say").coach(text, "agent")
        return { said: text }
      },
    },
    {
      name: "training_set_view",
      title: "Move the learner",
      description:
        "Drops the learner into first person in a room, or pulls the camera back to an overview of the " +
        "whole building. It cannot point at an element — anything that says *where a thing is* lives in " +
        "training_locate_element, so that a step can switch off exactly one tool and mean it.",
      inputSchema: schema({
        walkToRoom: {
          type: "string",
          enum: ROOMS.map((room) => room.id),
          description: "Room id to drop the learner into, in first person",
        },
        overview: { type: "boolean", description: "Pull back to an outside view of the building" },
      }),
      execute: async (input: { walkToRoom?: string; overview?: boolean }) => {
        const t = guard("training_set_view")
        if (t.snapshot().status === "running" && t.snapshot().step?.mode === "reach") {
          throw new Error(
            "view shortcuts are disabled during a navigation objective — the learner must walk it. " +
              "Do not retry. Use training_say to describe the route, or training_give_hint if they are stuck.",
          )
        }
        if (input.walkToRoom) {
          const room = ROOMS.find((r) => r.id === input.walkToRoom)
          if (!room) throw new Error(`no room "${input.walkToRoom}"`)
          const [minX, minZ, maxX, maxZ] = room.bounds
          await t.enterWalk([(minX + maxX) / 2, room.level * STOREY, (minZ + maxZ) / 2])
          return { standingIn: room.name }
        }
        if (input.overview) {
          t.exitWalk()
          await t.applyViewerState({ camera: { position: [-14, 34, -12], target: [24, 4, 16] } })
          return { view: "overview" }
        }
        return { ok: true }
      },
    },
    {
      name: "training_cut_section",
      title: "Cut a section",
      description:
        "Horizontal section at a height in metres, so a ceiling void can be looked into without " +
        "pretending the ceiling is not there. Omit the height to put the building back together.",
      inputSchema: schema({ atHeightM: { type: "number", minimum: -1, maximum: LEVELS * STOREY + 2 } }),
      execute: ({ atHeightM }: { atHeightM?: number }) => {
        guard("training_cut_section").setSection(atHeightM ?? null)
        return { section: atHeightM ?? "cleared" }
      },
    },
    {
      name: "training_advance",
      title: "Move them on",
      description:
        "Marks the current step done and opens the next one. For when the learner has shown they " +
        "understand it and grinding on is not teaching them anything.",
      inputSchema: schema({ reason: { type: "string", maxLength: 240 } }),
      execute: ({ reason }: { reason?: string }) => {
        const t = guard("training_advance")
        t.advance(reason ?? "Moving on.")
        const s = t.snapshot()
        return { status: s.status, nextPrompt: s.step?.prompt ?? null }
      },
    },
    {
      name: "training_replay",
      title: "Replay the session",
      description:
        "Flies back through every decision the learner made, in order. The walked route stays visible " +
        "on the floor plan. Best used at the end, or when the same mistake has happened twice.",
      inputSchema: schema({}),
      execute: async () => {
        guard("training_replay")
        await replay()
        return { replayed: true }
      },
    },
  ]
}

// --- authoring -------------------------------------------------------------

interface AuthoredStep {
  prompt: string
  guidance?: string
  mode: "select" | "reach"
  selectIds?: string[]
  nearMisses?: { id: string; diagnosis: string }[]
  destinationRoom?: string
  avoidRooms?: string[]
  startAtRoom?: string
  hints?: string[]
  successMessage: string
  forbidSearch?: boolean
}

interface AuthoredMission {
  title: string
  brief: string
  role?: string
  steps: AuthoredStep[]
}

/**
 * What a refused tool's error tells the agent to do instead. Do not retry the
 * refused call — the refusal is the exercise working as designed.
 */
const REFUSAL_GUIDANCE: Record<string, string> = {
  training_locate_element:
    "Do not retry. Instead: describe the wayfinding signs the learner should follow, " +
    "inspect the element with training_inspect_element to coach from its properties, " +
    "or spend one of the step's hints with training_give_hint.",
  training_list_elements:
    "Do not retry. This step tests wayfinding, so browsing is off. Coach from what the " +
    "learner can see — training_inspect_element and training_trace_system remain available.",
  training_set_view:
    "Do not retry. The learner must move themselves on this step. Use training_say to " +
    "guide them verbally, or training_give_hint if they are stuck.",
  training_advance:
    "Do not retry. The learner has not earned this step yet — coach them toward it with " +
    "training_say or training_give_hint.",
  training_replay:
    "Do not retry. Replay is for after a decision is made. Keep coaching the current step.",
}

const SEARCHLESS = [
  "training_get_session",
  "training_inspect_element",
  "training_trace_system",
  "training_give_hint",
  "training_say",
  "training_cut_section",
]

/**
 * Turns the agent-facing shape into the runtime schema, checking as it goes.
 * An id that does not exist is refused here rather than failing silently when
 * the learner clicks the right thing and is told they are wrong.
 */
function compile(input: AuthoredMission, t: ViewerTraining): Mission {
  const roomIds = new Set(ROOMS.map((r) => r.id))
  const steps: TrainingStep[] = input.steps.map((step, i) => {
    const checkElement = (id: string) => {
      if (!ELEMENT_BY_ID.has(id)) throw new Error(`step ${i + 1}: no element "${id}" in this model`)
      return id
    }
    const checkRoom = (id: string) => {
      if (!roomIds.has(id)) throw new Error(`step ${i + 1}: no room "${id}" in this model`)
      return id
    }
    if (step.mode === "select" && !step.selectIds?.length) {
      throw new Error(`step ${i + 1}: a select step needs at least one id in selectIds`)
    }
    if (step.mode === "reach" && !step.destinationRoom) {
      throw new Error(`step ${i + 1}: a reach step needs a destinationRoom`)
    }
    const start = step.startAtRoom ? ROOMS.find((r) => r.id === checkRoom(step.startAtRoom!)) : undefined
    return {
      id: `a${i + 1}`,
      prompt: step.prompt,
      guidance: step.guidance,
      mode: step.mode,
      startState: start
        ? {
            walkTo: [
              (start.bounds[0] + start.bounds[2]) / 2,
              start.level * STOREY,
              (start.bounds[1] + start.bounds[3]) / 2,
            ],
          }
        : undefined,
      validSelections: step.selectIds?.map(checkElement),
      nearMisses: step.nearMisses?.map((n) => ({ id: checkElement(n.id), diagnosis: n.diagnosis })),
      validDestination: step.destinationRoom ? { room: checkRoom(step.destinationRoom) } : undefined,
      avoidRooms: step.avoidRooms?.map(checkRoom),
      allowedTools: step.forbidSearch ? SEARCHLESS : undefined,
      hints: (step.hints ?? []).map((text) => ({ text })),
      successMessage: step.successMessage,
    }
  })
  void t
  return {
    id: `agent-${Date.now()}`,
    role: input.role ?? "custom",
    title: input.title,
    brief: input.brief,
    author: "agent",
    steps,
  }
}

function pathLength(trail: { at: number; point: [number, number, number] }[]): number {
  let total = 0
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1].point
    const b = trail[i].point
    const d = Math.hypot(a[0] - b[0], a[2] - b[2])
    if (d < 6) total += d
  }
  return total
}
