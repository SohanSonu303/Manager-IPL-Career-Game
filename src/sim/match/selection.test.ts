import { describe, expect, it } from 'vitest'
import { players, teams } from '../../data'
import { createMatch } from './engine'
import {
  autoBattingOrder,
  autoBowlingPlan,
  autoPickXI,
  autoTeamSheet,
  MAX_OVERSEAS_IN_XI,
  pitchFor,
  toMatchPlayer,
  validateSheet,
  type Selectable,
} from './selection'
import { batterIntent } from './tactics'

const squad = (teamId: string): Selectable[] =>
  players.filter((p) => p.teamId === teamId).map((p) => ({ ...p, fitness: 100, form: 50 }))

describe('auto-pick', () => {
  it('picks a legal, balanced XI for every team', () => {
    for (const t of teams) {
      const xi = autoPickXI(squad(t.id))
      expect(xi).toHaveLength(11)
      expect(new Set(xi.map((p) => p.id)).size).toBe(11)
      expect(xi.filter((p) => p.overseas).length).toBeLessThanOrEqual(MAX_OVERSEAS_IN_XI)
      expect(xi.some((p) => p.role === 'wicketkeeper')).toBe(true)
      expect(
        xi.filter((p) => p.role === 'bowler' || p.role === 'allrounder').length,
      ).toBeGreaterThanOrEqual(5)
      expect(validateSheet(autoTeamSheet(t.id, squad(t.id), true), squad(t.id))).toEqual([])
    }
  })

  it('leaves injured players out', () => {
    const s = squad('hyd')
    const best = autoPickXI(s)[0]
    const hurt = s.map((p) => (p.id === best?.id ? { ...p, injury: { matchesOut: 2 } } : p))
    expect(autoPickXI(hurt).map((p) => p.id)).not.toContain(best?.id)
  })

  it('bats specialists first and bowlers last', () => {
    const xi = autoPickXI(squad('mum'))
    const order = autoBattingOrder(xi)
    const roleAt = (i: number) => xi.find((p) => p.id === order[i])?.role
    expect(['batter', 'wicketkeeper']).toContain(roleAt(0))
    expect(roleAt(10)).toBe('bowler')
  })
})

describe('validation', () => {
  const s = squad('che')
  const sheet = autoTeamSheet('che', s, false)

  it('flags too many overseas, missing keeper, too few bowlers and bad plans', () => {
    const overseas = s.filter((p) => p.overseas).map((p) => p.id)
    const tooMany = {
      ...sheet,
      battingOrder: [
        ...overseas.slice(0, 5),
        ...sheet.battingOrder.filter((id) => !overseas.includes(id)),
      ].slice(0, 11),
    }
    expect(validateSheet(tooMany, s).join(' ')).toMatch(/overseas/)
    expect(validateSheet({ ...sheet, keeperId: 'nobody' }, s).join(' ')).toMatch(/keeper/)
    expect(
      validateSheet({ ...sheet, battingOrder: sheet.battingOrder.slice(0, 10) }, s).join(' '),
    ).toMatch(/exactly 11/)
    const b = sheet.battingOrder.find(
      (id) => s.find((p) => p.id === id)?.role === 'bowler',
    ) as string
    const plan = Array.from({ length: 20 }, () => b)
    const errors = validateSheet({ ...sheet, bowlingPlan: plan }, s).join(' ')
    expect(errors).toMatch(/twice in a row/)
    expect(errors).toMatch(/max 4/)
  })
})

describe('bowling plan', () => {
  it('auto plan bowls 20 overs, max 4 each, never back-to-back, keeper never bowls', () => {
    for (const t of teams) {
      const s = squad(t.id)
      const sheet = autoTeamSheet(t.id, s, false)
      const plan = autoBowlingPlan(
        sheet,
        s.filter((p) => sheet.battingOrder.includes(p.id)).map(toMatchPlayer),
      )
      expect(plan).toHaveLength(20)
      plan.forEach((id, i) => i > 0 && expect(id).not.toBe(plan[i - 1]))
      expect(plan).not.toContain(sheet.keeperId)
      const counts = new Map<string, number>()
      plan.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1))
      for (const n of counts.values()) expect(n).toBeLessThanOrEqual(4)
      expect(validateSheet({ ...sheet, bowlingPlan: plan }, s)).toEqual([])
    }
  })
})

describe('intent', () => {
  it('a human side uses its own settings, per batter', () => {
    const home = autoTeamSheet('hyd', squad('hyd'), false)
    const opener = home.battingOrder[0] as string
    const sheet = {
      ...home,
      aggression: 'defend' as const,
      intent: { [opener]: 'allout' as const },
    }
    const away = autoTeamSheet('mum', squad('mum'), true)
    const all = [...squad('hyd'), ...squad('mum')]
    const ids = new Set([...sheet.battingOrder, ...away.battingOrder])
    const { state } = createMatch({
      seed: 1,
      players: all.filter((p) => ids.has(p.id)).map(toMatchPlayer),
      sheets: [sheet, away],
      pitch: pitchFor('hyd'),
    })
    // Force the human side to bat first for this check.
    const inn = {
      ...state.innings[0],
      battingTeamId: 'hyd',
      bowlingTeamId: 'mum',
    } as (typeof state.innings)[0]
    expect(batterIntent(state, inn, opener)).toBe(2)
    expect(batterIntent(state, inn, sheet.battingOrder[1] as string)).toBe(-2)
  })
})
