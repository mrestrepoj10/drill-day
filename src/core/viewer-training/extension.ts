import type { AutodeskViewingGlobal, Vector3, Viewer3D } from "@layer0/viewer"
import {
  levelAt,
  markArrival,
  markSelection,
  roomAt,
  strayedInto,
  traceDownstream,
  traceUpstream,
} from "./evaluate"
import type {
  Decision,
  ElementRef,
  HighlightTone,
  Hint,
  Mission,
  TrainingElement,
  TrainingRoom,
  SelectionResult,
  TrainingSession,
  TrainingStep,
  Vec3,
  ViewerState,
} from "./schema"

export const TRAINING_EXTENSION_ID = "Layer0.ViewerTraining"

/**
 * The one thing the extension cannot do generically: turn an element id into
 * pixels. The host owns the mapping from ids to instances, so it hands the
 * extension these four calls and the extension stays model-agnostic.
 */
export interface TrainingRenderer {
  highlight(groups: { ids: ElementRef[]; tone: HighlightTone }[]): void
  clearHighlights(): void
  /** Selection is singular; hint and agent highlights remain independently additive. */
  setSelection(selection: { id: ElementRef; tone: HighlightTone } | null): void
  isolate(ids: ElementRef[] | null): void
  boundsOf(id: ElementRef): { position: Vec3; size: Vec3 } | undefined
  /**
   * Show or lift the suspended ceilings. A host without one can leave this
   * out; the extension only ever asks, and asks at the two moments where the
   * answer is obvious — you see a ceiling from underneath it, and never from
   * above.
   */
  setCeiling?(down: boolean): void
}

export interface TrainingWorld {
  elements: TrainingElement[]
  rooms: TrainingRoom[]
  storeyHeight: number
  levels: number
  /** Eye height for first-person navigation. */
  eyeHeight: number
}

/** The public face of the extension, once `viewer.getExtension` hands it back. */
export interface ViewerTraining {
  setWorld(world: TrainingWorld): void
  setRenderer(renderer: TrainingRenderer): void
  loadMission(mission: Mission): void
  restart(): void
  clear(): void

  toggleSelection(id: ElementRef): SelectionResult
  nextHint(): Hint | undefined
  advance(reason?: string): void
  coach(text: string, from?: "app" | "agent"): void

  guardTool(name: string): void
  applyViewerState(state: ViewerState): Promise<void>
  enterWalk(at?: Vec3, facing?: Vec3): Promise<void>
  exitWalk(): void
  setSection(y: number | null): void
  /** Lifts the ceiling tiles out of the grid, or drops them back in. */
  openCeiling(open: boolean): void
  goToLevel(level: number): Promise<void>

  element(id: ElementRef): TrainingElement | undefined
  elements(): TrainingElement[]
  rooms(): TrainingRoom[]
  upstream(id: ElementRef): TrainingElement[]
  downstream(id: ElementRef): TrainingElement[]

  replay(onFrame?: (index: number) => void): Promise<void>
  snapshot(): TrainingSession
  subscribe(fn: () => void): () => void
}

const EMPTY: TrainingSession = {
  version: 0,
  stepIndex: 0,
  status: "idle",
  attempts: 0,
  hintsUsed: 0,
  revealed: [],
  decisions: [],
  progress: [],
  level: 0,
  coaching: [],
  trail: [],
}

let registered = false

/**
 * `Layer0.ViewerTraining` — the scenario runtime, as a viewer extension.
 *
 * It holds the mission, marks every answer against `evaluate.ts`, keeps the
 * transcript that the end-of-session replay is built from, and owns the two
 * bits of viewer state a scenario needs: where the learner is standing, and
 * what they are allowed to reach for. Everything about *this* building lives in
 * the world the host sets; everything about *this* lesson lives in the mission.
 * Load it against any model and it works the same way.
 */
