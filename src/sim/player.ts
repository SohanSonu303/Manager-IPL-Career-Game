import type { Player, Ratings } from '../data/types'
import { gaussian, randInt, type Rng } from './rng'

const clamp = (v: number, min = 1, max = 99) => Math.max(min, Math.min(max, v))

/** Role-weighted overall rating, 1–99. This is pure ability; form and fitness are separate. */
export function overallRating(p: Pick<Player, 'role' | 'ratings'>): number {
  const { batting, bowling, fielding } = p.ratings
  let v: number
  switch (p.role) {
    case 'batter':
      v = 0.88 * batting + 0.12 * fielding
      break
    case 'wicketkeeper':
      v = 0.8 * batting + 0.2 * fielding
      break
    case 'bowler':
      v = 0.88 * bowling + 0.12 * fielding
      break
    case 'allrounder':
      // Rewards being good at both, without beating a specialist at their own skill.
      v = 0.45 * Math.max(batting, bowling) + 0.4 * Math.min(batting, bowling) + 0.15 * fielding + 4
      break
  }
  return Math.round(clamp(v))
}

// --- Potential and age curve -------------------------------------------------

/** Ceiling for a player's overall: young players get more room to grow. */
export function potentialFor(overall: number, age: number, rng: Rng): number {
  let room: number
  if (age <= 19) room = randInt(rng, 12, 22)
  else if (age <= 22) room = randInt(rng, 6, 14)
  else if (age <= 25) room = randInt(rng, 2, 8)
  else room = randInt(rng, 0, 3)
  return Math.round(clamp(overall + room))
}

/**
 * Expected yearly change of a main skill at a given age (before noise):
 * growth to 23, slower to 26, prime 27–30, decline from 31, faster from 35.
 */
export function ageCurve(age: number): number {
  if (age <= 20) return 4
  if (age <= 23) return 3
  if (age <= 26) return 1.5
  if (age <= 30) return 0
  if (age <= 32) return -1
  if (age <= 34) return -2
  return -3.5
}

/** Which ratings are the player's main skills (the ones that follow the age curve fully). */
function mainSkills(p: Pick<Player, 'role'>): (keyof Ratings)[] {
  switch (p.role) {
    case 'batter':
    case 'wicketkeeper':
      return ['batting']
    case 'bowler':
      return ['bowling']
    case 'allrounder':
      return ['batting', 'bowling']
  }
}

/**
 * One season of development, applied at season rollover with the player's age for the
 * season just played. Growth stops at `potential`; decline is not limited by it.
 */
export function developRatings(
  p: Pick<Player, 'role' | 'ratings' | 'potential' | 'age'>,
  rng: Rng,
): Ratings {
  const curve = ageCurve(p.age)
  const main = mainSkills(p)
  const next: Ratings = { ...p.ratings }
  for (const key of ['batting', 'bowling', 'fielding'] as const) {
    let delta: number
    if (main.includes(key)) delta = curve + gaussian(rng) * 1.5
    // Fielding drops a little faster than skill after 30.
    else if (key === 'fielding') delta = curve + (p.age > 30 ? -0.5 : 0) + gaussian(rng)
    else delta = curve * 0.3 + gaussian(rng) * 0.5
    next[key] = Math.round(clamp(p.ratings[key] + delta))
  }
  // Cap growth at potential: if the overall went past it, undo gains proportionally.
  const before = overallRating(p)
  const after = overallRating({ role: p.role, ratings: next })
  if (after > before && after > p.potential) {
    const keep = Math.max(0, p.potential - before) / (after - before)
    for (const key of ['batting', 'bowling', 'fielding'] as const) {
      const gain = next[key] - p.ratings[key]
      if (gain > 0) next[key] = Math.round(p.ratings[key] + gain * keep)
    }
  }
  return next
}

// --- Fitness and form --------------------------------------------------------

/** Match-to-match condition, kept in the career save (not in the static data). */
export interface Condition {
  /** 0–100. Drops with workload, recovers on rest days. */
  fitness: number
  /** 0–100, 50 = neutral. Moves towards recent match grades, drifts back to 50 when idle. */
  form: number
  /** Hot or cold streak over the last few matches, −3 to +3 (missing = 0). */
  streak?: number
}

export interface MatchLoad {
  ballsFaced: number
  oversBowled: number
  keptWicket: boolean
}

/** Fitness cost of one match: batting time, overs bowled, and fielding or keeping. */
export function fitnessAfterMatch(fitness: number, load: MatchLoad): number {
  const cost = load.ballsFaced * 0.08 + load.oversBowled * 2.5 + (load.keptWicket ? 5 : 3)
  return clamp(fitness - cost, 0, 100)
}

/** Daily recovery; younger players recover faster. */
export function recoverFitness(fitness: number, age: number, days = 1): number {
  const perDay = age < 27 ? 7 : age <= 33 ? 6 : 5
  return clamp(fitness + perDay * days, 0, 100)
}

/** Form moves a third of the way towards the match grade (0–100). */
export function formAfterMatch(form: number, grade: number): number {
  return clamp(form + 0.35 * (clamp(grade, 0, 100) - form), 0, 100)
}

export const STREAK_MAX = 3
/** Rating points per streak step. */
export const STREAK_STEP = 1.5

/** A big match heats the streak up, a poor one cools it, anything else lets it fade. */
export function streakAfterMatch(streak: number, grade: number): number {
  if (grade >= 72) return Math.min(STREAK_MAX, Math.max(0, streak) + 1)
  if (grade <= 35) return Math.max(-STREAK_MAX, Math.min(0, streak) - 1)
  return streak - Math.sign(streak)
}

/** Idle days pull form slowly back towards neutral. */
export function driftForm(form: number, days = 1, target = 50): number {
  return target + (form - target) * 0.985 ** days
}

/** Where form settles when a player isn't playing: happy players stay sharper. */
export const formTarget = (morale: number) => 50 + (morale - 50) * 0.15

/**
 * A skill as it plays today: ability adjusted by form (±5) and a penalty when tired
 * (below 70 fitness). Used by selection and, later, by the ball-by-ball sim.
 */
export function effectiveRating(skill: number, c: Condition): number {
  // In-form players play well above their rating (up to ±10), more on a hot streak.
  const formAdj = (c.form - 50) / 5 + (c.streak ?? 0) * STREAK_STEP
  const fatigue = c.fitness < 70 ? (70 - c.fitness) * 0.2 : 0
  return clamp(skill + formAdj - fatigue)
}
