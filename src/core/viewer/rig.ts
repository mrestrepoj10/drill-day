import * as THREE from "three"

export type Vec3 = [number, number, number]

export interface RigView {
  position: Vec3
  target: Vec3
  up?: Vec3
}

/**
 * Camera control for the training viewer, in two modes.
 *
 * `orbit` — drag rotates about a target, wheel dollies, right/middle drag (or
 * two-finger drag) pans. `walk` — the camera is a person: drag turns the head,
 * WASD/arrow keys move on the floor plane at a fixed eye height. Walk is what
 * satisfies a `reach` step, so the two modes must never be conflated: an orbit
 * gesture cannot move the learner.
 *
 * The rig owns no render loop; it fires `onChange` and the host redraws.
 */
export class CameraRig {
  mode: "orbit" | "walk" = "orbit"

  /**
   * Walk-mode collision gate: return false to veto a step from `from` to
   * `to` (both at eye height). Steps are tested per axis, so a vetoed
   * diagonal still slides along the wall.
   */
  moveFilter: ((from: Vec3, to: Vec3) => boolean) | null = null

  /**
   * Walk-mode ground probe: given a plan position and the current eye height,
   * return the floor level under it (or null to keep the current height).
   * This is what carries the walker up a ramp and between storeys.
   */
  heightAt: ((x: number, z: number, eyeY: number) => number | null) | null = null

  private target = new THREE.Vector3()
  private sphere = new THREE.Spherical(30, 1.1, 0.9)
  /** Walk-mode look direction. */
  private yaw = 0
  private pitch = 0
  private keys = new Set<string>()
  private walkFrame = 0
  private lastStep = 0
  private changeListeners = new Set<() => void>()
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
    on("pointerdown", (e) => this.onPointerDown(e))
    on("pointermove", (e) => this.onPointerMove(e))
    on("pointerup", (e) => this.onPointerEnd(e))
    on("pointercancel", (e) => this.onPointerEnd(e))
    on("wheel", (e) => this.onWheel(e))
    on("contextmenu", (e) => e.preventDefault())
    on("keydown", (e) => this.onKey(e as KeyboardEvent, true), window)
    on("keyup", (e) => this.onKey(e as KeyboardEvent, false), window)
    on("blur", () => this.keys.clear(), window)
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.walkFrame)
    for (const off of this.detach) off()
  }

  onChange(fn: () => void): () => void {
    this.changeListeners.add(fn)
    return () => this.changeListeners.delete(fn)
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
    this.lastStep = performance.now()
    this.stepWalk()
  }

  exitWalk(): void {
    if (this.mode === "orbit") return
    this.mode = "orbit"
    cancelAnimationFrame(this.walkFrame)
    this.keys.clear()
    // Re-seed the orbit around a point a few metres ahead of the eye.
    this.target.copy(this.camera.position).add(this.lookDirection().multiplyScalar(8))
    this.sphere.setFromVector3(this.camera.position.clone().sub(this.target))
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

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (this.mode !== "walk") return
    const key = e.key.toLowerCase()
    if (!["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
      return
    }
    // Typing in a drawer input must not walk the learner across the plant room.
    const t = e.target as HTMLElement | null
    if (down && t && /^(input|textarea|select)$/i.test(t.tagName)) return
    e.preventDefault()
    if (down) {
      // A discrete tap still takes a small step; holding hands over to the
      // per-frame loop, which integrates real time.
      if (!e.repeat && !this.keys.has(key)) this.nudge(key, 0.35)
      this.keys.add(key)
    } else {
      this.keys.delete(key)
    }
  }

  private nudge(key: string, metres: number): void {
    const forward = key === "w" || key === "arrowup" ? 1 : key === "s" || key === "arrowdown" ? -1 : 0
    const strafe = key === "d" || key === "arrowright" ? 1 : key === "a" || key === "arrowleft" ? -1 : 0
    const sin = Math.sin(this.yaw)
    const cos = Math.cos(this.yaw)
    this.step((sin * forward + cos * strafe) * metres, (-cos * forward + sin * strafe) * metres)
    this.applyWalk()
    this.emit()
  }

  /** Applies a walk displacement through the collision gate, axis by axis. */
  private step(dx: number, dz: number): void {
    const p = this.camera.position
    const allowed = (tx: number, tz: number) =>
      !this.moveFilter || this.moveFilter([p.x, p.y, p.z], [tx, p.y, tz])
    if (dx && allowed(p.x + dx, p.z)) p.x += dx
    if (dz && allowed(p.x, p.z + dz)) p.z += dz
    const floor = this.heightAt?.(p.x, p.z, p.y)
    if (floor !== null && floor !== undefined) p.y = floor + this.eyeHeight
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
    if (forward || strafe) {
      const speed = 3.4 // metres per second, a purposeful indoor pace
      const sin = Math.sin(this.yaw)
      const cos = Math.cos(this.yaw)
      // Movement is planar: pitch aims the eyes, not the feet.
      this.step((sin * forward + cos * strafe) * speed * dt, (-cos * forward + sin * strafe) * speed * dt)
      this.applyWalk()
      this.emit()
    }
    this.walkFrame = requestAnimationFrame(this.stepWalk)
  }
}
