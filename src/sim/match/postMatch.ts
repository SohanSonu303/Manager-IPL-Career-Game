import type { CareerPlayer, Injury, InjuryKind } from '../career'
import { fitnessAfterMatch, formAfterMatch, overallRating } from '../player'
import { createRng, deriveSeed, pickWeighted, randInt, type Rng } from '../rng'
import type { BatterLine, BowlerLine, MatchState } from './types'

/** Max rating change from match grades per skill per season. */
export const SEASON_DEV_CAP = 4

export interface PlayerReport {
  id: string
  teamId: string
  batting: BatterLine | null
  bowling: BowlerLine | null
  /** Catches, stumpings and run-outs. */
  dismissalsMade: number
  battingGrade: number | null
  bowlingGrade: number | null
  /** Overall match grade, 0–100. */
  grade: number
  ratingChange: { batting: number; bowling: number }
  fitnessAfter: number
  formAfter: number
  injury: Injury | null
}

const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v))

/** 0–100. 45 for a run-a-ball 20; strike rate and getting out cheaply matter. */
export function battingGrade(line: BatterLine): number {
  const sr = line.balls > 0 ? (line.runs / line.balls) * 100 : 0
  let g = 45 + (line.runs - 20) * 0.9
  if (line.balls >= 6) g += (sr - 140) * 0.15
  if (line.out && line.runs < 10) g -= 8
  if (!line.out && line.runs >= 20) g += 4
  return Math.round(clamp(g))
}

/** 0–100. Wickets plus economy against the league rate, weighted by overs bowled. */
export function bowlingGrade(line: BowlerLine): number {
  const overs = line.legalBalls / 6
  const econ = overs > 0 ? line.runs / overs : 0
  const g = 50 + line.wickets * 13 + (9.7 - econ) * 5 * Math.min(1, overs / 4)
  return Math.round(clamp(g))
}

export function letterGrade(g: number): string {
  if (g >= 90) return 'A+'
  if (g >= 80) return 'A'
  if (g >= 65) return 'B'
  if (g >= 50) return 'C'
  if (g >= 35) return 'D'
  return 'F'
}

/** Grades for everyone who played, from the first two innings (super overs excluded). */
export function gradeMatch(
  state: MatchState,
): Omit<PlayerReport, 'ratingChange' | 'fitnessAfter' | 'formAfter' | 'injury'>[] {
  const main = state.innings.slice(0, 2)
  const made = new Map<string, number>()
  const fumbles = new Map<string, number>()
  for (const inn of main) {
    for (const e of inn.events) {
      const f = e.wicket?.fielderId
      if (f && e.wicket?.kind !== 'bowled' && e.wicket?.kind !== 'lbw')
        made.set(f, (made.get(f) ?? 0) + 1)
      // A dropped catch costs more than a misfield.
      const by = e.fumble?.fielderId
      if (by) fumbles.set(by, (fumbles.get(by) ?? 0) + (e.fumble?.kind === 'drop' ? 4 : 1))
    }
  }
  // The XI as it ended, plus a player replaced by the Impact Player (he played too).
  const playedBy = (sheet: (typeof state.sheets)[string]) => {
    const out = sheet.impact?.used?.outId
    return out && !sheet.battingOrder.includes(out)
      ? [...sheet.battingOrder, out]
      : sheet.battingOrder
  }
  return Object.values(state.sheets).flatMap((sheet) =>
    playedBy(sheet).map((id) => {
      const batInn = main.find((i) => i.battingTeamId === sheet.teamId)
      const bowlInn = main.find((i) => i.bowlingTeamId === sheet.teamId)
      const batted = batInn?.battedOrder.includes(id) ? (batInn.batting[id] ?? null) : null
      const bowled = bowlInn?.bowling[id] ?? null
      const bat = batted && (batted.balls > 0 || batted.out) ? battingGrade(batted) : null
      const bowl = bowled && bowled.legalBalls > 0 ? bowlingGrade(bowled) : null
      const fielding = (made.get(id) ?? 0) * 4 - (fumbles.get(id) ?? 0)
      const parts = [bat, bowl].filter((g): g is number => g !== null)
      const base =
        parts.length === 2 ? Math.max(...parts) * 0.7 + Math.min(...parts) * 0.3 : (parts[0] ?? 50)
      return {
        id,
        teamId: sheet.teamId,
        batting: batted,
        bowling: bowled,
        dismissalsMade: made.get(id) ?? 0,
        battingGrade: bat,
        bowlingGrade: bowl,
        grade: Math.round(clamp(base + fielding)),
      }
    }),
  )
}

/** Growth from good games slows with age; poor games cost a little at any age. */
function ratingStep(grade: number, age: number, rng: Rng): number {
  const signal = (grade - 50) / 50
  const ageFactor = age <= 23 ? 1 : age <= 28 ? 0.6 : age <= 32 ? 0.3 : 0.15
  const expected = signal > 0 ? 0.5 * signal * ageFactor : 0.25 * signal
  // Probabilistic rounding keeps ratings as integers with the right average change.
  return rng() < Math.abs(expected) ? Math.sign(expected) : 0
}

