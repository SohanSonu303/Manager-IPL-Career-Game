import { describe, expect, it } from 'vitest'
import {
  challengeNumber,
  dailyChallenge,
  gradeChallenge,
  localDateKey,
  previousDay,
  shareText,
  streak,
} from './challenge'
import { currentInnings, simMatch } from './match/engine'
import { chaseWinChance } from './match/winProb'

describe('daily challenge', () => {
  it('numbers days from the epoch and walks back across months and years', () => {
    expect(challengeNumber('2026-01-01')).toBe(1)
    expect(challengeNumber('2026-10-21')).toBe(294)
    expect(previousDay('2026-03-01')).toBe('2026-02-28')
    expect(previousDay('2027-01-01')).toBe('2026-12-31')
    expect(localDateKey(new Date(2026, 9, 5))).toBe('2026-10-05')
  })

  it('streak counts consecutive days ending today or yesterday', () => {
    expect(streak(['2026-10-19', '2026-10-20', '2026-10-21'], '2026-10-21')).toBe(3)
    expect(streak(['2026-10-19', '2026-10-20'], '2026-10-21')).toBe(2)
    expect(streak(['2026-10-18', '2026-10-20'], '2026-10-21')).toBe(1)
    expect(streak(['2026-10-10'], '2026-10-21')).toBe(0)
  })

  it('is the same scenario for everyone on a day, and different the next day', () => {
    const a = dailyChallenge('2026-10-21')
    const b = dailyChallenge('2026-10-21')
    expect(a.info).toEqual(b.info)
    expect(a.match.state.innings[1]?.events).toEqual(b.match.state.innings[1]?.events)
    expect(dailyChallenge('2026-10-22').info).not.toEqual(a.info)
  })

  it('hands over a tight finish at an over break, to a human side', () => {
    for (const day of ['2026-01-01', '2026-02-14', '2026-06-30', '2026-10-21', '2027-03-03']) {
      const { info, match } = dailyChallenge(day)
      const inn = currentInnings(match.state)
      expect(inn.index).toBe(1)
      expect(inn.legalBalls % 6).toBe(0)
      expect(info.ballsLeft).toBeGreaterThanOrEqual(12)
      expect(info.ballsLeft).toBeLessThanOrEqual(36)
      const p = chaseWinChance(info.need, info.ballsLeft, 10 - info.wicketsLeft)
      expect(p).toBeGreaterThanOrEqual(0.25)
      expect(p).toBeLessThanOrEqual(0.65)
      expect(match.state.sheets[info.me]?.ai).toBe(false)
      expect(match.state.interactive).toBe(true)
    }
  })

  it('grades and shares the finish', () => {
    for (const day of ['2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04']) {
      const { info, match } = dailyChallenge(day)
      simMatch(match.state, match.rng)
      const r = gradeChallenge(info, match.state)
      expect(r.won).toBe(match.state.result?.winnerId === info.me)
      expect(r.won ? r.stars >= 2 : r.stars <= 1).toBe(true)
      const text = shareText(info, match.state, r)
      expect(text).toMatch(new RegExp(`^Cricket Manager Daily #${info.number} [★☆]{3}`))
      const squares = [...text.matchAll(/[🟥🟪🟦🟨⬜⬛]/gu)].length
      expect(squares).toBe((match.state.innings[1]?.events.length ?? 0) - info.handoverAt)
    }
  })
})
