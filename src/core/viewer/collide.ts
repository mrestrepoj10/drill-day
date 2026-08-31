import * as THREE from "three"
import { Capsule } from "three/examples/jsm/math/Capsule.js"
import { Octree } from "three/examples/jsm/math/Octree.js"

export { Octree }

/**
 * First-person walk physics, ported from three.js' `games_fps` example.
 *
 * The demo used to walk on two ad-hoc probes — a per-axis box-overlap veto and
 * a downward raycast for the floor. That could not do slopes, clipped through
 * anything the ray happened to miss, and only climbed the stair because every
 * tread was deliberately named so the ground probe would find it. A capsule
 * resolved against an octree of the solid world is the canonical answer and
 * needs no naming tricks: the walker collides with whatever geometry is in the
 * tree, stands on whatever is flat enough, and slides along everything else.
 */

/** Metres per second squared. The example's value; a fall reads as a fall. */
const GRAVITY = 30

/**
 * Collision is resolved several times per frame. One 60 Hz step is far enough
 * to clip a stair nosing or a door reveal; five short ones are not.
 */
const STEPS_PER_FRAME = 5

/**
 * Exponential drag, per second. It is also what sets top speed: an
 * acceleration of `a` settles at `a / DAMPING`, which is how the walk and
 * sprint speeds below are turned into accelerations.
 */
const DAMPING = 4

/** Steering authority retained in mid-air, as a fraction of the ground value. */
const AIR_CONTROL = 0.32

/** Flatter than this is a floor; sheerer is a wall you slide along. */
const FLOOR_NORMAL_Y = 0.15

/** Below this the push-out is noise, and applying it only jitters the eye. */
const MIN_PUSH_OUT = 1e-10

/**
 * Speeds are BimWalk's, not the game's. This is a building at a purposeful
 * indoor pace, and the 3.4 m/s the old rig used crossed a plant room before
 * the learner could read a label.
 */
export const WALK_SPEED = 2
export const SPRINT_SPEED = 4

/** Player capsule radius — roughly shoulder width, and the step-over height. */
const RADIUS = 0.35

/** What a walker is steering this frame. Planar: pitch aims eyes, not feet. */
export interface WalkInput {
  /** −1 back … +1 forward. */
  forward: number
  /** −1 left … +1 right. */
  strafe: number
  /** Heading, in the rig's convention: +z is `yaw = π`. */
  yaw: number
  sprint: boolean
}

/**
 * Supplies the solid world to walk in. The host owns which geometry is solid
 * and when it is rebuilt; the rig only ever asks for the current tree, so
 * scene construction order cannot leave the walker in an empty world.
 */
export interface WalkWorld {
  /** The solid world, built on demand. Null while there is nothing to build. */
  walkOctree(): Octree | null
}

const scratch = new THREE.Vector3()

/** A capsule walker: position, momentum, and whether it is standing on
 * something. Everything is expressed through the eye point, because that is
 * what the camera and the training runtime both talk in. */
export class WalkBody {
  private capsule = new Capsule(new THREE.Vector3(), new THREE.Vector3(), RADIUS)
  private velocity = new THREE.Vector3()
  private onFloor = false

  /** True while the body has something under its feet. */
  get grounded(): boolean {
    return this.onFloor
  }

  /**
   * Teleports the body so its eye lands exactly on `eye`, dropping any
   * momentum. Every programmatic camera move goes through here, so a glide or
   * a `setView` can never be carried on by leftover velocity.
   */
  placeEye(eye: THREE.Vector3, eyeHeight: number): void {
    // The eye sits a radius above the capsule's top cap centre, so a 1.7 m
    // eye height is a capsule exactly 1.7 m tall standing on the floor.
    const height = Math.max(eyeHeight, RADIUS * 2 + 0.05)
    this.capsule.start.set(eye.x, eye.y - height + RADIUS, eye.z)
    this.capsule.end.set(eye.x, eye.y - RADIUS, eye.z)
    this.velocity.set(0, 0, 0)
    this.onFloor = false
  }

