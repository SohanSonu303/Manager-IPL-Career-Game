import { players as basePlayers } from '../data'
import type { Player } from '../data/types'
import type { Awards, FixtureResult, SeasonStat, StandingRow } from './league'
import type { NewsItem } from './news'
import { START_CONFIDENCE, START_REPUTATION, type Finish, type Objective } from './board'
import type { CalendarState } from './calendar'
import type { Aggression } from './match/types'
import { developRatings, driftForm, formTarget, recoverFitness, type Condition } from './player'
import { createRng, deriveSeed, randInt } from './rng'

export const START_YEAR = 2026

export type InjuryKind = 'minor' | 'serious' | 'longTerm'

export interface Injury {
  kind: InjuryKind
  /** Team matches still to miss. */
  matchesOut: number
}

/** A player as stored in a career: static data plus current condition. */
export interface CareerPlayer extends Player, Condition {
  injury: Injury | null
  /** 0–100. Falls when a good player is left out or the team loses; shows in form. */
  morale: number
  /** Rating change from match grades this season (capped; reset at rollover). */
  seasonDev: { batting: number; bowling: number }
}

export interface TransferLog {
  year: number
  kind: 'signed' | 'renewed' | 'released' | 'traded'
  playerId: string
  /** The club the player joined (or left, for a release). */
  teamId: string
  salary: number
}

export interface SeasonReview {
  year: number
  championId: string
  runnerUpId: string
  /** Final league table (compact). */
  table: Pick<StandingRow, 'teamId' | 'points' | 'nrr'>[]
  position: number
  finish: Finish
  objective: Objective
  objectiveMet: boolean
  awards: Awards
  message: string
  reputationAfter: number
  confidenceAfter: number
  /** Names of players who retired at the end of this season. */
  retired: string[]
}

/**
 * Everything a career needs, as plain serializable data. Static data (teams, the season
 * schedule, fixtures) is derived, not stored. Ball-by-ball data stays in memory for the
 * current match; only summaries are saved.
 */
export interface Career {
  /** Career seed. All randomness derives from it (see `deriveSeed`). */
  seed: number
  manager: { name: string; teamId: string; reputation: number; boardConfidence: number }
  calendar: CalendarState
  players: CareerPlayer[]
  season: {
    results: FixtureResult[]
    stats: Record<string, SeasonStat>
    objective: Objective
    /** Set on the season-end day. */
    review: SeasonReview | null
  }
  history: SeasonReview[]
  market: {
    /** Contract talks this window, per player. */
    talks: Record<string, { rounds: number; walkedAway: boolean; ask?: number }>
    log: TransferLog[]
  }
  status: 'active' | 'sacked'
  /** The manager's chosen XI (optional; auto-pick is used when missing or invalid). */
  lineup?: Lineup
  /** Club and league news, newest last (capped). */
  news: NewsItem[]
  /** Totals from finished seasons, per player. */
  careerStats: Record<string, SeasonStat>
}

export interface Lineup {
  /** 11 player ids in batting order. */
  battingOrder: string[]
  keeperId: string
  aggression: Aggression
}

export function newCareer(opts: {
  seed: number
  managerName: string
  teamId: string
  objective: Objective
}): Career {
  const rng = createRng(deriveSeed(opts.seed, 'start-form'))
  return {
    seed: opts.seed,
    manager: {
      name: opts.managerName,
      teamId: opts.teamId,
      reputation: START_REPUTATION,
      boardConfidence: START_CONFIDENCE,
    },
    calendar: { year: START_YEAR, day: 0 },
    players: basePlayers.map((p) => ({
      ...p,
      fitness: 100,
      form: randInt(rng, 40, 60),
      injury: null,
      morale: randInt(rng, 60, 75),
      seasonDev: { batting: 0, bowling: 0 },
    })),
    season: { results: [], stats: {}, objective: opts.objective, review: null },
    history: [],
    market: { talks: {}, log: [] },
    status: 'active',
    news: [],
    careerStats: {},
  }
}

/** Daily upkeep: fitness recovers and form drifts towards neutral. */
export function restDay(p: CareerPlayer): CareerPlayer {
  return {
    ...p,
    fitness: recoverFitness(p.fitness, p.age),
    form: driftForm(p.form, 1, formTarget(p.morale)),
  }
}

/**
 * A player's turn of the year: development by age curve, birthday, fresh fitness,
 * neutral form, healed, one contract year used.
 */
export function agePlayer(p: CareerPlayer, seed: number, endedYear: number): CareerPlayer {
  const rng = createRng(deriveSeed(seed, 'develop', endedYear, p.id))
  return {
    ...p,
    ratings: developRatings(p, rng),
    age: p.age + 1,
    fitness: 100,
    // Half of a player's form carries into the new season.
    form: 50 + (p.form - 50) * 0.5,
    // The off-season is months long; everyone starts the new season healed.
    injury: null,
    seasonDev: { batting: 0, bowling: 0 },
    contract: p.contract && { ...p.contract, years: Math.max(0, p.contract.years - 1) },
  }
}
