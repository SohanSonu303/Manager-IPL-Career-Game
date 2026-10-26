import { describe, expect, it } from 'vitest'
import { players, teams } from '../../data'
import { deriveSeed } from '../rng'
import { executionChance, expectedEffect, pickDelivery } from './delivery'
import {
  aiTossDecision,
  atInningsBreak,
  callTimeout,
  canCallTimeout,
  currentInnings,
  decideToss,
  impactBlocker,
  makeImpactSub,
  resolveReview,
  simBall,
  simMatch,
  simOver,
  startNextInnings,
  TIMEOUT_WINDOWS,
} from './engine'
import { gradeMatch } from './postMatch'
import { autoTeamSheet, type Selectable } from './selection'
import { setupMatch } from './setup'
import type { MatchPlayer } from './types'
import { createRng } from '../rng'

const squads: Record<string, Selectable[]> = Object.fromEntries(
  teams.map((t) => [
    t.id,
    players.filter((p) => p.teamId === t.id).map((p) => ({ ...p, fitness: 100, form: 50 })),
  ]),
)

/** A match where `me` is human-controlled and someone is watching. */
function humanMatch(seed: number, me = 'hyd', opp = 'mum') {
  const sheet = autoTeamSheet(me, squads[me] ?? [], false)
  const m = setupMatch({ seed, homeId: me, awayId: opp, squads, sheets: { [me]: sheet } })
  m.state.interactive = true
  return m
}

const aiMatch = (seed: number, home = 'che', away = 'kol') =>
  setupMatch({ seed, homeId: home, awayId: away, squads })

const pacer = (bowling: number, traits: MatchPlayer['traits'] = []) => ({
  bowling,
  bowlingType: 'pace' as const,
  traits,
})

describe('delivery model', () => {
  it('better bowlers and specialists land more of what they mean', () => {
    const c = (b: ReturnType<typeof pacer>) => ({ bowler: b, phase: 'death' as const })
    expect(executionChance('yorker', c(pacer(80)))).toBeGreaterThan(
      executionChance('yorker', c(pacer(50))),
    )
    expect(executionChance('yorker', c(pacer(60, ['yorker-specialist'])))).toBeGreaterThan(
      executionChance('yorker', c(pacer(60))),
    )
    expect(executionChance('good', c(pacer(60)))).toBeGreaterThan(
      executionChance('yorker', c(pacer(60))),
    )
    // Tired bowlers and dew make it harder.
    expect(executionChance('yorker', { ...c(pacer(60)), penalty: 6 })).toBeLessThan(
      executionChance('yorker', c(pacer(60))),
    )
  })

  it('a yorker plan saves boundaries; a missed yorker is a full toss or half-volley', () => {
    const ctx = { bowler: pacer(72), phase: 'death' as const }
    expect(expectedEffect('yorkers', ctx).boundary).toBeLessThan(
      expectedEffect('stock', ctx).boundary,
    )
    const rng = createRng(4)
    const seen = new Set<string>()
    for (let i = 0; i < 400; i++) {
      const d = pickDelivery(rng, 'yorkers', { bowler: pacer(40), phase: 'death' })
      if (d.intended === 'yorker' && d.actual !== 'yorker') seen.add(d.actual)
    }
    expect([...seen].sort()).toEqual(['full', 'fulltoss'])
  })

  it('every legal ball records what was bowled, and scoring shots have a stroke', () => {
    const { state, rng } = aiMatch(3)
    simMatch(state, rng)
    const balls = state.innings.flatMap((i) => i.events)
    for (const e of balls) {
      if (e.extra?.kind !== 'wide') expect(e.delivery?.actual).toBeTruthy()
      if (e.boundary) expect(e.shot?.kind).toBeTruthy()
    }
  })
})

