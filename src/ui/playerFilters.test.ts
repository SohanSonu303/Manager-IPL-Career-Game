import { describe, expect, it } from 'vitest'
import { startCareer } from '@/sim/game'
import { overallRating } from '@/sim/player'
import { activeCount, applyFilters, DEFAULT_FILTERS, type PlayerFilters } from './playerFilters'

const players = startCareer({ seed: 1, managerName: 'T', teamId: 'hyd' }).players
const f = (over: Partial<PlayerFilters>): PlayerFilters => ({ ...DEFAULT_FILTERS, ...over })

describe('player filters', () => {
  it('defaults keep everyone, sorted by overall', () => {
    const r = applyFilters(players, DEFAULT_FILTERS)
    expect(r).toHaveLength(players.length)
    for (let i = 1; i < r.length; i++) {
      expect(overallRating(r[i - 1]!)).toBeGreaterThanOrEqual(overallRating(r[i]!))
    }
  })

  it('each filter narrows to exactly what it says', () => {
    expect(
      applyFilters(players, f({ role: 'wicketkeeper' })).every((p) => p.role === 'wicketkeeper'),
    ).toBe(true)
    expect(applyFilters(players, f({ origin: 'overseas' })).every((p) => p.overseas)).toBe(true)
    expect(applyFilters(players, f({ origin: 'domestic' })).every((p) => !p.overseas)).toBe(true)
    const spin = applyFilters(players, f({ bowling: 'spin' }))
    expect(spin.length).toBeGreaterThan(5)
    expect(spin.every((p) => p.bowlingType === 'spin' && p.role !== 'batter')).toBe(true)
    expect(applyFilters(players, f({ age: 'u23' })).every((p) => p.age < 23)).toBe(true)
    expect(applyFilters(players, f({ age: '34+' })).every((p) => p.age >= 34)).toBe(true)
    expect(applyFilters(players, f({ minOverall: 75 })).every((p) => overallRating(p) >= 75)).toBe(
      true,
    )
    expect(
      applyFilters(players, f({ skill: 'finisher' })).every((p) => p.traits.includes('finisher')),
    ).toBe(true)
  })

  it('search ignores case and accents; combines with other filters', () => {
    const r = applyFilters(players, f({ search: 'KOHLI' }))
    expect(r.map((p) => p.name)).toEqual(['Virat Kohli'])
    expect(applyFilters(players, f({ search: 'kohli', origin: 'overseas' }))).toHaveLength(0)
  })

  it('price bands use the supplied price function', () => {
    const cheap = applyFilters(players, f({ price: 'u1' }), () => 50)
    expect(cheap).toHaveLength(players.length)
    expect(applyFilters(players, f({ price: '15+' }), () => 50)).toHaveLength(0)
    const stars = applyFilters(players, f({ price: '15+' }))
    expect(stars.every((p) => (p.contract?.salary ?? 0) >= 1500)).toBe(true)
  })

  it('availability and sorting', () => {
    const hurt = players.map((p, i) =>
      i < 3 ? { ...p, injury: { kind: 'minor' as const, matchesOut: 2 } } : p,
    )
    expect(applyFilters(hurt, f({ availability: 'injured' }))).toHaveLength(3)
    expect(applyFilters(hurt, f({ availability: 'fit' }))).toHaveLength(players.length - 3)
    const byAge = applyFilters(players, f({ sort: 'age' }))
    expect(byAge[0]!.age).toBeLessThanOrEqual(byAge.at(-1)!.age)
    const byName = applyFilters(players, f({ sort: 'name' }))
    expect(byName[0]!.name.localeCompare(byName[1]!.name)).toBeLessThanOrEqual(0)
    const byPrice = applyFilters(players, f({ sort: 'price' }))
    expect(byPrice[0]!.contract?.salary ?? 0).toBeGreaterThanOrEqual(
      byPrice[10]!.contract?.salary ?? 0,
    )
  })

  it('counts active filters', () => {
    expect(activeCount(DEFAULT_FILTERS)).toBe(0)
    expect(activeCount(f({ role: 'bowler', minOverall: 70, search: 'a', sort: 'age' }))).toBe(3)
  })
})
