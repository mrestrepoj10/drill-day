// The scenario schema.
//
// Deliberately generic: nothing here knows about valves, fire exits or ducts.
// A step names elements by id, a region by room or box, and the tools the
// learner is allowed to lean on — which is enough to express "find the nearest
// isolation valve without using search" and to mark the answer right or wrong
// without asking a model to judge it.

export type Vec3 = [number, number, number]

/** A reference to something in the model. On a translated design this is a dbId. */
export type ElementRef = string

export interface SpatialRegion {
  /** Any element tagged with this room id counts as "inside". */
  room?: string
  /** Axis-aligned bounds, [min, max], in model space. */
  box?: [Vec3, Vec3]
  /** Within `radius` metres of `at`, ignoring height. */
  at?: Vec3
  radius?: number
}

/** What the viewer should look like when a step opens or closes. */
export interface ViewerState {
  camera?: { position: Vec3; target: Vec3 }
  /** Drop the learner here in first person, at eye height. */
  walkTo?: Vec3
  /** Face this point after teleporting. */
  facing?: Vec3
  isolate?: ElementRef[]
  /** Horizontal section at this height, or null to clear. */
  sectionY?: number | null
  highlight?: { ids: ElementRef[]; tone: HighlightTone }[]
}

export type HighlightTone = "ask" | "good" | "near" | "bad" | "trace"

export interface Hint {
  text: string
  /** Elements to light up in the model when this hint is spent. */
  reveals?: ElementRef[]
  /** Move the camera as the hint lands. */
  view?: ViewerState
}

/** A wrong answer worth teaching from, rather than just rejecting. */
export interface NearMiss {
  id: ElementRef
  /** Why it is close but not right. Written by whoever authored the step. */
  diagnosis: string
}

export interface LearningCues {
  /** A fair candidate set to emphasize together, never a singular answer reveal. */
  elements?: ElementRef[]
  /** Broader spatial context to emphasize without drawing a route to the answer. */
  rooms?: string[]
}

export interface TrainingStep {
  id: string
  prompt: string
  /** Optional, immediately actionable wayfinding shown beside the objective. */
  guidance?: string
  /** What the learner is being asked to do, for the verdict copy. */
  mode: "select" | "reach"
  startState?: ViewerState
  validSelections?: ElementRef[]
  nearMisses?: NearMiss[]
  /** Optional authored cue set. Select steps otherwise use answers + near misses. */
  learningCues?: LearningCues
  validDestination?: SpatialRegion
  /** Rooms the route must not pass through. Checked as the learner walks. */
  avoidRooms?: string[]
  /**
   * Tools the learner (or their agent) may use on this step. Omitted means all
   * of them; naming a subset is how a step says "find it, don't search for it".
   */
  allowedTools?: string[]
  hints: Hint[]
  successState?: ViewerState
  successMessage: string
}

export interface Mission {
  id: string
  role: string
  title: string
  brief: string
  /** Who wrote it — a canned mission, or one an agent composed at runtime. */
  author: "built-in" | "agent"
  steps: TrainingStep[]
}

// --- the model the runtime is given ----------------------------------------

/** One addressable thing in the building. */
export interface TrainingElement {
  id: ElementRef
  name: string
  /** Discipline or system, e.g. "chilled water", "fire", "egress". */
  system: string
  room?: string
  level: number
  /** Centre of the element, in model space. */
  position: Vec3
  size: Vec3
  /** Free-form property set, as it would arrive from a property database. */
  props?: Record<string, string | number | boolean>
  /** Upstream element in the same system — what feeds this one. */
  feedsFrom?: ElementRef
}

export interface TrainingRoom {
  id: string
  name: string
  level: number
  /** Footprint bounds [minX, minZ, maxX, maxZ]. */
  bounds: [number, number, number, number]
}

// --- what comes back -------------------------------------------------------

export type VerdictKind = "correct" | "near" | "wrong" | "blocked"

export interface Verdict {
  kind: VerdictKind
  /** Shown to the learner. */
  message: string
  /** The extra sentence that turns a wrong answer into a lesson. */
  diagnosis?: string
  element?: ElementRef
}

/** The one element currently selected in the shared scene. */
export interface TrainingSelection {
  element: ElementRef
  /** Browsing selections have no verdict; exercise answers carry their mark. */
  verdict?: Verdict
}

export interface SelectionResult {
  action: "selected" | "cleared" | "blocked"
  message: string
  verdict?: Verdict
}

export interface Decision {
  at: number
  stepId: string
  kind: "select" | "inspect" | "deselect" | "arrive" | "hint" | "cue" | "blocked" | "stray" | "enter"
  element?: ElementRef
  room?: string
  position?: Vec3
  enabled?: boolean
  verdict?: Verdict
}

export interface StepProgress {
  stepId: string
  attempts: number
  hintsUsed: number
  /** Seconds from the step opening to it being cleared. */
  seconds?: number
  cleared: boolean
}

export interface TrainingSession {
  version: number
  mission?: Mission
  stepIndex: number
  step?: TrainingStep
  status: "idle" | "running" | "complete"
  attempts: number
  hintsUsed: number
  /** One shared switch for the authored cue layer in the plan and 3D scene. */
  learningCuesOn: boolean
  /** Hints already spent on this step, in order. */
  revealed: Hint[]
  /** Current scene selection. Replacing it never erases the decision history. */
  selection?: TrainingSelection
  decisions: Decision[]
  progress: StepProgress[]
  /** Where the learner is standing, and which room that is. */
  position?: Vec3
  room?: string
  level: number
  /** Coaching lines, from the app or from an agent. */
  coaching: { at: number; from: "app" | "agent"; text: string }[]
  /** Path the learner has walked, for the replay. */
  trail: Vec3[]
}

/**
 * Select steps emphasize the answer beside its meaningful near misses, so the
 * learner gets vocabulary and scale without being told which candidate wins.
 * A mission can replace that default when a smaller, fairer set is needed.
 */
export function learningCueElements(step: TrainingStep | undefined): ElementRef[] {
  if (!step) return []
  if (step.learningCues?.elements) {
    const authored = [...new Set(step.learningCues.elements)]
    return authored.length > 1 ? authored : []
  }
  if (step.mode !== "select") return []
  const candidates = [...new Set([
    ...(step.validSelections ?? []),
    ...(step.nearMisses ?? []).map((nearMiss) => nearMiss.id),
  ])]
  return candidates.length > 1 ? candidates : []
}

export function learningCueRooms(step: TrainingStep | undefined): string[] {
  return [...new Set(step?.learningCues?.rooms ?? [])]
}
