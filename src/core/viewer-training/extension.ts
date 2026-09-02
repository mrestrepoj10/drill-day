import type { LocalViewerHandle } from "@layer0/viewer"
import {
  levelAt,
  markArrival,
  markSelection,
  roomAt,
  strayedInto,
  traceDownstream,
  traceUpstream,
} from "./evaluate"
import { ANNOTATION_LIMIT, learningCueElements } from "./schema"
import type {
  Annotation,
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
  /** Contextual candidates shown together; separate from hints and verdicts. */
  setLearningCues(ids: ElementRef[]): void
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
  /**
   * The agent answering the step itself. Marked by exactly the same rules as a
   * learner's click, and deliberately not binding — see the implementation.
   */
  attempt(id: ElementRef): SelectionResult
  /** Pins a note from the agent onto an element in the shared scene. */
  annotate(id: ElementRef, note: string): Annotation
  /** The learner walked back to a note the agent pinned. */
  revisit(id: ElementRef): void
  /** Removes every pinned note. Returns how many there were. */
  clearAnnotations(): number
  nextHint(): Hint | undefined
  toggleLearningCues(): boolean
  advance(reason?: string): void
  coach(text: string, from?: "app" | "agent"): void

  guardTool(name: string): void
  applyViewerState(state: ViewerState): Promise<void>
  enterWalk(at?: Vec3, facing?: Vec3): Promise<void>
  exitWalk(): void
  setSection(y: number | null): void
  /** Lifts the ceiling tiles out of the grid, or drops them back in. */
  openCeiling(open: boolean): void
  /** Whether the tiles are currently lifted. */
  readonly ceilingOpen: boolean
  /** Called whenever that changes, by whoever changed it. */
  onCeiling(fn: () => void): () => void
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
  learningCuesOn: true,
  revealed: [],
  decisions: [],
  progress: [],
  level: 0,
  coaching: [],
  annotations: [],
  trail: [],
}

/**
 * `Layer0.ViewerTraining` — the scenario runtime.
 *
 * It holds the mission, marks every answer against `evaluate.ts`, keeps the
 * transcript that the end-of-session replay is built from, and owns the two
 * bits of viewer state a scenario needs: where the learner is standing, and
 * what they are allowed to reach for. Everything about *this* building lives in
 * the world the host sets; everything about *this* lesson lives in the mission.
 * Load it against any model and it works the same way.
 *
 * This was an LMV `Extension`; it is now a plain class over the three.js
 * viewer handle — same public face, no extension manager between it and the
 * camera.
 */
class ViewerTrainingRuntime implements ViewerTraining {
    private world: TrainingWorld = { elements: [], rooms: [], storeyHeight: 4, levels: 1, eyeHeight: 1.7 }
    private byId = new Map<ElementRef, TrainingElement>()
    private roomById = new Map<string, TrainingRoom>()
    private renderer: TrainingRenderer | null = null

    private session: TrainingSession = { ...EMPTY }
    private listeners = new Set<() => void>()
    // The ceiling is not part of the session — it is a way of looking, not a
    // fact about the drill — but the toolbar's toggle has to show the truth
    // even when the agent was the one who lifted the tiles.
    private ceilingListeners = new Set<() => void>()
    private ceiling = false
    private stepOpenedAt = 0
    private lastSample: Vec3 | null = null
    private onCameraChange = () => this.sampleWalker()
    private walking = false
    private offWalkListener: (() => void) | null = null
    private walkEpoch = 0

    constructor(private handle: LocalViewerHandle) {}

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
      this.renderer?.setLearningCues([])
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
      this.syncLearningCues()
      if (!step.startState) return

