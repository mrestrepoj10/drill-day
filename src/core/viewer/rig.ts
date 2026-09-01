import * as THREE from "three"
import { WalkBody, type WalkInput, type WalkWorld } from "./collide"

export type Vec3 = [number, number, number]

export interface RigView {
  position: Vec3
  target: Vec3
  up?: Vec3
}

/** Radians of turn per pixel of pointer travel, while the pointer is locked. */
const LOOK_SENSITIVITY = 0.0022

/** How far a discrete key tap carries the walker before drag eats it. */
const TAP_METRES = 0.35

/**
 * Metres the eye must travel before the frame is worth redrawing. Resting on
 * a floor is a permanent sub-millimetre sink-and-push-out cycle, and the
 * viewer renders on demand — without a floor under the comparison, standing
 * still would repaint the building sixty times a second.
 */
const MOVED_EPSILON = 0.002

const MOVE_KEYS = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"]

/**
 * Camera control for the training viewer, in two modes.
 *
 * `orbit` — drag rotates about a target, wheel dollies, right/middle drag (or
 * two-finger drag) pans. `walk` — the camera is a person: a capsule with
 * momentum and gravity, resolved against the solid world the host supplies
 * (see `collide.ts`), looking with a locked pointer and moving on WASD/arrows.
 * Walk is what satisfies a `reach` step, so the two modes must never be
 * conflated: an orbit gesture cannot move the learner.
 *
 * The rig owns no render loop; it fires `onChange` and the host redraws.
 */
export class CameraRig {
  mode: "orbit" | "walk" = "orbit"

  /**
   * The solid world for walk collision. Asked for its octree every frame, so
   * the host can build it lazily and rebuild it whenever the scene changes.
   */
  walkWorld: WalkWorld | null = null

  private target = new THREE.Vector3()
  private sphere = new THREE.Spherical(30, 1.1, 0.9)
  /** Walk-mode look direction. */
  private yaw = 0
  private pitch = 0
  private keys = new Set<string>()
  private sprint = false
  private body = new WalkBody()
  private eye = new THREE.Vector3()
  /** Where the eye was when the last redraw was asked for. */
  private drawnEye = new THREE.Vector3()
  private walkFrame = 0
  private lastStep = 0
  private changeListeners = new Set<() => void>()
  private lockListeners = new Set<(locked: boolean) => void>()
  private lockedState = false
  /** A request is in flight: a refusal must still reach `onLock`. */
  private lockPending = false
  private detach: (() => void)[] = []
  private pointers = new Map<number, { x: number; y: number; button: number }>()
  /** Programmatic moves must not fight an in-flight user gesture; they win. */
  private disposed = false

