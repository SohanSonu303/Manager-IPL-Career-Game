import { describe, expect, it } from 'vitest'
import { players as basePlayers } from '../data'
import { autoAuction } from './auction'
import type { Career, CareerPlayer } from './career'
import {
  continueCareer,
  finishMega,
  quickSim,
  startCareer,
  TEAM_IDS,
  userFixtureToday,
} from './game'
import { SQUAD_MIN, squadOf } from './market'
import { overallRating } from './player'
import { generateProspects, prospectCount } from './youth'

const existing = basePlayers as unknown as CareerPlayer[]

describe('youth prospects', () => {
  const batch = generateProspects(1, 2027, 200, existing)

  it('are young, unsigned, mostly Indian, with growth room', () => {
    for (const p of batch) {
      expect(p.age).toBeGreaterThanOrEqual(17)
      expect(p.age).toBeLessThanOrEqual(21)
      expect(p.teamId).toBeNull()
      expect(p.contract).toBeNull()
      expect(p.overseas).toBe(p.nationality !== 'IND')
      const o = overallRating(p)
      expect(o).toBeGreaterThanOrEqual(42)
      expect(o).toBeLessThanOrEqual(64)
      expect(p.potential).toBeGreaterThanOrEqual(65)
      expect(p.potential).toBeLessThanOrEqual(90)
      expect(p.potential).toBeGreaterThan(o)
    }
    const indian = batch.filter((p) => p.nationality === 'IND').length / batch.length
    expect(indian).toBeGreaterThan(0.55)
    expect(indian).toBeLessThan(0.75)
    expect(batch.filter((p) => p.potential >= 80).length).toBeGreaterThan(0)
  })

  it('get unique ids and names, and the same seed gives the same players', () => {
    const ids = new Set([...existing.map((p) => p.id), ...batch.map((p) => p.id)])
    expect(ids.size).toBe(existing.length + batch.length)
    expect(new Set(batch.map((p) => p.name)).size).toBe(batch.length)
    expect(generateProspects(1, 2027, 5, existing)).toEqual(batch.slice(0, 5))
  })

  it('outnumber the retirees', () => {
    expect(prospectCount(3)).toBe(22)
    expect(prospectCount(15)).toBe(25)
  })

  it('keep every squad and the free-agent list full over eight seasons', () => {
    let c: Career = startCareer({ seed: 11, managerName: 'T', teamId: 'hyd' })
    const startYear = c.calendar.year
    let guard = 0
    while (c.calendar.year < startYear + 8 && guard++ < 5000) {
      // The board may sack the manager on autopilot; keep the league running regardless.
      if (c.status !== 'active') c = { ...c, status: 'active' }
      if (c.mega) c = finishMega(autoAuction(c))
      const mine = userFixtureToday(c)
      c = mine ? quickSim(c, mine) : continueCareer(c)
    }
    if (c.mega) c = finishMega(autoAuction(c))
    expect(c.calendar.year).toBe(startYear + 8)
    // AI clubs keep full squads; the idle manager (who never signs anyone) still fields an XI.
    for (const t of TEAM_IDS) {
      expect(squadOf(c.players, t).length).toBeGreaterThanOrEqual(t === 'hyd' ? 11 : SQUAD_MIN)
    }
    expect(c.market.freeAgentIds.length).toBeGreaterThanOrEqual(10)
    const fa = c.players.filter((p) => c.market.freeAgentIds.includes(p.id))
    expect(fa.filter((p) => p.prospect).length).toBeGreaterThanOrEqual(3)
    // Prospects are being signed and played, not just piling up.
    expect(c.players.filter((p) => p.prospect && p.teamId).length).toBeGreaterThan(20)
  }, 120_000)
})
