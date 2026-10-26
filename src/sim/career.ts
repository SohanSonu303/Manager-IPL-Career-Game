import { players as basePlayers, teams } from '../data'
import type { Player } from '../data/types'
import type { Awards, FixtureResult, SeasonStat, StandingRow } from './league'
import type { NewsItem } from './news'
import { startingFunds, type LedgerEntry } from './finance'
import { START_CONFIDENCE, START_REPUTATION, type Finish, type Objective } from './board'
import type { CalendarState } from './calendar'
import type { MegaState } from './auction'
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
  /** A generated youth prospect (from the yearly intake), not a real player. */
  prospect?: boolean
}

export interface TransferLog {
  year: number
  kind: 'signed' | 'renewed' | 'released' | 'traded'
  playerId: string
  /** The club the player joined (or left, for a release). */
  teamId: string
  salary: number
}

/** Contract talks with one player (this window/season). */
export interface Talks {
  /** Offers he has turned down or countered. */
  rounds: number
  walkedAway: boolean
  /** The day talks broke down; they reopen a fortnight later. */
  walkedDay?: number
  /** His latest counter, per contract length. */
  asks?: Record<number, number>
  /** He has made his final offer: meet it or he walks. */
  final?: boolean
  /** The manager has decided not to renew him: he leaves when his contract ends. */
  letGo?: boolean
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
    /** Contract talks this season, per player. */
    talks: Record<string, Talks>
    log: TransferLog[]
    /** The free agents on offer this season (at most 14; rerolled every season). */
    freeAgentIds: string[]
    /** The manager's players on the transfer list: AI clubs make offers for them. */
    listed: string[]
    /** Trade counters each club has made this season (they stop at three). */
    tradeTalks?: Record<string, number>
  }
  /** The mega auction in progress (retention, then the auction), or null. */
  mega: MegaState | null
  status: 'active' | 'sacked'
  /** The manager's chosen XI (optional; auto-pick is used when missing or invalid). */
  lineup?: Lineup
  /** Club and league news, newest last (capped). */
  news: NewsItem[]
  /** Totals from finished seasons, per player. */
  careerStats: Record<string, SeasonStat>
  /** Achievements unlocked, by id, with when. */
  achievements: Record<string, { year: number; day: number }>
  /** Club funds per team (lakh): win bonuses and prize money, spent as cash in trades. */
  funds: Record<string, number>
  /** The manager's club's recent income and spending. */
  ledger: LedgerEntry[]
}

export interface Lineup {
  /** 11 player ids in batting order. */
  battingOrder: string[]
  keeperId: string
  aggression: Aggression
  /** The captain (optional: the most senior good player otherwise). */
  captainId?: string
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
    market: { talks: {}, log: [], freeAgentIds: [], listed: [] },
    mega: null,
    status: 'active',
    news: [],
    careerStats: {},
    achievements: {},
    funds: startingFunds(teams.map((t) => t.id)),
    ledger: [],
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
    streak: 0,
    // The off-season is months long; everyone starts the new season healed.
    injury: null,
    seasonDev: { batting: 0, bowling: 0 },
    contract: p.contract && { ...p.contract, years: Math.max(0, p.contract.years - 1) },
  }
}
