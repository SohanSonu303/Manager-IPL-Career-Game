import type { BallEvent, InningsState, MatchState } from './types'

/** 75 legal balls -> "12.3". */
export const oversText = (legalBalls: number) => `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`

export const strikeRate = (runs: number, balls: number) => (balls ? (runs / balls) * 100 : 0)
export const economy = (runs: number, legalBalls: number) =>
  legalBalls ? (runs / legalBalls) * 6 : 0

const nameOf = (state: MatchState, id: string | null) => (id ? (state.players[id]?.name ?? id) : '')

/** Scorecard dismissal text, e.g. "c Gill b Bumrah", "run out (Jadeja)", "not out". */
export function dismissalText(state: MatchState, inn: InningsState, batterId: string): string {
  const e = inn.events.find((ev) => ev.wicket?.playerOutId === batterId)
  if (!e?.wicket) return inn.battedOrder.includes(batterId) ? 'not out' : 'did not bat'
  const bowler = nameOf(state, e.bowlerId)
  const fielder = nameOf(state, e.wicket.fielderId)
  switch (e.wicket.kind) {
    case 'caught':
      return e.wicket.fielderId === e.bowlerId ? `c & b ${bowler}` : `c ${fielder} b ${bowler}`
    case 'bowled':
      return `b ${bowler}`
    case 'lbw':
      return `lbw b ${bowler}`
    case 'stumped':
      return `st ${fielder} b ${bowler}`
    case 'runOut':
      return `run out (${fielder})`
    case 'hitWicket':
      return `hit wicket b ${bowler}`
  }
}

/** Runs needed, balls left and required rate when chasing; null otherwise. */
export function chaseStatus(inn: InningsState) {
  if (inn.target === null) return null
  const need = Math.max(0, inn.target - inn.runs)
  const balls = inn.maxOvers * 6 - inn.legalBalls
  return { need, balls, rrr: balls > 0 ? (need / balls) * 6 : 0 }
}

/** Short label for the last-six-balls strip: "4", "6", "W", "•", "1wd", "nb". */
export function ballLabel(e: BallEvent): string {
  if (e.wicket) return 'W'
  if (e.extra?.kind === 'wide') return `${e.extra.runs}wd`
  if (e.extra?.kind === 'noball') return e.runs ? `${e.runs}nb` : 'nb'
  if (e.extra) return `${e.extra.runs}${e.extra.kind === 'bye' ? 'b' : 'lb'}`
  return e.runs === 0 ? '•' : String(e.runs)
}

/** Compact result for the save: scores and outcome only (no ball-by-ball). */
export interface MatchSummary {
  seed: number
  teams: [string, string]
  innings: { teamId: string; runs: number; wickets: number; legalBalls: number }[]
  winnerId: string | null
  margin: string
}

export function summarizeMatch(state: MatchState): MatchSummary {
  return {
    seed: state.seed,
    teams: state.order,
    innings: state.innings.map((i) => ({
      teamId: i.battingTeamId,
      runs: i.runs,
      wickets: i.wickets,
      legalBalls: i.legalBalls,
    })),
    winnerId: state.result?.winnerId ?? null,
    margin: state.result?.margin ?? '',
  }
}
