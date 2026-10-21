import { players, teams } from '../data'
import { currentInnings, simBall, type Match } from './match/engine'
import type { Selectable } from './match/selection'
import { setupMatch } from './match/setup'
import type { BallEvent, MatchState } from './match/types'
import { chaseWinChance } from './match/winProb'
import { createRng, deriveSeed, hashString, pick, randInt } from './rng'

/*
 * The Daily Challenge: one scenario per calendar day, the same for everyone. Two real
 * squads play an AI match up to a tight finish; then the manager takes one side and plays
 * the last few overs. Everything derives from the date, so the scenario (and the rest of
 * the match, given the same choices) is identical on every device.
 */

/** Day 1 of the Daily Challenge numbering. */
export const DAILY_EPOCH = '2026-01-01'

export interface ChallengeInfo {
  dateKey: string
  /** #1 on DAILY_EPOCH. */
  number: number
  homeId: string
  awayId: string
  /** The side the manager plays. */
  me: string
  role: 'chase' | 'defend'
  /** The situation at the handover. */
  need: number
  ballsLeft: number
  wicketsLeft: number
  /** Events in the second innings before the handover. */
  handoverAt: number
}

/** Local calendar date as YYYY-MM-DD. */
export function localDateKey(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const dayNumber = (key: string) => Math.round(Date.parse(`${key}T00:00:00Z`) / 86_400_000)

export function challengeNumber(dateKey: string): number {
  return dayNumber(dateKey) - dayNumber(DAILY_EPOCH) + 1
}

/** The previous calendar day's key. */
export function previousDay(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** Days in a row with a challenge played, ending today (or yesterday, if not played yet). */
export function streak(played: Iterable<string>, today: string): number {
  const days = new Set(played)
  let day = days.has(today) ? today : previousDay(today)
  let n = 0
  while (days.has(day)) {
    n++
    day = previousDay(day)
  }
  return n
}

const squads: Record<string, Selectable[]> = Object.fromEntries(
  teams.map((t) => [
    t.id,
    players.filter((p) => p.teamId === t.id).map((p) => ({ ...p, fitness: 100, form: 50 })),
  ]),
)

/**
 * Build the day's challenge: a match simulated up to a tight chase with 2–6 overs left,
 * handed over at an over break. Tries seeded variants until one is genuinely in the
 * balance (the chasing side's chance between 25% and 65%).
 */
export function dailyChallenge(dateKey: string): { info: ChallengeInfo; match: Match } {
  const base = hashString(`daily|${dateKey}`)
  for (let attempt = 0; attempt < 60; attempt++) {
    const rng = createRng(deriveSeed(base, 'pick', attempt))
    const home = pick(rng, teams).id
    const away = pick(
      rng,
      teams.filter((t) => t.id !== home),
    ).id
    const overs = randInt(rng, 2, 6)
    const role = rng() < 0.5 ? 'chase' : 'defend'
    const match = setupMatch({
      seed: deriveSeed(base, 'match', attempt),
      homeId: home,
      awayId: away,
      squads,
    })
    const { state } = match
    const handover = 120 - overs * 6
    while (!state.result) {
      const inn = currentInnings(state)
      if (inn.index === 1 && inn.legalBalls >= handover && !inn.complete) break
      simBall(state, match.rng)
    }
    if (state.result) continue
    const inn = currentInnings(state)
    const need = (inn.target ?? 0) - inn.runs
    const ballsLeft = inn.maxOvers * 6 - inn.legalBalls
    const wicketsLeft = inn.maxWickets - inn.wickets
    const p = chaseWinChance(need, ballsLeft, inn.wickets)
    if (inn.legalBalls % 6 !== 0 || need < 8 || wicketsLeft < 2 || p < 0.25 || p > 0.65) continue
    const me = role === 'chase' ? inn.battingTeamId : inn.bowlingTeamId
    const sheet = state.sheets[me]
    if (!sheet) continue
    // Hand over: the manager now makes his side's calls.
    sheet.ai = false
    state.interactive = true
    return {
      info: {
        dateKey,
        number: challengeNumber(dateKey),
        homeId: home,
        awayId: away,
        me,
        role,
        need,
        ballsLeft,
        wicketsLeft,
        handoverAt: inn.events.length,
      },
      match,
    }
  }
  throw new Error(`No daily challenge found for ${dateKey}`)
}

const runs = (n: number) => `${n} run${n === 1 ? '' : 's'}`

const short = (id: string) => teams.find((t) => t.id === id)?.short ?? id

/** The situation in a line: "KKW need 38 off 18" or "MI need 38 off 18 v KKW". */
export function challengeAsk(info: ChallengeInfo): string {
  const opp = info.me === info.homeId ? info.awayId : info.homeId
  const balls = `${info.need} off ${info.ballsLeft}`
  return info.role === 'chase'
    ? `${short(info.me)} need ${balls}`
    : `${short(opp)} need ${balls} v ${short(info.me)}`
}

export interface ChallengeResult {
  stars: 0 | 1 | 2 | 3
  won: boolean
  /** e.g. "Won with 2 balls to spare". */
  line: string
}

/** Stars for how the manager finished the job. */
export function gradeChallenge(info: ChallengeInfo, state: MatchState): ChallengeResult {
  const r = state.result
  const second = state.innings[1]
  if (!r || !second) return { stars: 0, won: false, line: 'Not finished' }
  const won = r.winnerId === info.me
  const ballsLeft = second.maxOvers * 6 - second.legalBalls
  const wktsLeft = second.maxWickets - second.wickets
  const target = second.target ?? 0
  const short = target - 1 - second.runs
  const superOver = state.innings.length > 2
  if (info.role === 'chase') {
    if (won && !superOver && (ballsLeft >= 2 || wktsLeft >= 4))
      return {
        stars: 3,
        won,
        line: `Won with ${ballsLeft} ball${ballsLeft === 1 ? '' : 's'} to spare`,
      }
    if (won) return { stars: 2, won, line: superOver ? 'Won in the super over' : 'Got there' }
    if (superOver || short <= 5)
      return {
        stars: 1,
        won,
        line: superOver ? 'Lost in the super over' : `Fell ${short + 1} short`,
      }
    return { stars: 0, won, line: `Lost by ${runs(short)}` }
  }
  if (won && !superOver && (short >= 9 || second.wickets >= second.maxWickets))
    return {
      stars: 3,
      won,
      line: second.wickets >= second.maxWickets ? 'Bowled them out' : `Won by ${runs(short)}`,
    }
  if (won)
    return { stars: 2, won, line: superOver ? 'Won in the super over' : `Won by ${runs(short)}` }
  if (superOver || ballsLeft <= 1)
    return { stars: 1, won, line: superOver ? 'Lost in the super over' : 'Lost off the last ball' }
  return { stars: 0, won, line: `Lost with ${ballsLeft} balls left` }
}

const EMOJI = (e: BallEvent) =>
  e.wicket
    ? '🟥'
    : e.boundary === 6
      ? '🟪'
      : e.boundary === 4
        ? '🟦'
        : e.extra
          ? '🟨'
          : e.runs > 0
            ? '⬜'
            : '⬛'

/** The shareable result: a header, the situation, and one square per ball played. */
export function shareText(info: ChallengeInfo, state: MatchState, result: ChallengeResult): string {
  const stars = '★'.repeat(result.stars) + '☆'.repeat(3 - result.stars)
  const ask = challengeAsk(info)
  const balls = (state.innings[1]?.events ?? []).slice(info.handoverAt).map(EMOJI)
  const rows: string[] = []
  for (let i = 0; i < balls.length; i += 6) rows.push(balls.slice(i, i + 6).join(''))
  return [`Cricket Manager Daily #${info.number} ${stars}`, `${ask}: ${result.line}`, ...rows].join(
    '\n',
  )
}