describe('toss and conditions', () => {
  it('heavy dew makes captains field', () => {
    expect(aiTossDecision(1, 0.9)).toBe('field')
    expect(aiTossDecision(0, 0.9)).toBe('bat')
  })

  it('a manager who wins the toss can choose before the first ball, and only then', () => {
    let found = false
    for (let seed = 1; seed < 40 && !found; seed++) {
      const { state, rng } = humanMatch(seed)
      if (state.toss.winnerId !== 'hyd') continue
      found = true
      expect(state.toss.pending).toBe(true)
      expect(decideToss(state, 'bat')).toBe(true)
      expect(state.order[0]).toBe('hyd')
      expect(currentInnings(state).battingTeamId).toBe('hyd')
      simBall(state, rng)
      expect(decideToss(state, 'field')).toBe(false)
    }
    expect(found).toBe(true)
  })

  it('every match has dew conditions within 0…1', () => {
    for (let s = 0; s < 30; s++) {
      const d = aiMatch(s).state.conditions?.dew ?? -1
      expect(d).toBeGreaterThanOrEqual(0)
      expect(d).toBeLessThanOrEqual(1)
    }
  })
})

describe('Impact Player', () => {
  it('AI sides use it at the innings break, within the overseas limit', () => {
    let used = 0
    for (let s = 0; s < 40; s++) {
      const { state, rng } = aiMatch(deriveSeed(7, s), 'blr', 'guj')
      simMatch(state, rng)
      for (const sheet of Object.values(state.sheets)) {
        expect(sheet.battingOrder).toHaveLength(11)
        expect(new Set(sheet.battingOrder).size).toBe(11)
        const overseas = sheet.battingOrder.filter((id) => state.players[id]?.overseas).length
        expect(overseas).toBeLessThanOrEqual(4)
        if (sheet.impact?.used) used++
      }
    }
    expect(used).toBeGreaterThan(40)
  })

  it('a replaced player is graded and the substitute too', () => {
    for (let s = 0; s < 20; s++) {
      const { state, rng } = aiMatch(deriveSeed(8, s))
      simMatch(state, rng)
      const used = Object.values(state.sheets).find((x) => x.impact?.used)?.impact?.used
      if (!used) continue
      const ids = gradeMatch(state).map((g) => g.id)
      expect(ids).toContain(used.outId)
      expect(ids).toContain(used.inId)
      return
    }
    throw new Error('no impact sub in 20 matches')
  })

  it('the manager can bring one on between overs, never the keeper or a batter at the crease', () => {
    const { state, rng } = humanMatch(5)
    const sheet = state.sheets.hyd
    if (!sheet?.impact) throw new Error('no subs')
    const sub = sheet.impact.subs[0] as string
    const inn = currentInnings(state)
    expect(impactBlocker(state, 'hyd', sheet.keeperId, sub)).toMatch(/keeper/)
    if (inn.battingTeamId === 'hyd')
      expect(impactBlocker(state, 'hyd', inn.strikerId, sub)).toMatch(/crease/)
    simBall(state, rng)
    if (!state.pendingReview && currentInnings(state).legalBalls % 6 !== 0)
      expect(impactBlocker(state, 'hyd', sheet.battingOrder[10] as string, sub)).toMatch(
        /between overs/,
      )
    while (state.pendingReview) resolveReview(state, false)
    simOver(state, rng)
    while (state.pendingReview) resolveReview(state, false)
    if (currentInnings(state).legalBalls % 6 !== 0) return
    const out = sheet.battingOrder.find(
      (id) =>
        id !== sheet.keeperId &&
        id !== currentInnings(state).strikerId &&
        id !== currentInnings(state).nonStrikerId,
    ) as string
    const okSub = sheet.impact.subs.find((id) => !impactBlocker(state, 'hyd', out, id))
    if (!okSub) return
    expect(makeImpactSub(state, 'hyd', out, okSub)).toBeNull()
    expect(sheet.battingOrder).toContain(okSub)
    expect(sheet.battingOrder).not.toContain(out)
    expect(makeImpactSub(state, 'hyd', okSub, out)).toMatch(/already/)
  })
})

