import { describe, expect, it } from 'vitest'
import { autoPickXI, autoTeamSheet, validateSheet } from '../sim/match/selection'
import { overallRating } from '../sim/player'
import { shortName } from './names'
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

  it('ids are short hashes', () => {
    for (const p of players) expect(p.id).toMatch(/^p[0-9a-z]+$/)
  })
})

describe('squads', () => {
  it('every team has a real-sized squad that can field a legal XI', () => {
    for (const t of teams) {
      const squad = playersByTeam(t.id).map((p) => ({ ...p, fitness: 100, form: 50 }))
      expect(squad.length).toBeGreaterThanOrEqual(18)
      expect(squad.length).toBeLessThanOrEqual(25)
      expect(squad.filter((p) => p.overseas).length).toBeLessThanOrEqual(8)
      expect(squad.some((p) => p.role === 'wicketkeeper')).toBe(true)
      const sheet = autoTeamSheet(t.id, squad, true)
      expect(validateSheet(sheet, squad), t.id).toEqual([])
    }
  })

  it('teams are roughly balanced (best XI)', () => {
    const avgs = teams.map((t) => {
      const squad = playersByTeam(t.id).map((p) => ({ ...p, fitness: 100, form: 50 }))
      const xi = autoPickXI(squad)
      return xi.reduce((s, p) => s + overallRating(p), 0) / xi.length
    })
    expect(Math.max(...avgs) - Math.min(...avgs)).toBeLessThan(7)
  })

  it('well-known players are at their real 2026 clubs', () => {
    const club = (n: string) => players.find((p) => p.name === n)?.teamId
    const expected: Record<string, string> = {
      'Virat Kohli': 'blr',
      'Rohit Sharma': 'mum',
      'Jasprit Bumrah': 'mum',
      'MS Dhoni': 'che',
      'Sanju Samson': 'che',
      'Ravindra Jadeja': 'raj',
      'Shubman Gill': 'guj',
      'Rishabh Pant': 'luc',
      'Shreyas Iyer': 'pun',
      'Heinrich Klaasen': 'hyd',
      'Sunil Narine': 'kol',
      'KL Rahul': 'del',
      'Rashid Khan': 'guj',
      'Yashasvi Jaiswal': 'raj',
    }
    for (const [name, id] of Object.entries(expected)) expect(club(name), name).toBe(id)
  })

  it('real contracts: salary in lakh, from the auction prices', () => {
    const kohli = players.find((p) => p.name === 'Virat Kohli')
    expect(kohli?.contract?.salary).toBe(2100)
    expect(players.find((p) => p.name === 'Rishabh Pant')?.contract?.salary).toBe(2700)
  })

  it('there is a market: unsigned and withdrawn players are free agents', () => {
    const free = players.filter((p) => p.teamId === null)
    expect(free.length).toBeGreaterThanOrEqual(40)
    expect(free.some((p) => p.role === 'wicketkeeper')).toBe(true)
    expect(free.some((p) => p.role === 'bowler')).toBe(true)
  })
})

describe('teams.json', () => {
  it('has 10 teams with unique ids, names, codes and crests', () => {
    expect(teams).toHaveLength(10)
    expect(new Set(teams.map((t) => t.name)).size).toBe(10)
    expect(new Set(teams.map((t) => t.id)).size).toBe(10)
    expect(new Set(teams.map((t) => t.short)).size).toBe(10)
    expect(new Set(teams.map((t) => `${t.crest.shape}/${t.crest.glyph}`)).size).toBe(10)
  })
})

describe('names', () => {
  it('shortName', () => {
    expect(shortName('Virat Kohli')).toBe('V Kohli')
    expect(shortName('Nitish Kumar Reddy')).toBe('NK Reddy')
    expect(shortName('Rashid')).toBe('Rashid')
  })
})
