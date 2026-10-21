import { describe, expect, it } from 'vitest'
import { overallRating } from '../sim/player'
import { displayName, fictionalName, shortName } from './names'
import { players, playersByTeam, teams } from './index'
import { BOWLING_TYPES, NATIONALITIES, ROLES, TRAITS } from './types'

const inRange = (v: number) => Number.isInteger(v) && v >= 1 && v <= 99

describe('players.json', () => {
  it('has unique ids and names', () => {
    expect(new Set(players.map((p) => p.id)).size).toBe(players.length)
    expect(new Set(players.map((p) => p.name)).size).toBe(players.length)
  })

  it('matches the schema', () => {
    for (const p of players) {
      expect(ROLES).toContain(p.role)
      expect(NATIONALITIES).toContain(p.nationality)
      if (p.bowlingType !== null) expect(BOWLING_TYPES).toContain(p.bowlingType)
      for (const t of p.traits) expect(TRAITS).toContain(t)
      expect(Object.values(p.ratings).every(inRange)).toBe(true)
      expect(p.overseas).toBe(p.nationality !== 'IND')
      expect(p.age).toBeGreaterThanOrEqual(14)
      expect(p.age).toBeLessThanOrEqual(45)
      expect(p.contract === null).toBe(p.teamId === null)
      if (p.role === 'bowler' || p.role === 'allrounder') expect(p.bowlingType).not.toBeNull()
    }
  })

  it('ids do not contain real names', () => {
    for (const p of players) expect(p.id).toMatch(/^p[0-9a-z]+$/)
  })
})

describe('squads', () => {
  it('every team has a playable 18-man squad', () => {
    for (const t of teams) {
      const squad = playersByTeam(t.id)
      expect(squad).toHaveLength(18)
      expect(squad.filter((p) => p.overseas).length).toBeLessThanOrEqual(8)
      expect(squad.filter((p) => p.role === 'wicketkeeper').length).toBeGreaterThanOrEqual(2)
      expect(squad.filter((p) => p.role === 'bowler').length).toBeGreaterThanOrEqual(5)
      expect(
        squad.filter((p) => p.bowlingType === 'spin' && p.role !== 'batter').length,
      ).toBeGreaterThanOrEqual(3)
    }
  })

  it('teams are roughly balanced', () => {
    const avgs = teams.map((t) => {
      const sq = playersByTeam(t.id)
      return sq.reduce((s, p) => s + overallRating(p), 0) / sq.length
    })
    expect(Math.max(...avgs) - Math.min(...avgs)).toBeLessThan(3)
  })
})

describe('teams.json', () => {
  it('has 10 teams with unique ids, codes and crests', () => {
    expect(teams).toHaveLength(10)
    expect(new Set(teams.map((t) => t.id)).size).toBe(10)
    expect(new Set(teams.map((t) => t.short)).size).toBe(10)
    expect(new Set(teams.map((t) => `${t.crest.shape}/${t.crest.glyph}`)).size).toBe(10)
  })
})

describe('names', () => {
  const kohli = players.find((p) => p.name === 'Virat Kohli')

  it('fictional toggle replaces real names with a stable made-up one', () => {
    expect(kohli).toBeDefined()
    if (!kohli) return
    expect(displayName(kohli, false)).toBe('Virat Kohli')
    const fake = displayName(kohli, true)
    expect(fake).not.toBe('Virat Kohli')
    expect(fake).toBe(fictionalName(kohli.id, 'IND'))
  })

  it('fictional names never reuse a real player name', () => {
    const real = new Set(players.filter((p) => p.real).map((p) => p.name))
    for (const p of players) expect(real.has(displayName(p, true))).toBe(false)
  })

  it('shortName', () => {
    expect(shortName('Virat Kohli')).toBe('V Kohli')
    expect(shortName('Nitish Kumar Reddy')).toBe('NK Reddy')
    expect(shortName('Rashid')).toBe('Rashid')
  })
})
