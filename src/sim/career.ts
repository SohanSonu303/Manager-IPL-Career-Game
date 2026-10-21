import { players as basePlayers } from '../data'
import type { Player } from '../data/types'
import { nextDay, SEASON, type CalendarState } from './calendar'
import { developRatings, driftForm, recoverFitness, type Condition } from './player'
import { createRng, deriveSeed, randInt } from './rng'

export const START_YEAR = 2026

/** A player as stored in a career: static data plus current condition. */
export interface CareerPlayer extends Player, Condition {}

/**
 * Everything a career needs, as plain serializable data. Static data (teams, the season
 * schedule) is not stored. Size budget: squads, finances, standings and match summaries
 * only; ball-by-ball data stays in memory for the current match.
 */
export interface Career {
  /** Career seed. All randomness derives from it (see `deriveSeed`). */
  seed: number
  manager: { name: string; teamId: string }
  calendar: CalendarState
  players: CareerPlayer[]
}

export function newCareer(opts: { seed: number; managerName: string; teamId: string }): Career {
  const rng = createRng(deriveSeed(opts.seed, 'start-form'))
  return {
    seed: opts.seed,
    manager: { name: opts.managerName, teamId: opts.teamId },
    calendar: { year: START_YEAR, day: 0 },
    players: basePlayers.map((p) => ({ ...p, fitness: 100, form: randInt(rng, 40, 60) })),
  }
}

/** Daily upkeep: fitness recovers and form drifts towards neutral. */
function restDay(p: CareerPlayer): CareerPlayer {
  return { ...p, fitness: recoverFitness(p.fitness, p.age), form: driftForm(p.form) }
}

/**
 * Season rollover for the season that just ended: development by age curve, birthday,
 * fresh fitness, neutral form, one contract year used. Expiring contracts are handled in
 * Phase 7/8 (renewals, release to the market).
 */
export function seasonRollover(career: Career, endedYear: number): Career {
  return {
    ...career,
    players: career.players.map((p) => {
      const rng = createRng(deriveSeed(career.seed, 'develop', endedYear, p.id))
      return {
        ...p,
        ratings: developRatings(p, rng),
        age: p.age + 1,
        fitness: 100,
        form: 50,
        contract: p.contract && { ...p.contract, years: Math.max(0, p.contract.years - 1) },
      }
    }),
  }
}

/** Advance one day, rolling over into a new season after the season-end day. */
export function advanceDay(career: Career): Career {
  const { calendar, rolledOver } = nextDay(career.calendar)
  const rested = { ...career, calendar, players: career.players.map(restDay) }
  return rolledOver ? seasonRollover(rested, career.calendar.year) : rested
}

/** Advance day by day until a day with an event (a match day or season end). */
export function advanceToNextEvent(career: Career): Career {
  let c = advanceDay(career)
  while (!SEASON[c.calendar.day]?.event) c = advanceDay(c)
  return c
}