/** Severity mix and matches missed for each kind of injury. */
const INJURIES: Record<InjuryKind, { weight: number; matches: [number, number] }> = {
  minor: { weight: 70, matches: [1, 2] },
  serious: { weight: 24, matches: [3, 6] },
  longTerm: { weight: 6, matches: [8, 14] },
}

/** Injury chance rises when tired, with pace-bowling workload, and with age. */
export function injuryChance(
  fitnessAfter: number,
  oversBowled: number,
  pace: boolean,
  age: number,
): number {
  return (
    0.006 +
    0.03 * Math.max(0, (60 - fitnessAfter) / 60) +
    (pace ? 0.0025 * oversBowled : 0) +
    (age > 33 ? 0.004 : 0)
  )
}

/**
 * Post-match step for the two squads: grades, rating changes (capped per season and by
 * potential), fitness, injuries and form. Injured players who missed this match count
 * one match down. Returns the updated player list and a report per player who played.
 */
export function applyPostMatch(
  players: CareerPlayer[],
  state: MatchState,
  seed: number,
): { players: CareerPlayer[]; reports: PlayerReport[] } {
  const graded = new Map(gradeMatch(state).map((g) => [g.id, g]))
  const teamIds = new Set(Object.keys(state.sheets))
  const keepers = new Set(Object.values(state.sheets).map((s) => s.keeperId))
  const reports: PlayerReport[] = []
  const winner = state.result?.winnerId ?? null
  // Each squad's best eleven by rating: leaving one of them out hurts his morale.
  const deserving = new Set(
    [...teamIds].flatMap((t) =>
      players
        .filter((p) => p.teamId === t && !p.injury)
        .sort((a, b) => overallRating(b) - overallRating(a))
        .slice(0, 11)
        .map((p) => p.id),
    ),
  )
  const clampMorale = (v: number) => Math.max(0, Math.min(100, v))

  const updated = players.map((p) => {
    const g = graded.get(p.id)
    if (!g) {
      if (!p.teamId || !teamIds.has(p.teamId)) return p
      // A squad member who sat out: an injury heals by one match; a fit regular who
      // was dropped is unhappy about it.
      const left = p.injury ? p.injury.matchesOut - 1 : 0
      const morale = p.injury ? p.morale : clampMorale(p.morale - (deserving.has(p.id) ? 5 : 1))
      return {
        ...p,
        morale,
        injury: p.injury && left > 0 ? { ...p.injury, matchesOut: left } : null,
      }
    }
    const rng = createRng(deriveSeed(seed, 'post', p.id))
    const ratings = { ...p.ratings }
    const dev = { ...p.seasonDev }
    const change = { batting: 0, bowling: 0 }
    for (const skill of ['batting', 'bowling'] as const) {
      const grade = skill === 'batting' ? g.battingGrade : g.bowlingGrade
      if (grade === null) continue
      let step = ratingStep(grade, p.age, rng)
      if (step > 0 && overallRating(p) >= p.potential) step = 0
      if (Math.abs(dev[skill] + step) > SEASON_DEV_CAP) step = 0
      ratings[skill] = Math.max(1, Math.min(99, ratings[skill] + step))
      dev[skill] += step
      change[skill] = step
    }

    // Playing time: young players grow just from playing at this level.
    const expChance = p.age <= 23 ? 0.08 : p.age <= 27 ? 0.05 : p.age <= 31 ? 0.02 : 0
    if (rng() < expChance && overallRating({ role: p.role, ratings }) < p.potential) {
      const skill: 'batting' | 'bowling' =
        p.role === 'bowler'
          ? 'bowling'
          : p.role === 'allrounder' && rng() < 0.5
            ? 'bowling'
            : 'batting'
      if (dev[skill] + 1 <= SEASON_DEV_CAP) {
        ratings[skill] = Math.min(99, ratings[skill] + 1)
        dev[skill] += 1
        change[skill] += 1
      }
    }

    const oversBowled = (g.bowling?.legalBalls ?? 0) / 6
    const fitness = fitnessAfterMatch(p.fitness, {
      ballsFaced: g.batting?.balls ?? 0,
      oversBowled,
      keptWicket: keepers.has(p.id),
    })
    let injury: Injury | null = null
    if (
      rng() < injuryChance(fitness, oversBowled, p.bowlingType === 'pace' && oversBowled > 0, p.age)
    ) {
      const kind = pickWeighted(
        rng,
        (Object.keys(INJURIES) as InjuryKind[]).map((k) => [k, INJURIES[k].weight] as const),
      )
      const [min, max] = INJURIES[kind].matches
      injury = { kind, matchesOut: randInt(rng, min, max) }
    }
    const form = formAfterMatch(p.form, g.grade)
    const morale = clampMorale(p.morale + 2 + (winner === p.teamId ? 1 : winner ? -1 : 0))
    reports.push({ ...g, ratingChange: change, fitnessAfter: fitness, formAfter: form, injury })
    return { ...p, ratings, seasonDev: dev, fitness, form, injury, morale }
  })
  return { players: updated, reports }
}