  /** Writes the current eye point into `out`. */
  readEye(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.capsule.end.x, this.capsule.end.y + RADIUS, this.capsule.end.z)
  }

  /** Adds momentum worth roughly `metres` of travel before drag eats it. */
  nudge(metres: number, input: WalkInput): void {
    const speed = metres * DAMPING
    this.accelerate(speed, input)
  }

  /** Advances `dt` seconds of walking, in short collided substeps. */
  step(dt: number, world: Octree | null, input: WalkInput): void {
    const sub = dt / STEPS_PER_FRAME
    for (let i = 0; i < STEPS_PER_FRAME; i++) {
      if (input.forward || input.strafe) {
        const speed = input.sprint ? SPRINT_SPEED : WALK_SPEED
        this.accelerate(sub * speed * DAMPING * (this.onFloor ? 1 : AIR_CONTROL), input)
      }
      this.integrate(sub, world)
    }
  }

  private accelerate(delta: number, input: WalkInput): void {
    const sin = Math.sin(input.yaw)
    const cos = Math.cos(input.yaw)
    // Normalised, so walking a diagonal is not a 40% shortcut.
    const length = Math.hypot(input.forward, input.strafe) || 1
    const forward = input.forward / length
    const strafe = input.strafe / length
    this.velocity.x += (sin * forward + cos * strafe) * delta
    this.velocity.z += (-cos * forward + sin * strafe) * delta
  }

  private integrate(dt: number, world: Octree | null): void {
    let damping = Math.exp(-DAMPING * dt) - 1
    if (!this.onFloor) {
      this.velocity.y -= GRAVITY * dt
      // Thin air resistance: a fall must not be braked like a stride.
      damping *= 0.1
    }
    this.velocity.addScaledVector(this.velocity, damping)
    this.capsule.translate(scratch.copy(this.velocity).multiplyScalar(dt))
    this.collide(world)
  }

  private collide(world: Octree | null): void {
    if (!world) {
      // Nothing to stand on yet. Hovering is wrong, but falling out of the
      // building because the collider was not ready is worse.
      this.onFloor = true
      this.velocity.y = 0
      return
    }
    const result = world.capsuleIntersect(this.capsule)
    this.onFloor = false
    if (!result) return
    this.onFloor = result.normal.y >= FLOOR_NORMAL_Y
    if (!this.onFloor) {
      // Cancel only the into-the-surface component, so a glancing contact
      // slides along the wall instead of stopping dead in the corridor.
      this.velocity.addScaledVector(result.normal, -result.normal.dot(this.velocity))
    }
    if (result.depth >= MIN_PUSH_OUT) {
      this.capsule.translate(result.normal.multiplyScalar(result.depth))
    }
  }
}

/**
 * Builds an octree over `meshes` without disturbing the scene graph.
 *
 * `Octree.fromGraphNode` wants one root and rebuilds itself on every call, so
 * feeding it a hand-picked list one mesh at a time would rebuild it once per
 * wall. Lightweight proxies sharing the same geometry and carrying the source
 * world matrix let the canonical path run exactly once.
 */
export function buildOctree(meshes: Iterable<THREE.Mesh>): Octree {
  const root = new THREE.Group()
  root.matrixAutoUpdate = false
  for (const mesh of meshes) {
    const proxy = new THREE.Mesh(mesh.geometry)
    proxy.matrixAutoUpdate = false
    // Both, deliberately: `matrixWorld` is what gets read, and three only
    // recomputes it from `matrix` when something flags it dirty — which
    // writing the matrix by hand does not do. Setting one without the other
    // works today by accident of that gate.
    proxy.matrix.copy(mesh.matrixWorld)
    proxy.matrixWorld.copy(mesh.matrixWorld)
    proxy.matrixWorldNeedsUpdate = false
    root.add(proxy)
  }
  return new Octree().fromGraphNode(root)
}
