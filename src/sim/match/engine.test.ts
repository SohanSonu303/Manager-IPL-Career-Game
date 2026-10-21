import { describe, expect, it } from 'vitest'
import { players, teams } from '../../data'
import { deriveSeed } from '../rng'
import { simBall, simInnings, simMatch, simOver, simOvers } from './engine'
import { MAX_OVERS_PER_BOWLER } from './tactics'
import { setupMatch } from './setup'
import type { Selectable } from './selection'
import type { InningsState, MatchState } from './types'

const squads: Record<string, Selectable[]> = Object.fromEntries(
  teams.map((t) => [
    t.id,
    players.filter((p) => p.teamId === t.id).map((p) => ({ ...p, fitness: 100, form: 50 })),
  ]),
)
const match = (seed: number, home = 'hyd', away = 'mum') =>
  setupMatch({ seed, homeId: home, awayId: away, squads })

function played(n: number): MatchState[] {
  return Array.from({ length: n }, (_, i) => {
    const h = teams[i % 10]?.id as string
    const a = teams[(i + 3) % 10]?.id as string
    const m = match(deriveSeed(99, i), h, a)
    simMatch(m.state, m.rng)
    return m.state
  })
}

function checkInnings(inn: InningsState) {
  const legal = inn.events.filter((e) => e.legal).length
  expect(legal).toBe(inn.legalBalls)
  expect(inn.legalBalls).toBeLessThanOrEqual(inn.maxOvers * 6)
  expect(inn.wickets).toBeLessThanOrEqual(inn.maxWickets)
  expect(inn.events.reduce((s, e) => s + e.total, 0)).toBe(inn.runs)

  // Every completed over has six legal balls, by one bowler, never two in a row.
  const overs = new Map<number, string>()
  for (const e of inn.events) {
    const prev = overs.get(e.over)
    if (prev) expect(e.bowlerId).toBe(prev)
    overs.set(e.over, e.bowlerId)
  }
  const bowlers = [...overs.values()]
  bowlers.forEach((b, i) => i > 0 && expect(b).not.toBe(bowlers[i - 1]))
  const perBowler = new Map<string, number>()
  for (const b of bowlers) perBowler.set(b, (perBowler.get(b) ?? 0) + 1)
  const cap = inn.maxOvers === 1 ? 1 : MAX_OVERS_PER_BOWLER
  for (const n of perBowler.values()) expect(n).toBeLessThanOrEqual(cap)

  // A free hit follows every no-ball, and only a run-out can dismiss on it.
  inn.events.forEach((e, i) => {
    if (e.extra?.kind === 'noball') {
      const next = inn.events[i + 1]
      if (next) expect(next.freeHit).toBe(true)
    }
    if (e.freeHit && e.wicket) expect(e.wicket.kind).toBe('runOut')
    if (e.extra?.kind === 'noball' && e.wicket) expect(e.wicket.kind).toBe('runOut')
  })

  // The innings ends for a reason.
  const reason =
    inn.legalBalls === inn.maxOvers * 6 ||
    inn.wickets === inn.maxWickets ||
    (inn.target !== null && inn.runs >= inn.target)
  expect(reason).toBe(true)
}

describe('match rules', () => {
  const matches = played(300)

  it('every innings follows the rules', () => {
    for (const m of matches) for (const inn of m.innings) checkInnings(inn)
  })

  it('the chase stops as soon as the target is reached', () => {
    for (const m of matches) {
      const second = m.innings[1] as InningsState
      if (second.runs >= (second.target ?? Infinity)) {
        const before = second.runs - (second.events.at(-1)?.total ?? 0)
        expect(before).toBeLessThan(second.target as number)
      }
    }
  })

  it('results and margins are consistent with the scores', () => {
    for (const m of matches) {
      const [first, second] = m.innings as [InningsState, InningsState]
      const r = m.result
      expect(r).not.toBeNull()
      if (!r) continue
      if (r.kind === 'runs') {
        expect(r.winnerId).toBe(first.battingTeamId)
        expect(r.margin).toContain(`${first.runs - second.runs} run`)
      } else if (r.kind === 'wickets') {
        expect(r.winnerId).toBe(second.battingTeamId)
        expect(r.margin).toContain(`${10 - second.wickets} wicket`)
      } else {
        expect(first.runs).toBe(second.runs)
        expect(m.innings.length).toBeGreaterThan(2)
      }
    }
  })

  it('a tie goes to a super over (1 over, 2 wickets, side batting second goes first)', () => {
    const tied = matches.filter((m) => m.innings.length > 2)
    expect(tied.length).toBeGreaterThan(0)
    for (const m of tied) {
      const so = m.innings[2] as InningsState
      expect(so.maxOvers).toBe(1)
      expect(so.maxWickets).toBe(2)
      expect(so.battingTeamId).toBe(m.innings[1]?.battingTeamId)
      expect(['superOver', 'tie']).toContain(m.result?.kind)
    }
  })
})

describe('determinism and stepping', () => {
  it('same seed, same match', () => {
    const a = match(5)
    const b = match(5)
    simMatch(a.state, a.rng)
    simMatch(b.state, b.rng)
    expect(a.state).toEqual(b.state)
  })

  it('stepping ball by ball, by over or by innings gives the same match', () => {
    const whole = match(8)
    simMatch(whole.state, whole.rng)

    const byBall = match(8)
    while (!byBall.state.result) simBall(byBall.state, byBall.rng)

    const mixed = match(8)
    simOvers(mixed.state, mixed.rng, 5)
    simOver(mixed.state, mixed.rng)
    simInnings(mixed.state, mixed.rng)
    simMatch(mixed.state, mixed.rng)

    expect(byBall.state).toEqual(whole.state)
    expect(mixed.state).toEqual(whole.state)
  })

  it('simOver stays within one over; simInnings within one innings', () => {
    const m = match(3)
    const over = simOver(m.state, m.rng)
    expect(new Set(over.map((e) => e.over)).size).toBe(1)
    expect(over.filter((e) => e.legal)).toHaveLength(6)
    const rest = simInnings(m.state, m.rng)
    expect(new Set(rest.map((e) => e.innings))).toEqual(new Set([0]))
    const next = simInnings(m.state, m.rng)
    expect(next[0]?.innings).toBe(1)
  })
})