describe('DRS', () => {
  it('a watched manager gets to review; the call settles the ball either way', () => {
    let reviewed = 0
    for (let s = 0; s < 30 && reviewed < 5; s++) {
      const { state, rng } = humanMatch(deriveSeed(11, s))
      while (!state.result) {
        if (atInningsBreak(state)) startNextInnings(state)
        else simBall(state, rng)
        const p = state.pendingReview
        if (!p) continue
        expect(p.teamId).toBe('hyd')
        const inn = currentInnings(state)
        const before = { runs: inn.runs, wickets: inn.wickets, events: inn.events.length }
        const left = inn.reviews?.hyd ?? 0
        expect(left).toBeGreaterThan(0)
        const e = resolveReview(state, true)
        reviewed++
        expect(inn.events.length).toBe(before.events + 1)
        expect(e.review?.teamId).toBe('hyd')
        const overturned = (p.call === 'out') !== p.truthOut
        expect(e.review?.overturned).toBe(overturned)
        expect(!!e.wicket).toBe(p.truthOut)
        expect(inn.reviews?.hyd).toBe(overturned || p.umpiresCall ? left : left - 1)
        expect(!!e.review?.umpiresCall).toBe(p.umpiresCall)
      }
    }
    expect(reviewed).toBeGreaterThan(0)
  })

  it('reviewing on a confident feel wins about 40-50% of the time; blind, about 20%', () => {
    const tally = { confident: [0, 0], all: [0, 0] }
    for (let s = 0; s < 400; s++) {
      const { state, rng } = humanMatch(deriveSeed(13, s))
      while (!state.result) {
        if (atInningsBreak(state)) startNextInnings(state)
        else simBall(state, rng)
        const p = state.pendingReview
        if (!p) continue
        const won = (p.call === 'out') !== p.truthOut || p.umpiresCall
        for (const k of p.feel === 'confident'
          ? (['confident', 'all'] as const)
          : ['all' as const]) {
          tally[k][0]! += won ? 1 : 0
          tally[k][1]! += 1
        }
        resolveReview(state, false)
      }
    }
    const rate = (k: keyof typeof tally) => tally[k][0]! / tally[k][1]!
    expect(tally.confident[1]).toBeGreaterThan(40)
    expect(rate('confident')).toBeGreaterThan(0.38)
    expect(rate('confident')).toBeLessThan(0.6)
    expect(rate('all')).toBeLessThan(0.35)
  })

  it('AI sides review on their own and never pause the match', () => {
    let reviews = 0
    for (let s = 0; s < 40; s++) {
      const { state, rng } = aiMatch(deriveSeed(12, s))
      simMatch(state, rng)
      expect(state.pendingReview).toBeFalsy()
      for (const inn of state.innings) for (const e of inn.events) if (e.review) reviews++
    }
    expect(reviews).toBeGreaterThan(5)
  })
})

describe('strategic timeouts', () => {
  it('only in the window, once per innings, by the side whose window it is', () => {
    const { state, rng } = humanMatch(21)
    const inn = () => currentInnings(state)
    const step = () => {
      simOver(state, rng)
      while (state.pendingReview) resolveReview(state, false)
    }
    while (inn().legalBalls / 6 < TIMEOUT_WINDOWS.bowling[0] && !atInningsBreak(state)) step()
    if (atInningsBreak(state)) return
    const bowling = inn().bowlingTeamId
    const batting = inn().battingTeamId
    expect(canCallTimeout(state, batting)).toBe(false)
    if (bowling === 'hyd') {
      expect(callTimeout(state, 'hyd')).toBe(true)
      expect(callTimeout(state, 'hyd')).toBe(false)
      expect(state.timeouts?.hyd?.boostBalls).toBe(12)
      step()
      step()
      expect(state.timeouts?.hyd?.boostBalls).toBe(0)
    }
  })

  it('AI sides take theirs in every full innings', () => {
    for (let s = 0; s < 10; s++) {
      const { state, rng } = aiMatch(deriveSeed(31, s))
      const taken = new Set<string>()
      while (!state.result) {
        simBall(state, rng)
        for (const [team, t] of Object.entries(state.timeouts ?? {}))
          taken.add(`${team}:${t.innings}`)
      }
      for (const inn of state.innings.slice(0, 2)) {
        // An innings that lasted into the window gets both timeouts.
        if (inn.legalBalls >= (TIMEOUT_WINDOWS.batting[1] + 1) * 6) {
          expect(taken).toContain(`${inn.battingTeamId}:${inn.index}`)
          expect(taken).toContain(`${inn.bowlingTeamId}:${inn.index}`)
        }
      }
    }
  })
})
