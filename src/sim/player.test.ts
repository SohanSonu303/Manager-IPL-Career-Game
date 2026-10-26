import { describe, expect, it } from 'vitest'
import { players } from '../data'
import type { Player } from '../data/types'
import {
  ageCurve,
  developRatings,
  driftForm,
  effectiveRating,
  fitnessAfterMatch,
  formAfterMatch,
  overallRating,
  potentialFor,
  streakAfterMatch,
  recoverFitness,
} from './player'
import { createRng } from './rng'

const ratingsInRange = (p: Pick<Player, 'ratings'>) =>
  Object.values(p.ratings).every((v) => Number.isInteger(v) && v >= 1 && v <= 99)

/** Average overall change over many simulated seasons at one age. */
function avgChange(age: number, potential = 99): number {
  const rng = createRng(age)
  const base: Pick<Player, 'role' | 'ratings' | 'potential' | 'age'> = {
    role: 'batter',
    ratings: { batting: 65, bowling: 20, fielding: 70 },
    potential,
    age,
  }
  let sum = 0
  for (let i = 0; i < 500; i++) {
    sum +=
      overallRating({ role: 'batter', ratings: developRatings(base, rng) }) - overallRating(base)
  }
  return sum / 500
}

describe('age curve', () => {
  it('grows young players, holds in prime, declines veterans', () => {
    expect(avgChange(19)).toBeGreaterThan(2.5)
    expect(Math.abs(avgChange(28))).toBeLessThan(0.6)
    expect(avgChange(36)).toBeLessThan(-2.5)
  })

  it('is non-increasing with age', () => {
    for (let a = 16; a < 42; a++) expect(ageCurve(a + 1)).toBeLessThanOrEqual(ageCurve(a))
  })

  it('stops growth at potential', () => {
    const rng = createRng(5)
    let p: Pick<Player, 'role' | 'ratings' | 'potential' | 'age'> = {
      role: 'batter',
      ratings: { batting: 60, bowling: 20, fielding: 70 },
      potential: 66,
      age: 18,
    }
    for (let season = 0; season < 6; season++) {
      p = { ...p, ratings: developRatings(p, rng), age: p.age + 1 }
      expect(overallRating(p)).toBeLessThanOrEqual(66 + 1) // rounding slack
    }
  })
})

describe('rating bounds', () => {
  it('every player stays in 1–99 over 25 seasons', () => {
    const rng = createRng(11)
    for (const start of players) {
      let p = { ...start }
      for (let season = 0; season < 25; season++) {
        p = { ...p, ratings: developRatings(p, rng), age: p.age + 1 }
        expect(ratingsInRange(p)).toBe(true)
      }
    }
  })

  it('potential is never below the starting overall', () => {
    for (const p of players) expect(p.potential).toBeGreaterThanOrEqual(overallRating(p))
    const rng = createRng(2)
    for (let i = 0; i < 200; i++) {
      const v = potentialFor(95, 17, rng)
      expect(v).toBeLessThanOrEqual(99)
      expect(v).toBeGreaterThanOrEqual(95)
    }
  })
})

describe('fitness and form', () => {
  it('a heavy match costs more fitness than a light one', () => {
    const light = fitnessAfterMatch(100, { ballsFaced: 5, oversBowled: 0, keptWicket: false })
    const heavy = fitnessAfterMatch(100, { ballsFaced: 40, oversBowled: 4, keptWicket: false })
    expect(heavy).toBeLessThan(light)
    expect(fitnessAfterMatch(5, { ballsFaced: 60, oversBowled: 4, keptWicket: true })).toBe(0)
  })

  it('recovery is capped at 100 and faster for young players', () => {
    expect(recoverFitness(98, 22)).toBe(100)
    expect(recoverFitness(50, 22)).toBeGreaterThan(recoverFitness(50, 36))
  })

  it('form moves towards grades and drifts back to neutral', () => {
    expect(formAfterMatch(50, 100)).toBeGreaterThan(50)
    expect(formAfterMatch(50, 0)).toBeLessThan(50)
    expect(driftForm(80, 30)).toBeLessThan(80)
    expect(driftForm(80, 30)).toBeGreaterThan(50)
  })

  it('effective rating: form ±10, streak ±1.5 a step, fatigue penalty below 70 fitness', () => {
    expect(effectiveRating(70, { fitness: 100, form: 50 })).toBe(70)
    expect(effectiveRating(70, { fitness: 100, form: 100 })).toBe(80)
    expect(effectiveRating(70, { fitness: 100, form: 0 })).toBe(60)
    expect(effectiveRating(70, { fitness: 40, form: 50 })).toBe(64)
    expect(effectiveRating(99, { fitness: 100, form: 100 })).toBe(99)
    expect(effectiveRating(70, { fitness: 100, form: 50, streak: 2 })).toBe(73)
    expect(effectiveRating(70, { fitness: 100, form: 50, streak: -3 })).toBe(65.5)
  })

  it('streak: big games heat it up, poor ones cool it, it fades back to level', () => {
    let s = 0
    for (let i = 0; i < 5; i++) s = streakAfterMatch(s, 80)
    expect(s).toBe(3)
    expect(streakAfterMatch(3, 50)).toBe(2)
    expect(streakAfterMatch(2, 20)).toBe(-1)
    expect(streakAfterMatch(-3, 10)).toBe(-3)
    expect(streakAfterMatch(-1, 60)).toBe(0)
    expect(streakAfterMatch(0, 50)).toBe(0)
  })
})