export function registerTrainingExtension(av: AutodeskViewingGlobal): void {
  if (registered) return
  registered = true

  class ViewerTrainingExtension extends av.Extension implements ViewerTraining {
    private world: TrainingWorld = { elements: [], rooms: [], storeyHeight: 4, levels: 1, eyeHeight: 1.7 }
    private byId = new Map<ElementRef, TrainingElement>()
    private roomById = new Map<string, TrainingRoom>()
    private renderer: TrainingRenderer | null = null

    private session: TrainingSession = { ...EMPTY }
    private listeners = new Set<() => void>()
    private stepOpenedAt = 0
    private lastSample: Vec3 | null = null
    private onCameraChange = () => this.sampleWalker()
    private walking = false
    private listeningForWalk = false
    private walkEpoch = 0

    load(): boolean {
      return true
    }

    unload(): boolean {
      this.exitWalk()
      return true
    }

    // --- wiring -----------------------------------------------------------

    setWorld(world: TrainingWorld): void {
      this.world = world
      this.byId = new Map(world.elements.map((e) => [e.id, e]))
      this.roomById = new Map(world.rooms.map((r) => [r.id, r]))
      this.emit()
    }

    setRenderer(renderer: TrainingRenderer): void {
      this.renderer = renderer
    }

    // --- mission lifecycle ------------------------------------------------

    loadMission(mission: Mission): void {
      this.exitWalk()
      this.lastSample = null
      this.setSection(null)
      this.session = {
        ...EMPTY,
        version: this.session.version + 1,
        mission,
        status: mission.steps.length ? "running" : "complete",
        progress: mission.steps.map((s) => ({
          stepId: s.id,
          attempts: 0,
          hintsUsed: 0,
          cleared: false,
        })),
        step: mission.steps[0],
      }
      this.stepOpenedAt = Date.now()
      this.coach(mission.brief, "app")
      void this.openStep(mission.steps[0])
      this.emit()
    }

    restart(): void {
      if (this.session.mission) this.loadMission(this.session.mission)
    }

    clear(): void {
      this.exitWalk()
      this.renderer?.clearHighlights()
      this.renderer?.setSelection(null)
      this.renderer?.isolate(null)
      this.setSection(null)
      this.session = { ...EMPTY, version: this.session.version + 1 }
      this.emit()
    }

    private async openStep(step: TrainingStep | undefined): Promise<void> {
      if (!step) return
      this.renderer?.clearHighlights()
      this.renderer?.setSelection(null)
      if (step.startState) await this.applyViewerState(step.startState)
    }

    /**
     * Moves to the next step, or ends the mission. `reason` is recorded so the
     * summary can tell "solved it" apart from "the coach moved them on".
     */
    advance(reason?: string): void {
      const s = this.session
      if (!s.mission || s.status !== "running") return
      const progress = s.progress[s.stepIndex]
      if (progress) {
        progress.cleared = true
        progress.seconds = Math.round((Date.now() - this.stepOpenedAt) / 1000)
      }
      const nextIndex = s.stepIndex + 1
      const next = s.mission.steps[nextIndex]
      if (next) this.renderer?.setSelection(null)
      this.session = {
        ...s,
        stepIndex: nextIndex,
        step: next,
        status: next ? "running" : "complete",
        attempts: 0,
        hintsUsed: 0,
        revealed: [],
        selection: next ? undefined : s.selection,
      }
      this.stepOpenedAt = Date.now()
      if (reason) this.coach(reason, "app")
      if (next) void this.openStep(next)
      // Keep the final correct component lit for the completion/debrief view.
      // A new mission or replay clears it explicitly.
      this.emit()
    }

    // --- marking ----------------------------------------------------------

    toggleSelection(id: ElementRef): SelectionResult {
      if (this.session.selection?.element === id) {
        this.renderer?.setSelection(null)
        this.session = { ...this.session, selection: undefined }
        this.record({ kind: "deselect", element: id })
        this.emit()
        return { action: "cleared", message: "Selection cleared." }
      }

      const step = this.session.step
      if (this.session.status === "running" && step?.mode !== "select") {
        return {
          action: "blocked",
          message: "This step is asking you to get somewhere, not to pick something.",
        }
      }

      if (!step || this.session.status !== "running") {
        const element = this.byId.get(id)
        this.session = { ...this.session, selection: { element: id } }
        this.renderer?.setSelection({ id, tone: "trace" })
        this.record({ kind: "inspect", element: id })
        this.emit()
        return {
          action: "selected",
          message: element ? `${element.name} · ${element.system}` : id,
        }
      }

      const verdict = markSelection(step, id, this.byId)
      this.session = {
        ...this.session,
        attempts: this.session.attempts + 1,
        selection: { element: id, verdict },
      }
      const progress = this.session.progress[this.session.stepIndex]
      if (progress) progress.attempts++
      this.record({ kind: "select", element: id, verdict })

      this.renderer?.setSelection({
        id,
        tone: verdict.kind === "correct" ? "good" : verdict.kind === "near" ? "near" : "bad",
      })
      if (verdict.kind === "correct") {
        if (step.successState) void this.applyViewerState(step.successState)
        this.advance()
      }
      this.emit()
      return { action: "selected", message: verdict.message, verdict }
    }

    /** Called from the camera listener as the learner walks. */
    private sampleWalker(): void {
      // Orbit, camera fly-to, level previews, and replay all emit the same
      // camera event as BimWalk. Only first-person training navigation is
      // allowed to mutate the learner's route or satisfy a reach step.
      if (!this.walking) return
      const nav = this.viewer.navigation
      const p = nav?.getPosition?.()
      if (!p) return
      const point: Vec3 = [p.x, p.y, p.z]
      if (this.lastSample && distance(this.lastSample, point) < 0.4) return
      this.lastSample = point

      const level = levelAt(point[1] - this.world.eyeHeight, this.world.storeyHeight, this.world.levels)
      const room = roomAt(point, this.world.rooms, level)
      const trail = [...this.session.trail, point].slice(-600)
      const wasRoom = this.session.room
      this.session = { ...this.session, position: point, room, level, trail }

      if (room && room !== wasRoom) {
        this.record({ kind: "enter", room, position: point })
      }

      const step = this.session.step
      if (step && this.session.status === "running") {
        const strayed = room !== wasRoom ? strayedInto(step, room) : undefined
        if (strayed) {
          this.record({
            kind: "stray",
            position: point,
            verdict: {
              kind: "wrong",
              message: `You have walked into ${this.roomById.get(strayed)?.name ?? strayed}.`,
              diagnosis: "This step asked you to keep out of it. Back out and find another way round.",
            },
          })
        }
        const arrival = markArrival(step, point, this.roomById)
        if (arrival) {
          this.record({ kind: "arrive", position: point, verdict: arrival })
          if (step.successState) void this.applyViewerState(step.successState)
          this.advance()
        }
      }
      this.emit()
    }

    nextHint(): Hint | undefined {
      const step = this.session.step
      if (!step) return undefined
      const hint = step.hints[this.session.hintsUsed]
      if (!hint) return undefined
      this.session = {
        ...this.session,
        hintsUsed: this.session.hintsUsed + 1,
        revealed: [...this.session.revealed, hint],
      }
      const progress = this.session.progress[this.session.stepIndex]
      if (progress) progress.hintsUsed++
      if (hint.reveals?.length) this.renderer?.highlight([{ ids: hint.reveals, tone: "ask" }])
      if (hint.view) void this.applyViewerState(hint.view)
      this.record({ kind: "hint" })
      this.emit()
      return hint
    }

    coach(text: string, from: "app" | "agent" = "agent"): void {
      this.session = {
        ...this.session,
        coaching: [...this.session.coaching, { at: Date.now(), from, text }].slice(-40),
      }
      this.emit()
    }

    /**
     * A step may name the tools it allows. Anything else is refused — which is
     * how "find the nearest isolation valve *without using search*" becomes a
     * rule the app enforces rather than an instruction the learner can ignore.
     */
    guardTool(name: string): void {
      const allowed = this.session.step?.allowedTools
      if (!allowed || allowed.includes(name)) return
      this.record({
        kind: "blocked",
        verdict: { kind: "blocked", message: `${name} is switched off for this step.` },
      })
      this.emit()
      throw new Error(
        `${name} is disabled on this step — working it out is the exercise. ` +
          `Allowed here: ${allowed.join(", ")}.`,
      )
    }

    private record(partial: Omit<Decision, "at" | "stepId">): void {
      const stepId = this.session.step?.id ?? "—"
      this.session = {
        ...this.session,
        decisions: [...this.session.decisions, { at: Date.now(), stepId, ...partial }],
      }
    }

    // --- viewer state -----------------------------------------------------

    async applyViewerState(state: ViewerState): Promise<void> {
      const { Vector3 } = av.Math
      if (state.isolate !== undefined) this.renderer?.isolate(state.isolate)
      if (state.sectionY !== undefined) this.setSection(state.sectionY)
      if (state.highlight) this.renderer?.highlight(state.highlight)
      if (state.walkTo) {
        await this.enterWalk(state.walkTo, state.facing)
      } else if (state.camera) {
        this.exitWalk()
        this.viewer.getCamera().setView({
          position: new Vector3(...state.camera.position),
          target: new Vector3(...state.camera.target),
          up: new Vector3(0, 1, 0),
        })
        this.viewer.refresh(true)
      }
    }

    /**
     * Hands navigation to `Autodesk.BimWalk`. On a runtime-built model this
     * still collides and still holds eye height — the walker raycasts the
     * rendered instances, so Scene API content is solid to it like any other.
     */
    async enterWalk(at?: Vec3, facing?: Vec3): Promise<void> {
      const { Vector3 } = av.Math
      const epoch = ++this.walkEpoch
      // A camera snap must never be observed as learner movement. Reattach
      // only after the first-person tool is active at the requested position.
      this.detachWalkListener()
      if (at) {
        const eye = new Vector3(at[0], at[1] + this.world.eyeHeight, at[2])
        const look = facing
          ? new Vector3(facing[0], facing[1] + this.world.eyeHeight, facing[2])
          : new Vector3(at[0] + 1, at[1] + this.world.eyeHeight, at[2])
        this.viewer.getCamera().setView({ position: eye, target: look, up: new Vector3(0, 1, 0) })
        this.lastSample = null
      }
      if (!this.walking) {
        try {
          // The page teaches WASD in the panel beside the model, so BimWalk's
          // own first-run dialog would land on top of the exercise saying the
          // same thing.
          this.viewer.setBimWalkToolPopup?.(false)
          const bimwalk = (await this.viewer.loadExtension("Autodesk.BimWalk")) as
            | { activate?: () => void }
            | undefined
          if (epoch !== this.walkEpoch) return
          bimwalk?.activate?.()
          this.walking = true
        } catch {
          // No BimWalk in this build: orbit still lets the learner look around,
          // and every other part of the scenario is unaffected.
        }
      }
      if (epoch !== this.walkEpoch) return
      if (this.walking) this.attachWalkListener()
      // Inside the building now, so the ceiling belongs over the learner's head.
      this.renderer?.setCeiling?.(true)
      this.viewer.refresh(true)
      this.sampleWalker()
    }

    openCeiling(open: boolean): void {
      this.renderer?.setCeiling?.(!open)
      this.viewer.refresh(true)
    }

    exitWalk(): void {
      this.walkEpoch++
      this.detachWalkListener()
      this.renderer?.setCeiling?.(false)
      if (!this.walking) return
      this.walking = false
      try {
        this.viewer.toolController?.deactivateTool("bimwalk")
      } catch {
        /* already gone */
      }
    }

    private attachWalkListener(): void {
      if (this.listeningForWalk) return
      const event = (av as unknown as { CAMERA_CHANGE_EVENT?: string }).CAMERA_CHANGE_EVENT
      if (!event) return
      this.viewer.addEventListener(event, this.onCameraChange)
      this.listeningForWalk = true
    }

    private detachWalkListener(): void {
      if (!this.listeningForWalk) return
      const event = (av as unknown as { CAMERA_CHANGE_EVENT?: string }).CAMERA_CHANGE_EVENT
      if (event) this.viewer.removeEventListener(event, this.onCameraChange)
      this.listeningForWalk = false
    }

    setSection(y: number | null): void {
      const V4 = (av.Math as unknown as { Vector4?: new (x: number, y: number, z: number, w: number) => unknown }).Vector4
      if (y === null || y === undefined) {
        this.viewer.setCutPlanes([])
      } else if (V4) {
        // LMV cuts the half-space where `n·p + d > 0`, so an up-pointing normal
        // with `d = -height` removes everything above the plane and leaves the
        // storey below it standing. (A down-pointing normal does the opposite,
        // which is how you end up looking at a roof.)
        this.viewer.setCutPlanes([new V4(0, 1, 0, -y)])
      }
      this.viewer.refresh(true)
    }

    async goToLevel(level: number): Promise<void> {
      const entry = this.world.rooms.find((r) => r.level === level)
      if (!entry) return
      const [minX, minZ, maxX, maxZ] = entry.bounds
      await this.enterWalk([
        (minX + maxX) / 2,
        level * this.world.storeyHeight,
        (minZ + maxZ) / 2,
      ])
    }

    // --- lookups ----------------------------------------------------------

    element(id: ElementRef): TrainingElement | undefined {
      return this.byId.get(id)
    }

    elements(): TrainingElement[] {
      return this.world.elements
    }

    rooms(): TrainingRoom[] {
      return this.world.rooms
    }

    upstream(id: ElementRef): TrainingElement[] {
      return traceUpstream(id, this.byId)
    }

    downstream(id: ElementRef): TrainingElement[] {
      return traceDownstream(id, this.byId)
    }

    // --- replay -----------------------------------------------------------

    /**
     * Flies the session back through itself: every pick and every arrival, in
     * order. The learner watches their own reasoning rather than reading a
     * score; the walked route remains available in the floor plan.
     */
    async replay(onFrame?: (index: number) => void): Promise<void> {
      const marks = this.session.decisions.filter((d) => d.verdict && d.kind !== "hint")
      if (!marks.length) return
      this.exitWalk()
      this.renderer?.isolate(null)
      const { Vector3 } = av.Math
      for (let i = 0; i < marks.length; i++) {
        const d = marks[i]
        onFrame?.(i)
        const at =
          d.position ??
          (d.element ? this.renderer?.boundsOf(d.element)?.position : undefined) ??
          undefined
        if (at) {
          // Cut just above whatever is being looked at. Without a section the
          // camera sits behind a partition and the replay is a tour of the
          // backs of walls.
          this.setSection(at[1] + 1.2)
          this.viewer.getCamera().setView({
            position: new Vector3(at[0] + 9, at[1] + 7, at[2] + 9),
            target: new Vector3(...at),
            up: new Vector3(0, 1, 0),
          })
          this.viewer.refresh(true)
        }
        if (d.element) {
          this.renderer?.setSelection({
            id: d.element,
            tone: d.verdict!.kind === "correct" ? "good" : d.verdict!.kind === "near" ? "near" : "bad",
          })
        }
        await wait(1400)
      }
      this.setSection(null)
      const selected = this.session.selection
      this.renderer?.setSelection(selected
        ? {
            id: selected.element,
            tone: selected.verdict?.kind === "correct"
              ? "good"
              : selected.verdict?.kind === "near"
                ? "near"
                : selected.verdict
                  ? "bad"
                  : "trace",
          }
        : null)
      onFrame?.(-1)
    }

    // --- store ------------------------------------------------------------

    snapshot(): TrainingSession {
      return this.session
    }

    subscribe(fn: () => void): () => void {
      this.listeners.add(fn)
      return () => this.listeners.delete(fn)
    }

    private emit(): void {
      this.session = { ...this.session, version: this.session.version + 1 }
      for (const fn of this.listeners) fn()
    }
  }

  av.theExtensionManager.registerExtension(TRAINING_EXTENSION_ID, ViewerTrainingExtension)
}

/** Loads the extension onto a viewer and hands back its public face. */
export async function loadTraining(
  av: AutodeskViewingGlobal,
  viewer: Viewer3D,
): Promise<ViewerTraining> {
  registerTrainingExtension(av)
  await viewer.loadExtension(TRAINING_EXTENSION_ID)
  return viewer.getExtension(TRAINING_EXTENSION_ID) as ViewerTraining
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export type { Vector3 }
