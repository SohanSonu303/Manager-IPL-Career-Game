/**
 * Season calendar. The schedule is derived (same every season), so the save only stores
 * `{ year, day }`. Fixtures (who plays whom on each round) come in Phase 8.
 */

/** League rounds per season. Open decision in TODO.md (14 vs 18); 14 for now. */
export const LEAGUE_ROUNDS = 14
const PRESEASON_DAYS = 7
const DAYS_PER_ROUND = 4

export const PLAYOFF_STAGES = ['qualifier1', 'eliminator', 'qualifier2', 'final'] as const
export type PlayoffStage = (typeof PLAYOFF_STAGES)[number]

/** Days between playoff matches, starting from the day after the last league round block. */
const PLAYOFF_GAPS: Record<PlayoffStage, number> = {
  qualifier1: 2,
  eliminator: 1,
  qualifier2: 2,
  final: 2,
}

export type SeasonPhase = 'preseason' | 'league' | 'playoffs' | 'offseason'

export type DayEvent =
  | { type: 'league'; round: number }
  | { type: 'playoff'; stage: PlayoffStage }
  | { type: 'seasonEnd' }

export interface SeasonDay {
  /** 0-based day of the season. */
  day: number
  /** 1-based week of the season. */
  week: number
  phase: SeasonPhase
  event: DayEvent | null
}

export interface CalendarState {
  year: number
  day: number
}

function buildSeason(): SeasonDay[] {
  const days: SeasonDay[] = []
  const push = (phase: SeasonPhase, event: DayEvent | null) =>
    days.push({ day: days.length, week: Math.floor(days.length / 7) + 1, phase, event })

  for (let i = 0; i < PRESEASON_DAYS; i++) push('preseason', null)
  for (let round = 1; round <= LEAGUE_ROUNDS; round++) {
    push('league', { type: 'league', round })
    for (let i = 1; i < DAYS_PER_ROUND; i++) push('league', null)
  }
  for (const stage of PLAYOFF_STAGES) {
    for (let i = 1; i < PLAYOFF_GAPS[stage]; i++) push('playoffs', null)
    push('playoffs', { type: 'playoff', stage })
  }
  push('offseason', { type: 'seasonEnd' })
  return days
}

/** The season schedule (identical every year). */
export const SEASON: readonly SeasonDay[] = buildSeason()

export function today(cal: CalendarState): SeasonDay {
  const d = SEASON[cal.day]
  if (!d) throw new Error(`Day ${cal.day} is outside the season`)
  return d
}

/** Move one day on; after the season-end day it rolls over to day 0 of the next year. */
export function nextDay(cal: CalendarState): { calendar: CalendarState; rolledOver: boolean } {
  if (cal.day + 1 < SEASON.length)
    return { calendar: { ...cal, day: cal.day + 1 }, rolledOver: false }
  return { calendar: { year: cal.year + 1, day: 0 }, rolledOver: true }
}

/** Days from `cal` to the next day with an event (at least 1). Wraps into next season. */
export function daysToNextEvent(cal: CalendarState): number {
  for (let d = cal.day + 1; d < SEASON.length; d++) if (SEASON[d]?.event) return d - cal.day
  const first = SEASON.findIndex((d) => d.event)
  return SEASON.length - cal.day + first
}

export function describeEvent(e: DayEvent): string {
  switch (e.type) {
    case 'league':
      return `League round ${e.round}`
    case 'playoff':
      return {
        qualifier1: 'Qualifier 1',
        eliminator: 'Eliminator',
        qualifier2: 'Qualifier 2',
        final: 'Final',
      }[e.stage]
    case 'seasonEnd':
      return 'Season end'
  }
}
