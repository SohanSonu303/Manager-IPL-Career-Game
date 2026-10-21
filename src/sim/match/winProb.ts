import table from './winprob.json'
import type { InningsState, MatchState } from './types'

/*
 * Win probability from a precomputed table (`npm run winprob`): the mean and spread of
 * the runs still to come from each (balls left, wickets lost) state, measured over
 * simulated innings. A chase is a normal tail; a first innings integrates over where the
 * total ends up. O(1) per call apart from a short sum, so it can run every ball.
 */

const W = table.wickets

function remaining(ballsLeft: number, wickets: number): { mean: number; sd: number } {
  const b = Math.max(0, Math.min(table.balls - 1, ballsLeft))
  const k = b * W + Math.max(0, Math.min(W - 1, wickets))
  return { mean: table.mean[k] ?? 0, sd: table.sd[k] ?? 0 }
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26). */
function phi(x: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(x) / Math.SQRT2))
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(x * x) / 2)
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2
}

/** Chance the chasing side scores `need` more runs (a tie counts half). */
export function chaseWinChance(need: number, ballsLeft: number, wickets: number): number {
  if (need <= 0) return 1
  if (ballsLeft <= 0 || wickets >= W) return 0
  const { mean, sd } = remaining(ballsLeft, wickets)
  const s = Math.max(1.5, sd)
  // P(rest ≥ need) + ½·P(rest = need − 1), with a continuity correction.
  const win = 1 - phi((need - 0.5 - mean) / s)
  const tie = phi((need - 0.5 - mean) / s) - phi((need - 1.5 - mean) / s)
  return Math.min(0.999, Math.max(0.001, win + tie / 2))
}

/** Chance the side batting first wins, from its innings so far. */
function firstInningsChance(inn: InningsState): number {
  const ballsLeft = inn.maxOvers * 6 - inn.legalBalls
  const { mean, sd } = remaining(ballsLeft, inn.wickets)
  const done = inn.complete || ballsLeft <= 0 || inn.wickets >= inn.maxWickets
  if (done || sd < 1) return 1 - chaseWinChance(inn.runs + 1, 120, 0)
  let p = 0
  let total = 0
  for (let z = -3; z <= 3; z += 0.25) {
    const w = Math.exp(-(z * z) / 2)
    const final = Math.max(inn.runs, Math.round(inn.runs + mean + z * sd))
    p += w * (1 - chaseWinChance(final + 1, 120, 0))
    total += w
  }
  return p / total
}

/** Probability that `teamId` wins the match from the current state (0…1). */
export function winProbability(state: MatchState, teamId: string): number {
  if (state.result) return state.result.winnerId === teamId ? 1 : state.result.winnerId ? 0 : 0.5
  const inn = state.innings[state.innings.length - 1]
  if (!inn) return 0.5
  // Super overs: too short for the table to say much.
  if (inn.maxOvers === 1) return 0.5
  let battingSide: number
  if (inn.target === null) battingSide = firstInningsChance(inn)
  else {
    const ballsLeft = inn.maxOvers * 6 - inn.legalBalls
    battingSide = chaseWinChance(inn.target - inn.runs, ballsLeft, inn.wickets)
  }
  return inn.battingTeamId === teamId ? battingSide : 1 - battingSide
}

/**
 * Win probability for `teamId` after every ball of the first two innings, starting
 * before the first ball. For the worm graph and the turning point.
 */
export function winProbabilityTrail(state: MatchState, teamId: string): number[] {
  const out: number[] = []
  const [first, second] = state.innings
  if (!first) return out
  const sim = (inn: InningsState, runs: number, wickets: number, legal: number, done: boolean) =>
    ({ ...inn, runs, wickets, legalBalls: legal, complete: done }) as InningsState
  const probe = (inn: InningsState) =>
    winProbability({ ...state, result: null, innings: [inn] } as MatchState, teamId)
  out.push(probe(sim(first, 0, 0, 0, false)))
  for (const e of first.events)
    out.push(probe(sim(first, e.score.runs, e.score.wickets, e.score.legalBalls, false)))
  if (!second) return out
  const target = first.runs + 1
  for (const e of second.events) {
    const inn = sim(second, e.score.runs, e.score.wickets, e.score.legalBalls, false)
    const p = winProbability({ ...state, result: null, innings: [first, inn] }, teamId)
    out.push(e.score.runs >= target ? (second.battingTeamId === teamId ? 1 : 0) : p)
  }
  return out
}

/** The ball that swung the match most, as an index into first+second innings events. */
export function turningPoint(trail: number[]): { index: number; swing: number } | null {
  let best: { index: number; swing: number } | null = null
  for (let i = 1; i < trail.length; i++) {
    const swing = (trail[i] ?? 0) - (trail[i - 1] ?? 0)
    if (!best || Math.abs(swing) > Math.abs(best.swing)) best = { index: i - 1, swing }
  }
  return best
}
