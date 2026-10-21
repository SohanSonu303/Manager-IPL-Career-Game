import type { BallEvent, BowlingDelivery, FieldSetting, Phase } from '@/sim/match/types'

/*
 * Field geometry shared by the 3D and 2D renderers. Units are metres; the origin is the
 * middle of the pitch. Screen coordinates: x to the right, y down. The striker stands at
 * the top end facing down the screen, so "straight" (0°) points down, the off side
 * (90°) points left, behind the keeper (180°) points up and the leg side (270°) right.
 */

export const PITCH_LENGTH = 20.12
export const PITCH_WIDTH = 3.05
/** The 30-yard circle. */
export const INNER_RING = 27.43
/** Stands start this far beyond the rope and are this deep. */
export const STANDS_GAP = 5
export const STANDS_DEPTH = 16

export interface Point {
  x: number
  y: number
}

export const STRIKER: Point = { x: 0, y: -PITCH_LENGTH / 2 + 1.2 }
export const NON_STRIKER: Point = { x: 1.4, y: PITCH_LENGTH / 2 - 1.2 }
export const BOWLER: Point = { x: -1.2, y: PITCH_LENGTH / 2 + 2 }
export const KEEPER: Point = { x: 0, y: STRIKER.y - 4 }

/** Unit vector for a shot angle (degrees clockwise from straight). */
export function direction(angle: number): Point {
  const r = (angle * Math.PI) / 180
  return { x: -Math.sin(r), y: Math.cos(r) }
}

/** Distance along a ray from `o` (inside the circle) to the circle of radius `r`. */
export function rayToCircle(o: Point, d: Point, r: number): number {
  const b = o.x * d.x + o.y * d.y
  const c = o.x * o.x + o.y * o.y - r * r
  return -b + Math.sqrt(Math.max(0, b * b - c))
}

const along = (o: Point, d: Point, t: number): Point => ({ x: o.x + d.x * t, y: o.y + d.y * t })

/**
 * Where a shot ends: a six lands in the stands, a four reaches the rope, anything else
 * stops short of the boundary.
 */
export function shotEnd(
  shot: NonNullable<BallEvent['shot']>,
  boundary: 4 | 6 | null,
  radius: number,
): Point {
  const d = direction(shot.angle)
  const toRope = rayToCircle(STRIKER, d, radius)
  if (boundary === 6)
    return along(
      STRIKER,
      d,
      toRope + Math.min(STANDS_DEPTH - 4, Math.max(4, shot.distance - radius)),
    )
  if (boundary === 4) return along(STRIKER, d, toRope)
  return along(STRIKER, d, Math.min(shot.distance, toRope - 2))
}

/** Metres from the batter's stumps where each kind of delivery pitches. */
const PITCHES_AT: Record<BowlingDelivery, number> = {
  fulltoss: 0.2,
  yorker: 0.7,
  full: 3,
  wideline: 4,
  slower: 5,
  good: 6.5,
  short: 8.5,
  longhop: 9.5,
  bouncer: 10.5,
}

/**
 * Where the ball pitched, for the pitch map. Wide ones land outside off (the off side is
 * to the left of the screen); a full toss is drawn at the batter's feet.
 */
export function pitchPoint(d: BowlingDelivery): Point {
  const x = d === 'wideline' || d === 'longhop' ? -1.3 : -0.25
  return { x, y: -PITCH_LENGTH / 2 + PITCHES_AT[d] }
}

/** Control point for a curved shot path (aerial shots bow more). */
export function shotControl(from: Point, to: Point, aerial: boolean): Point {
  const mx = (from.x + to.x) / 2
  const my = (from.y + to.y) / 2
  const dx = to.x - from.x
  const dy = to.y - from.y
  const bow = aerial ? 0.18 : 0.06
  return { x: mx - dy * bow, y: my + dx * bow }
}

/** Quadratic Bézier at t. */
export function bezier(a: Point, c: Point, b: Point, t: number): Point {
  const u = 1 - t
  return {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
  }
}

/**
 * Nine fielders (keeper and bowler are separate) for the phase, as [angle, metres from
 * the striker]; a distance of 0 means "on the boundary". Powerplay keeps two out, the
 * middle overs five, the death five with a different shape.
 */
const FIELDS: Record<Phase, [number, number][]> = {
  powerplay: [
    [158, 17],
    [95, 24],
    [60, 27],
    [20, 25],
    [340, 25],
    [298, 27],
    [262, 24],
    [205, 0],
    [148, 0],
  ],
  middle: [
    [95, 25],
    [60, 26],
    [20, 25],
    [265, 25],
    [55, 0],
    [12, 0],
    [348, 0],
    [302, 0],
    [205, 0],
  ],
  death: [
    [150, 28],
    [95, 25],
    [25, 26],
    [205, 25],
    [60, 0],
    [15, 0],
    [345, 0],
    [300, 0],
    [265, 0],
  ],
}

/** Boundary riders for each phase and field setting (powerplay rules allow two). */
const OUT: Record<Phase, Record<FieldSetting, number>> = {
  powerplay: { attacking: 1, balanced: 2, defensive: 2 },
  middle: { attacking: 3, balanced: 5, defensive: 5 },
  death: { attacking: 4, balanced: 5, defensive: 5 },
}

/**
 * Fielder positions for the phase and setting. Attacking brings riders into catching
 * positions; defensive also drops the ring fielders back to save the single.
 */
export function fielderPositions(
  phase: Phase,
  radius: number,
  setting: FieldSetting = 'balanced',
): Point[] {
  const base = FIELDS[phase]
  let out = base.filter(([, d]) => d === 0).length
  const want = OUT[phase][setting]
  const spots = base.map(([angle, dist]) => [angle, dist] as [number, number])
  // Bring riders in (from the end of the list) until the count matches.
  for (let i = spots.length - 1; i >= 0 && out > want; i--) {
    const s = spots[i] as [number, number]
    if (s[1] === 0) {
      s[1] = 22
      out--
    }
  }
  return spots.map(([angle, dist]) => {
    const d = direction(angle)
    const ring = setting === 'defensive' && dist > 0 && dist < 30 ? dist + 6 : dist
    const t = ring === 0 ? rayToCircle(STRIKER, d, radius) - 4 : ring
    return along(STRIKER, d, t)
  })
}

/** Index of the fielder nearest a point (who chases the ball). */
export function nearest(points: Point[], p: Point): number {
  let best = 0
  let bestD = Infinity
  points.forEach((q, i) => {
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}