  constructor(
    private camera: THREE.PerspectiveCamera,
    private dom: HTMLElement,
    /** Metres above the floor the walk camera stands. */
    public eyeHeight = 1.7,
  ) {
    this.apply()
    const on = <K extends keyof HTMLElementEventMap>(
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      target: HTMLElement | Window = dom,
    ) => {
      target.addEventListener(type as string, fn as EventListener)
      this.detach.push(() => target.removeEventListener(type as string, fn as EventListener))
    }
    const onDoc = <K extends keyof DocumentEventMap>(
      type: K,
      fn: (e: DocumentEventMap[K]) => void,
    ) => {
      document.addEventListener(type, fn as EventListener)
      this.detach.push(() => document.removeEventListener(type, fn as EventListener))
    }
    on("pointerdown", (e) => this.onPointerDown(e))
    on("pointermove", (e) => this.onPointerMove(e))
    on("pointerup", (e) => this.onPointerEnd(e))
    on("pointercancel", (e) => this.onPointerEnd(e))
    on("wheel", (e) => this.onWheel(e))
    on("contextmenu", (e) => e.preventDefault())
    on("keydown", (e) => this.onKey(e as KeyboardEvent, true), window)
    on("keyup", (e) => this.onKey(e as KeyboardEvent, false), window)
    on("blur", () => this.releaseKeys(), window)
    // A locked pointer delivers its movement to the document, not to the
    // element, and reports its own state only through the two events below.
    // The promise-returning `requestPointerLock()` is a proposed addition and
    // not universal, so it cannot be the channel a refusal arrives on.
    onDoc("mousemove", (e) => this.onLockedMove(e))
    onDoc("pointerlockchange", () => this.onLockChange())
    onDoc("pointerlockerror", () => this.onLockError())
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.walkFrame)
    this.releaseLook()
    for (const off of this.detach) off()
  }

  onChange(fn: () => void): () => void {
    this.changeListeners.add(fn)
    return () => this.changeListeners.delete(fn)
  }

  // --- pointer lock --------------------------------------------------------

  /** True while the pointer is locked to the viewport and driving the look. */
  get locked(): boolean {
    return this.lockedState
  }

  /**
   * Asks for the pointer, which is how a first-person look is meant to work.
   * The browser may refuse — notably right after the user pressed Escape,
   * where a re-request is specified to fail — and a refusal arrives at
   * `onLock` as `false` rather than being retried or swallowed.
   */
  requestLook(): void {
    if (this.lockedState || this.disposed) return
    this.lockPending = true
    try {
      const result: unknown = this.dom.requestPointerLock()
      // Reject here is the same refusal `pointerlockerror` reports; the event
      // is the channel, so this only stops an unhandled rejection.
      if (result instanceof Promise) result.catch(() => {})
    } catch {
      this.onLockError()
    }
  }

  releaseLook(): void {
    this.lockPending = false
    if (document.pointerLockElement === this.dom) document.exitPointerLock()
  }

  /** Notifies on every lock, unlock, and refusal. */
  onLock(fn: (locked: boolean) => void): () => void {
    this.lockListeners.add(fn)
    return () => this.lockListeners.delete(fn)
  }

  // --- views ---------------------------------------------------------------

  getView(): RigView {
    const t =
      this.mode === "walk"
        ? this.camera.position.clone().add(this.lookDirection())
        : this.target
    return {
      position: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      target: [t.x, t.y, t.z],
    }
  }

  setView(view: RigView): void {
    this.camera.position.set(...view.position)
    const target = new THREE.Vector3(...view.target)
    if (this.mode === "walk") {
      const d = target.clone().sub(this.camera.position)
      this.yaw = Math.atan2(d.x, -d.z)
      this.pitch = Math.asin(THREE.MathUtils.clamp(d.y / (d.length() || 1), -1, 1))
      // A programmatic move is a teleport, not a stride: the body goes with
      // the camera and arrives with no momentum to carry on with.
      this.body.placeEye(this.camera.position, this.eyeHeight)
      this.drawnEye.copy(this.camera.position)
      this.applyWalk()
    } else {
      this.target.copy(target)
      this.sphere.setFromVector3(this.camera.position.clone().sub(this.target))
      this.apply()
    }
    this.emit()
  }

  // --- modes ---------------------------------------------------------------

  enterWalk(): void {
    if (this.mode === "walk") return
    // Carry the current gaze into walk so the switch is invisible.
    const d = this.lookAtTargetDirection()
    this.yaw = Math.atan2(d.x, -d.z)
    this.pitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1))
    this.mode = "walk"
    this.body.placeEye(this.camera.position, this.eyeHeight)
    this.drawnEye.copy(this.camera.position)
    this.lastStep = performance.now()
    this.stepWalk()
  }

  exitWalk(): void {
    if (this.mode === "orbit") return
    this.mode = "orbit"
    cancelAnimationFrame(this.walkFrame)
    this.releaseKeys()
    this.releaseLook()
    // Re-seed the orbit around a point a few metres ahead of the eye.
    this.target.copy(this.camera.position).add(this.lookDirection().multiplyScalar(8))
    this.sphere.setFromVector3(this.camera.position.clone().sub(this.target))
    // Leaving first person is a camera change even when nothing follows it to
    // move the camera: whoever is drawing the walk controls has to hear that
    // there is no longer anyone on foot.
    this.emit()
  }

  // --- internals -----------------------------------------------------------

  private lookAtTargetDirection(): THREE.Vector3 {
    return this.target.clone().sub(this.camera.position).normalize()
  }

  private lookDirection(): THREE.Vector3 {
    return new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    )
  }

  private apply(): void {
    this.sphere.phi = THREE.MathUtils.clamp(this.sphere.phi, 0.05, Math.PI - 0.05)
    this.sphere.radius = THREE.MathUtils.clamp(this.sphere.radius, 1.5, 220)
    this.camera.position.setFromSpherical(this.sphere).add(this.target)
    this.camera.up.set(0, 1, 0)
    this.camera.lookAt(this.target)
  }

  private applyWalk(): void {
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.35, 1.35)
    this.camera.up.set(0, 1, 0)
    this.camera.lookAt(this.camera.position.clone().add(this.lookDirection()))
  }

  private emit(): void {
    for (const fn of this.changeListeners) fn()
  }

  private emitLock(): void {
    for (const fn of this.lockListeners) fn(this.lockedState)
  }

  private onLockChange(): void {
    this.lockPending = false
    const locked = document.pointerLockElement === this.dom
    if (locked === this.lockedState) return
    this.lockedState = locked
    this.emitLock()
  }

  private onLockError(): void {
    // The state has not changed — it was already unlocked — but a caller that
    // asked for the pointer has to hear that it did not get it, so this fires
    // regardless. Escape-then-request is the case that reaches here.
    if (!this.lockPending) return
    this.lockPending = false
    this.lockedState = false
    this.emitLock()
  }

  private onLockedMove(e: MouseEvent): void {
    if (!this.lockedState || this.mode !== "walk") return
    this.yaw += e.movementX * LOOK_SENSITIVITY
    this.pitch -= e.movementY * LOOK_SENSITIVITY
    this.applyWalk()
    this.emit()
  }

  private onPointerDown(e: PointerEvent): void {
    try {
      this.dom.setPointerCapture?.(e.pointerId)
    } catch {
      // Synthetic or already-released pointers can't be captured; tracking
      // them for the gesture still works.
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button })
  }

  private onPointerMove(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId)
    if (!p) return
    const dx = e.clientX - p.x
    const dy = e.clientY - p.y
    p.x = e.clientX
    p.y = e.clientY
    if (this.mode === "walk") {
      // Drag-to-look is the fallback for a refused lock. While the pointer is
      // locked its client coordinates are frozen anyway, so reading them
      // would only add noise to `movementX`.
      if (this.lockedState) return
      this.yaw += dx * 0.0042
      this.pitch -= dy * 0.0042
      this.applyWalk()
    } else if (p.button === 2 || p.button === 1 || this.pointers.size >= 2) {
      // Pan: keep the pointer under the same world point, roughly.
      const scale = this.sphere.radius / this.dom.clientHeight
      const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0)
      const upv = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1)
      this.target.addScaledVector(right, -dx * scale).addScaledVector(upv, dy * scale)
      this.apply()
    } else {
      this.sphere.theta -= dx * 0.006
      this.sphere.phi -= dy * 0.006
      this.apply()
    }
    this.emit()
  }

  private onPointerEnd(e: PointerEvent): void {
    this.pointers.delete(e.pointerId)
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault()
    if (this.mode === "walk") return
    this.sphere.radius *= Math.exp(e.deltaY * 0.0012)
    this.apply()
    this.emit()
  }

  private releaseKeys(): void {
    this.keys.clear()
    this.sprint = false
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (this.mode !== "walk") return
    const key = e.key.toLowerCase()
    // Shift is a modifier, not a movement key: it is never swallowed, so
    // Shift+Tab and friends still reach the drawers.
    if (key === "shift") {
      this.sprint = down
      return
    }
    if (!MOVE_KEYS.includes(key)) return
    // Typing in a drawer input must not walk the learner across the plant room.
    const t = e.target as HTMLElement | null
    if (down && t && /^(input|textarea|select)$/i.test(t.tagName)) return
    e.preventDefault()
    if (down) {
      this.sprint = e.shiftKey
      // A discrete tap still takes a small step; holding hands over to the
      // per-frame loop, which integrates real time. The tap is momentum, not
      // a teleport, so the collider still gets to veto walking into a wall.
      if (!e.repeat && !this.keys.has(key)) {
        this.body.nudge(TAP_METRES, this.input(...axesFor(key)))
      }
      this.keys.add(key)
    } else {
      this.keys.delete(key)
    }
  }

  private input(forward: number, strafe: number): WalkInput {
    return { forward, strafe, yaw: this.yaw, sprint: this.sprint }
  }

  private stepWalk = (): void => {
    if (this.disposed || this.mode !== "walk") return
    const now = performance.now()
    const dt = Math.min(0.05, (now - this.lastStep) / 1000)
    this.lastStep = now
    let forward = 0
    let strafe = 0
    if (this.keys.has("w") || this.keys.has("arrowup")) forward += 1
    if (this.keys.has("s") || this.keys.has("arrowdown")) forward -= 1
    if (this.keys.has("d") || this.keys.has("arrowright")) strafe += 1
    if (this.keys.has("a") || this.keys.has("arrowleft")) strafe -= 1
    this.body.step(dt, this.walkWorld?.walkOctree() ?? null, this.input(forward, strafe))
    // The camera always tracks the body, but the redraw is compared against
    // the last frame that was drawn, so a slow slide still accumulates into
    // one rather than being filtered away a fraction of a millimetre at a time.
    this.body.readEye(this.eye)
    this.camera.position.copy(this.eye)
    if (this.eye.distanceToSquared(this.drawnEye) > MOVED_EPSILON * MOVED_EPSILON) {
      this.drawnEye.copy(this.eye)
      this.applyWalk()
      this.emit()
    }
    this.walkFrame = requestAnimationFrame(this.stepWalk)
  }
}

/** The forward/strafe axes a single movement key stands for. */
function axesFor(key: string): [number, number] {
  if (key === "w" || key === "arrowup") return [1, 0]
  if (key === "s" || key === "arrowdown") return [-1, 0]
  if (key === "d" || key === "arrowright") return [0, 1]
  return [0, -1]
}
