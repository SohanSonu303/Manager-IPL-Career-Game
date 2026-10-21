import { describe, expect, it } from 'vitest'
import { players, teams } from '../data'
import {
  ACHIEVEMENTS,
  careerAchievements,
  hasHatTrick,
  matchAchievements,
  unlock,
} from './achievements'
import { today } from './calendar'
import type { Career } from './career'
import { continueCareer, quickSim, startCareer, userFixtureToday } from './game'
import { simMatch } from './match/engine'
import { setupMatch } from './match/setup'
import type { BallEvent, InningsState } from './match/types'
import { deriveSeed } from './rng'

const squads = Object.fromEntries(
  teams.map((t) => [
    t.id,
    players.filter((p) => p.teamId === t.id).map((p) => ({ ...p, fitness: 100, form: 50 })),
  ]),
)

const ball = (bowlerId: string, wicket: boolean, extra = false): BallEvent =>
  ({
    bowlerId,
    extra: extra ? { kind: 'wide', runs: 1 } : null,
    wicket: wicket ? { kind: 'bowled', playerOutId: 'x', fielderId: null } : null,
  }) as BallEvent

describe('achievements', () => {
  it('ids are unique', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length)
  })

  it('hat-trick: three in three by one bowler, a wide in between does not break it', () => {
    const inn = (events: BallEvent[]) => ({ events }) as InningsState
    const mine = new Set(['a'])
    expect(
      hasHatTrick(inn([ball('a', true), ball('b', false), ball('a', true), ball('a', true)]), mine),
    ).toBe(true)
    expect(
      hasHatTrick(
        inn([ball('a', true), ball('a', true, true), ball('a', true), ball('a', true)]),
        mine,
      ),
    ).toBe(true)
    expect(
      hasHatTrick(inn([ball('a', true), ball('a', false), ball('a', true), ball('a', true)]), mine),
    ).toBe(false)
    expect(hasHatTrick(inn([ball('b', true), ball('b', true), ball('b', true)]), mine)).toBe(false)
  })

  it('match achievements follow the scorecard', () => {
    let wins = 0
    for (let s = 0; s < 40; s++) {
      const { state, rng } = setupMatch({
        seed: deriveSeed(3, s),
        homeId: 'mum',
        awayId: 'che',
        squads,
      })
      simMatch(state, rng)
      const got = matchAchievements(state, 'mum')
      if (state.result?.winnerId === 'mum') {
        wins++
        expect(got).toContain('first-win')
      } else expect(got).not.toContain('first-win')
      const hundred = state.innings
        .slice(0, 2)
        .filter((i) => i.battingTeamId === 'mum')
        .some((i) => Object.values(i.batting).some((l) => l.runs >= 100))
      expect(got.includes('century')).toBe(hundred)
    }
    expect(wins).toBeGreaterThan(0)
  })

  it('unlocks once, with a news item, and a season earns career ones', () => {
    let c: Career = startCareer({ seed: 9, managerName: 'T', teamId: 'kol' })
    expect(c.achievements).toEqual({})
    const once = unlock(c, ['first-win', 'first-win', 'not-a-real-one'])
    expect(Object.keys(once.achievements)).toEqual(['first-win'])
    expect(once.news.at(-1)?.text).toMatch(/Off the mark/)
    expect(unlock(once, ['first-win'])).toBe(once)

    let guard = 0
    while (today(c.calendar).event?.type !== 'seasonEnd' && guard++ < 500) {
      const mine = userFixtureToday(c)
      c = mine ? quickSim(c, mine) : continueCareer(c)
    }
    // The manager's matches unlock match achievements as they are recorded.
    const won = c.season.results.some((r) => r.winnerId === 'kol')
    expect(!!c.achievements['first-win']).toBe(won)
    const career = careerAchievements(c)
    if (c.season.results.some((r) => r.stage !== 'league' && r.teams.includes('kol')))
      expect(career).toContain('playoffs')
  })
})
