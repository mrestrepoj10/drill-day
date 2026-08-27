import type {
  ElementRef,
  SpatialRegion,
  TrainingElement,
  TrainingRoom,
  TrainingStep,
  Vec3,
  Verdict,
} from "./schema"

/**
 * Marking, and only marking.
 *
 * Every function here is pure and deterministic: the same click on the same
 * step always produces the same verdict, with the same sentence. That is the
 * division of labour the whole idea rests on — the model decides whether the
 * answer is right, and the agent decides what to say about it. Swap the marking
 * for a language model and the learner can argue their way to a pass.
 */

export function insideRegion(
  point: Vec3,
  region: SpatialRegion,
  rooms: Map<string, TrainingRoom>,
): boolean {
  if (region.room) {
    const room = rooms.get(region.room)
    if (room && inBounds(point, room)) return true
  }
  if (region.box) {
    const [min, max] = region.box
    if (
      point[0] >= min[0] && point[0] <= max[0] &&
      point[1] >= min[1] && point[1] <= max[1] &&
      point[2] >= min[2] && point[2] <= max[2]
    ) {
      return true
    }
  }
  if (region.at && region.radius !== undefined) {
    if (Math.hypot(point[0] - region.at[0], point[2] - region.at[2]) <= region.radius) return true
  }
  return false
}

function inBounds(point: Vec3, room: TrainingRoom): boolean {
  const [minX, minZ, maxX, maxZ] = room.bounds
  return (
    point[0] >= minX && point[0] <= maxX && point[2] >= minZ && point[2] <= maxZ
  )
}

/** Which room a point is standing in, if any. Innermost match wins. */
export function roomAt(point: Vec3, rooms: TrainingRoom[], level: number): string | undefined {
  let best: TrainingRoom | undefined
  for (const room of rooms) {
    if (room.level !== level) continue
    if (!inBounds(point, room)) continue
    if (!best || area(room) < area(best)) best = room
  }
  return best?.id
}

function area(room: TrainingRoom): number {
  const [minX, minZ, maxX, maxZ] = room.bounds
  return (maxX - minX) * (maxZ - minZ)
}

/** Level index from a height, given a storey height. */
export function levelAt(y: number, storeyHeight: number, levels: number): number {
  return Math.max(0, Math.min(levels - 1, Math.floor((y + 0.5) / storeyHeight)))
}

/**
 * Marks a selection against a step.
 *
 * The three-way answer is the point. "Wrong" ends the thought; "near" starts
 * one, because it carries the reason the choice was defensible and the reason
 * it still fails.
 */
export function markSelection(
  step: TrainingStep,
  elementId: ElementRef,
  elements: Map<ElementRef, TrainingElement>,
): Verdict {
  const element = elements.get(elementId)
  const label = element?.name ?? elementId

  if (step.validSelections?.includes(elementId)) {
    return { kind: "correct", message: step.successMessage, element: elementId }
  }

  const near = step.nearMisses?.find((n) => n.id === elementId)
  if (near) {
    return {
      kind: "near",
      message: `${label} — close.`,
      diagnosis: near.diagnosis,
      element: elementId,
    }
  }

  // Same system as the answer is worth saying out loud even when unlisted:
  // the learner is in the right story, just the wrong sentence.
  const target = step.validSelections?.[0]
  const targetSystem = target ? elements.get(target)?.system : undefined
  if (element && targetSystem && element.system === targetSystem) {
    return {
      kind: "near",
      message: `${label} — right system.`,
      diagnosis: `That is ${element.system}, which is the system in question, but it is not the element this step is asking for.`,
      element: elementId,
    }
  }

  return {
    kind: "wrong",
    message: `${label} — not this one.`,
    diagnosis: element
      ? `${label} belongs to ${element.system}${element.room ? ` in ${element.room}` : ""}.`
      : undefined,
    element: elementId,
  }
}

/** Marks an arrival against a step's destination. */
export function markArrival(
  step: TrainingStep,
  point: Vec3,
  rooms: Map<string, TrainingRoom>,
): Verdict | undefined {
  if (!step.validDestination) return undefined
  if (!insideRegion(point, step.validDestination, rooms)) return undefined
  return { kind: "correct", message: step.successMessage }
}

/** True when the learner has entered somewhere the step told them to avoid. */
export function strayedInto(step: TrainingStep, room: string | undefined): string | undefined {
  if (!room || !step.avoidRooms?.length) return undefined
  return step.avoidRooms.includes(room) ? room : undefined
}

/**
 * Walks a system upstream. This is what makes "let's trace the riser together"
 * something the app can actually draw rather than just say.
 */
export function traceUpstream(
  elementId: ElementRef,
  elements: Map<ElementRef, TrainingElement>,
  limit = 12,
): TrainingElement[] {
  const chain: TrainingElement[] = []
  const seen = new Set<ElementRef>()
  let current = elements.get(elementId)
  while (current && chain.length < limit && !seen.has(current.id)) {
    seen.add(current.id)
    chain.push(current)
    current = current.feedsFrom ? elements.get(current.feedsFrom) : undefined
  }
  return chain
}

/** Everything fed by an element, directly or transitively. */
export function traceDownstream(
  elementId: ElementRef,
  elements: Map<ElementRef, TrainingElement>,
): TrainingElement[] {
  const out: TrainingElement[] = []
  const queue = [elementId]
  const seen = new Set<ElementRef>([elementId])
  while (queue.length) {
    const id = queue.shift()!
    for (const el of elements.values()) {
      if (el.feedsFrom === id && !seen.has(el.id)) {
        seen.add(el.id)
        out.push(el)
        queue.push(el.id)
      }
    }
  }
  return out
}
