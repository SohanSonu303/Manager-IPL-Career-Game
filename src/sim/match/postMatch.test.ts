import { describe, expect, it } from 'vitest'
import { newCareer, type CareerPlayer } from '../career'
import { deriveSeed } from '../rng'
import { simMatch } from './engine'
import {
  applyPostMatch,
  battingGrade,
  bowlingGrade,
  letterGrade,
  SEASON_DEV_CAP,
} from './postMatch'
import { setupMatch } from './setup'

const line = (runs: number, balls: number, out = true) => ({
  runs,
  balls,
  fours: 0,
  sixes: 0,
  out: out ? { kind: 'caught' as const, playerOutId: 'x', fielderId: null } : null,
})
const spell = (overs: number, runs: number, wickets: number) => ({
  legalBalls: overs * 6,
  runs,
  wickets,
  dots: 0,
  wides: 0,
  noballs: 0,
})

/** Play `n` matches between two career squads, applying the post-match step each time. */
function season(n: number, seed = 1) {
  let players: CareerPlayer[] = newCareer({ seed, managerName: 'T', teamId: 'hyd' }).players
  const reports = []
  for (let i = 0; i < n; i++) {
    const squads = {
      hyd: players.filter((p) => p.teamId === 'hyd'),
      mum: players.filter((p) => p.teamId === 'mum'),
    }
    const m = setupMatch({
      seed: deriveSeed(seed, i),
      homeId: i % 2 ? 'hyd' : 'mum',
      awayId: i % 2 ? 'mum' : 'hyd',
      squads,
    })
    simMatch(m.state, m.rng)
    const out = applyPostMatch(players, m.state, deriveSeed(seed, 'pm', i))
    // Full recovery between matches for this test, so fitness effects stay per-match.
    players = out.players.map((p) => ({ ...p, fitness: 100 }))
    reports.push(out.reports)
  }
  return { players, reports }
}

describe('grades', () => {
  it('rank performances sensibly', () => {
    expect(battingGrade(line(80, 40))).toBeGreaterThan(battingGrade(line(30, 25)))
    expect(battingGrade(line(30, 25))).toBeGreaterThan(battingGrade(line(3, 8)))
    expect(battingGrade(line(25, 10, false))).toBeGreaterThan(battingGrade(line(25, 30, true)))
    expect(bowlingGrade(spell(4, 20, 3))).toBeGreaterThan(bowlingGrade(spell(4, 32, 1)))
    expect(bowlingGrade(spell(4, 32, 1))).toBeGreaterThan(bowlingGrade(spell(4, 55, 0)))
    expect(letterGrade(95)).toBe('A+')
    expect(letterGrade(10)).toBe('F')
  })
})

describe('post-match step', () => {
  it('reports every player in both XIs, with fitness spent and bounded rating changes', () => {
    const { reports } = season(1)
    const r = reports[0] ?? []
    expect(r).toHaveLength(22)
    for (const p of r) {
      expect(p.fitnessAfter).toBeLessThan(100)
      expect(Math.abs(p.ratingChange.batting)).toBeLessThanOrEqual(1)
      expect(Math.abs(p.ratingChange.bowling)).toBeLessThanOrEqual(1)
      expect(p.grade).toBeGreaterThanOrEqual(0)
      expect(p.grade).toBeLessThanOrEqual(100)
    }
  })

  it('caps rating change from grades per season', () => {
    const { players } = season(40)
    for (const p of players) {
      expect(Math.abs(p.seasonDev.batting)).toBeLessThanOrEqual(SEASON_DEV_CAP)
      expect(Math.abs(p.seasonDev.bowling)).toBeLessThanOrEqual(SEASON_DEV_CAP)
    }
  })

  it('injures at a believable rate and injured players sit out until healed', () => {
    const { reports } = season(120, 3)
    const injuries = reports.flat().filter((r) => r.injury)
    const perMatch = injuries.length / reports.length
    expect(perMatch).toBeGreaterThan(0.05)
    expect(perMatch).toBeLessThan(0.8)
    // Nobody plays while injured: a player injured in match i is absent until healed.
    for (let i = 0; i < reports.length - 1; i++) {
      for (const r of reports[i] ?? []) {
        if (r.injury) expect((reports[i + 1] ?? []).map((x) => x.id)).not.toContain(r.id)
      }
    }
  })

  it('form follows grades', () => {
    const { reports } = season(1)
    for (const r of reports[0] ?? []) {
      if (r.grade > 70) expect(r.formAfter).toBeGreaterThan(40)
    }
  })

  it('is deterministic', () => {
    expect(season(5, 9).players).toEqual(season(5, 9).players)
  })
})