      // Someone who walked in is already standing where the next step wanted
      // them. Repositioning them anyway — cut or glide — takes the controls
      // away at the exact moment they succeeded, which is the one moment it
      // should feel like their own doing. Everything else in the step's
      // opening state still applies.
      if (this.walking && step.startState.walkTo && this.standingIn(step.startState.walkTo)) {
        const opening: ViewerState = { ...step.startState }
        delete opening.walkTo
        delete opening.facing
        await this.applyViewerState(opening)
        return
      }
      await this.applyViewerState(step.startState)
    }

    /** Whether the learner is already in the room that contains `point`. */
    private standingIn(point: Vec3): boolean {
      if (!this.session.room) return false
      const level = levelAt(point[1], this.world.storeyHeight, this.world.levels)
      return roomAt(point, this.world.rooms, level) === this.session.room
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
        // Notes are coaching for the step that is open, not a running margin.
        annotations: next ? [] : s.annotations,
      }
      this.stepOpenedAt = Date.now()
      if (reason) this.coach(reason, "app")
      if (next) void this.openStep(next)
      else this.renderer?.setLearningCues([])
      // Keep the final correct component lit for the completion/debrief view.
      // A new mission or replay clears it explicitly.
      this.emit()
    }

    // --- marking ----------------------------------------------------------

    toggleSelection(id: ElementRef): SelectionResult {
      if (this.session.selection?.element === id) {
        // Clearing by clicking again belongs to browsing. Once an answer has
        // been marked, a second click must not quietly un-answer it — in first
        // person the reticle is the only aim, people click twice to be sure,
        // and an even number of clicks was landing them back on nothing while
        // looking exactly like the click had never registered.
        const answered = this.session.selection.verdict
        if (answered) {
          // The verdict stands, but the click still happened, and every human
          // choice belongs in the one audit trail — including the second and
          // third click someone makes to be sure it registered.
          // No verdict on the record: the answer was already marked, and
          // anything that consumes verdicts — the stage feedback, and the
          // replay, which holds 1.4s on every verdict-bearing decision —
          // would otherwise treat a double click as a second graded moment.
          this.record({ kind: "reselect", by: "learner", element: id })
          this.emit()
          return { action: "selected", message: answered.message, verdict: answered }
        }
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
      this.record({ kind: "select", by: "learner", element: id, verdict })

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

    /**
     * The agent's own answer, marked by `evaluate.ts` — the same pure function,
     * the same three verdicts, the same authored diagnosis a learner would get.
     *
     * It does not clear the step. An agent that could answer on the learner's
     * behalf would be a solver, not a coach, and the drill would be over the
     * moment it was asked nicely. So the mark is real and public — it lands in
     * the feed under ChatGPT's name, near misses and all — and the learner
     * still has to make the call. Learner attempt counts are untouched for the
     * same reason: the debrief grades one person.
     */
    attempt(id: ElementRef): SelectionResult {
      const step = this.session.step
      if (this.session.status !== "running" || !step) {
        return { action: "blocked", message: "No mission is running, so there is nothing to answer yet." }
      }
      if (step.mode !== "select") {
        return {
          action: "blocked",
          message: "This step is a navigation objective — there is no component to answer with.",
        }
      }
      const element = this.byId.get(id)
      if (!element) {
        return { action: "blocked", message: `There is no element "${id}" in this model.` }
      }

      const verdict = markSelection(step, id, this.byId)
      this.record({ kind: "select", by: "agent", element: id, verdict })
      this.renderer?.highlight([
        {
          ids: [id],
          tone: verdict.kind === "correct" ? "good" : verdict.kind === "near" ? "near" : "bad",
        },
      ])
      this.emit()
      return { action: "selected", message: verdict.message, verdict }
    }

    annotate(id: ElementRef, note: string): Annotation {
      const element = this.byId.get(id)
      if (!element) throw new Error(`no element "${id}" in this model`)
      const entry: Annotation = { id, note, at: Date.now() }
      this.session = {
        ...this.session,
        // One note per element, newest last, and a ceiling so a chatty agent
        // cannot bury the building it is annotating.
        annotations: [...this.session.annotations.filter((a) => a.id !== id), entry].slice(-ANNOTATION_LIMIT),
      }
      this.record({ kind: "annotate", by: "agent", element: id, note })
      this.emit()
      return entry
    }

    revisit(id: ElementRef): void {
      // Walking back to a note is a choice the learner made about what to look
      // at again, so it belongs in the same trail as the clicks and the
      // arrivals. Without it the camera moves, the highlight changes and the
      // feed says nothing happened.
      this.record({ kind: "revisit", by: "learner", element: id })
      this.emit()
    }

    clearAnnotations(): number {
      const count = this.session.annotations.length
      if (!count) return 0
      this.session = { ...this.session, annotations: [] }
      this.emit()
      return count
    }

    /** Called from the camera listener as the learner walks. */
    private sampleWalker(): void {
      // Orbit, camera fly-to, level previews, and replay all emit the same
      // camera event as the walk rig. Only first-person training navigation is
      // allowed to mutate the learner's route or satisfy a reach step.
      if (!this.walking) return
      const p = this.handle.camera.position
      const point: Vec3 = [p.x, p.y, p.z]
      if (this.lastSample && distance(this.lastSample, point) < 0.4) return
      this.lastSample = point

      const level = levelAt(point[1] - this.world.eyeHeight, this.world.storeyHeight, this.world.levels)
      const room = roomAt(point, this.world.rooms, level)
      const trail = [...this.session.trail, { at: Date.now(), point }].slice(-600)
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

    toggleLearningCues(): boolean {
      const enabled = !this.session.learningCuesOn
      this.session = { ...this.session, learningCuesOn: enabled }
      this.syncLearningCues()
      this.record({ kind: "cue", enabled })
      this.emit()
      return enabled
    }

    private syncLearningCues(): void {
      this.renderer?.setLearningCues(
        this.session.learningCuesOn ? learningCueElements(this.session.step) : [],
      )
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
      if (state.isolate !== undefined) this.renderer?.isolate(state.isolate)
      if (state.sectionY !== undefined) this.setSection(state.sectionY)
      if (state.highlight) this.renderer?.highlight(state.highlight)
      if (state.walkTo) {
        await this.enterWalk(state.walkTo, state.facing)
      } else if (state.camera) {
        this.exitWalk()
        this.handle.rig.setView({
          position: state.camera.position,
          target: state.camera.target,
        })
        this.handle.requestRender()
      }
    }

    /**
     * Puts the camera rig into first-person walk: pointer looks, WASD moves on
     * the floor plane at eye height. There is no collision, and there does not
     * need to be — arrival and straying are judged on room bounds, not walls.
     */
    async enterWalk(at?: Vec3, facing?: Vec3): Promise<void> {
      const epoch = ++this.walkEpoch
      const wasWalking = this.walking
      // A camera snap must never be observed as learner movement. Reattach
      // only after the first-person rig is active at the requested position.
      this.detachWalkListener()
      this.handle.rig.enterWalk()
      if (at) {
        const eye: Vec3 = [at[0], at[1] + this.world.eyeHeight, at[2]]
        const look: Vec3 = facing
          ? [facing[0], facing[1] + this.world.eyeHeight, facing[2]]
          : [at[0] + 1, at[1] + this.world.eyeHeight, at[2]]
        // Someone already on their feet gets walked there. Cutting the camera
        // to a new spot in the same room reads as a glitch, because every
        // other metre they have covered was continuous — clearing a step
        // should not feel like being picked up and put down.
        if (wasWalking && !prefersReducedMotion()) {
          await this.glide(eye, look, epoch)
        } else {
          this.handle.rig.setView({ position: eye, target: look })
        }
        if (epoch !== this.walkEpoch) return
        this.lastSample = null
      }
      if (epoch !== this.walkEpoch) return
      this.walking = true
      this.attachWalkListener()
      // Inside the building now, so the ceiling belongs over the learner's head.
      this.renderer?.setCeiling?.(true)
      this.setCeilingOpen(false)
      this.handle.requestRender()
      this.sampleWalker()
    }

    openCeiling(open: boolean): void {
      this.renderer?.setCeiling?.(!open)
      this.handle.requestRender()
      this.setCeilingOpen(open)
    }

    get ceilingOpen(): boolean {
      return this.ceiling
    }

    onCeiling(fn: () => void): () => void {
      this.ceilingListeners.add(fn)
      return () => this.ceilingListeners.delete(fn)
    }

    private setCeilingOpen(open: boolean): void {
      if (this.ceiling === open) return
      this.ceiling = open
      for (const fn of this.ceilingListeners) fn()
    }

    exitWalk(): void {
      this.walkEpoch++
      this.detachWalkListener()
      // Lifted, but not "open" as far as the toggle is concerned: outside the
      // building the tiles are simply not in the way, and there is nothing for
      // a control that only means something on foot to be showing.
      this.renderer?.setCeiling?.(false)
      this.setCeilingOpen(false)
      if (!this.walking) return
      this.walking = false
      this.handle.rig.exitWalk()
    }

    /**
     * Eases the first person from where they stand to where the step wants
     * them, over about half a second.
     *
     * The walk listener is detached for the whole glide, so none of it lands
     * in the learner's route, satisfies the next objective, or counts as a
     * room they chose to enter. A newer call bumps the epoch and this bails on
     * its next frame, so two overlapping moves cannot fight over the camera.
     */
    private glide(eye: Vec3, look: Vec3, epoch: number): Promise<void> {
      const from = this.handle.rig.getView()
      const startEye = from.position
      const startDir = unit(from.target, from.position)
      const endDir = unit(look, eye)
      const startedAt = performance.now()

      return new Promise((resolve) => {
        let settled = false
        const finish = (snap: boolean) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          if (snap && epoch === this.walkEpoch) {
            this.handle.rig.setView({ position: eye, target: look })
            this.handle.requestRender()
          }
          resolve()
        }
        // requestAnimationFrame does not fire in a hidden or backgrounded tab.
        // A tool call must never hang waiting for a frame that is not coming,
        // so the deadline lands the learner where the step wanted them either
        // way — the animation is a courtesy, the destination is not.
        const timer = setTimeout(() => finish(true), GLIDE_MS + 250)

        const frame = () => {
          if (epoch !== this.walkEpoch) return finish(false)
          const t = Math.min(1, (performance.now() - startedAt) / GLIDE_MS)
          const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
          const position: Vec3 = [
            startEye[0] + (eye[0] - startEye[0]) * e,
            startEye[1] + (eye[1] - startEye[1]) * e,
            startEye[2] + (eye[2] - startEye[2]) * e,
          ]
          // Lerping the direction rather than the look-at point keeps the turn
          // even; the two points sit at different distances from the eye.
          const dir = normalize([
            startDir[0] + (endDir[0] - startDir[0]) * e,
            startDir[1] + (endDir[1] - startDir[1]) * e,
            startDir[2] + (endDir[2] - startDir[2]) * e,
          ])
          this.handle.rig.setView({
            position,
            target: [position[0] + dir[0], position[1] + dir[1], position[2] + dir[2]],
          })
          this.handle.requestRender()
          if (t >= 1) return finish(false)
          requestAnimationFrame(frame)
        }
        requestAnimationFrame(frame)
      })
    }

    private attachWalkListener(): void {
      this.offWalkListener ??= this.handle.rig.onChange(this.onCameraChange)
    }

    private detachWalkListener(): void {
      this.offWalkListener?.()
      this.offWalkListener = null
    }

    setSection(y: number | null): void {
      this.handle.setCutY(y ?? null)
    }

    async goToLevel(level: number): Promise<void> {
      const room = this.world.rooms.find((r) => r.level === level)
      if (!room) return
      const [minX, minZ, maxX, maxZ] = room.bounds
      // A room can name where it is standable; its centre may be a void.
      await this.enterWalk(
        room.entry ?? [
          (minX + maxX) / 2,
          level * this.world.storeyHeight,
          (minZ + maxZ) / 2,
        ],
      )
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
          this.handle.rig.setView({
            position: [at[0] + 9, at[1] + 7, at[2] + 9],
            target: at,
          })
          this.handle.requestRender()
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

/** Creates the training runtime over a booted viewer handle. */
export function loadTraining(handle: LocalViewerHandle): Promise<ViewerTraining> {
  return Promise.resolve(new ViewerTrainingRuntime(handle))
}

/** How long a step takes to walk the learner to where it wants them. */
const GLIDE_MS = 480

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

function unit(to: Vec3, from: Vec3): Vec3 {
  return normalize([to[0] - from[0], to[1] - from[1], to[2] - from[2]])
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / length, v[1] / length, v[2] / length]
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
