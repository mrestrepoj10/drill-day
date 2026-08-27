/**
 * Colour ramps. Both scenarios turn a scalar field into instance colour, and
 * that mapping is the whole visual argument — an agent's tool call is only
 * verifiable if the change it caused is legible at a glance.
 */

function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff
  const ag = (a >> 8) & 0xff
  const ab = a & 0xff
  const br = (b >> 16) & 0xff
  const bg = (b >> 8) & 0xff
  const bb = b & 0xff
  return (
    ((Math.round(ar + (br - ar) * t) << 16) |
      (Math.round(ag + (bg - ag) * t) << 8) |
      Math.round(ab + (bb - ab) * t)) >>>
    0
  )
}

/** Blends two hex colours; `t` = 0 gives `a`, 1 gives `b`. */
export function mixColor(a: number, b: number, t: number): number {
  return mix(a, b, Math.max(0, Math.min(1, t)))
}

function sample(stops: number[], t: number): number {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(x))
  return mix(stops[i], stops[i + 1], x - i)
}

/** Cool blue → white → alarm red. Used for temperature. */
const THERMAL = [0x2a6fdb, 0x38b6c9, 0x7fd1a8, 0xf2d16b, 0xef8a3c, 0xd93a2b]

/** Neutral greys for context/BIM geometry. */
export const CONTEXT_GREY = 0x9aa2ad

export function thermalColor(t: number): number {
  return sample(THERMAL, t)
}

/** Maps a temperature in °C onto the thermal ramp. */
export function tempColor(celsius: number, min = 18, max = 38): number {
  return thermalColor((celsius - min) / (max - min))
}

/** Distinct, evenly-spaced hues for proposal variants and program types. */
export function paletteColor(index: number): number {
  const hues = [0x4f8ff0, 0x63c9a8, 0xe0a34a, 0xc76fd0, 0xe8695f, 0x5bbcd6]
  return hues[index % hues.length]
}

/** Lightens or darkens a hex colour; `amount` in [-1, 1]. */
export function shade(color: number, amount: number): number {
  return amount >= 0 ? mix(color, 0xffffff, amount) : mix(color, 0x000000, -amount)
}
