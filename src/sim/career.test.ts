import { describe, expect, it } from 'vitest'
import { daysToNextEvent, LEAGUE_ROUNDS, nextDay, SEASON, today } from './calendar'
import { advanceDay, advanceToNextEvent, newCareer, START_YEAR, type Career } from './career'

const start = () => newCareer({ seed: 42, managerName: 'Test', teamId: 'hyd' })

/** Advance until the calendar year changes. */
function playSeason(c: Career): Career {
  const year = c.calendar.year
  while (c.calendar.year === year) c = advanceDay(c)
  return c
}

describe('calendar', () => {
  it('has every league round, all four playoff stages and one season end, in order', () => {
    const events = SEASON.flatMap((d) => (d.event ? [d.event] : []))
    expect(events.filter((e) => e.type === 'league')).toHaveLength(LEAGUE_ROUNDS)
    expect(
      events.filter((e) => e.type === 'playoff').map((e) => e.type === 'playoff' && e.stage),
    ).toEqual(['qualifier1', 'eliminator', 'qualifier2', 'final'])
    expect(events.at(-1)).toEqual({ type: 'seasonEnd' })
    expect(SEASON.at(-1)?.phase).toBe('offseason')
  })

  it('weeks and days are consistent', () => {
    SEASON.forEach((d, i) => {
      expect(d.day).toBe(i)
      expect(d.week).toBe(Math.floor(i / 7) + 1)
    })
  })

  it('rolls over to day 0 of the next year after the last day', () => {
    const last = { year: 2026, day: SEASON.length - 1 }
    expect(nextDay(last)).toEqual({ calendar: { year: 2027, day: 0 }, rolledOver: true })
    expect(nextDay({ year: 2026, day: 0 })).toEqual({
      calendar: { year: 2026, day: 1 },
      rolledOver: false,
    })
  })

  it('daysToNextEvent finds the next match day, wrapping into next season', () => {
    const cal = { year: 2026, day: 0 }
    expect(today({ ...cal, day: cal.day + daysToNextEvent(cal) }).event).toEqual({
      type: 'league',
      round: 1,
    })
    const last = { year: 2026, day: SEASON.length - 1 }
    expect(daysToNextEvent(last)).toBeGreaterThan(0)
  })
})

describe('career', () => {
  it('starts in preseason with every player fit', () => {
    const c = start()
    expect(c.calendar).toEqual({ year: START_YEAR, day: 0 })
    expect(c.players.length).toBeGreaterThan(200)
    expect(c.players.every((p) => p.fitness === 100 && p.form >= 40 && p.form <= 60)).toBe(true)
  })

  it('advanceToNextEvent stops on match days', () => {
    let c = start()
    c = advanceToNextEvent(c)
    expect(today(c.calendar).event).toEqual({ type: 'league', round: 1 })
    c = advanceToNextEvent(c)
    expect(today(c.calendar).event).toEqual({ type: 'league', round: 2 })
  })

  it('season rollover ages players and changes ratings', () => {
    const before = start()
    const after = playSeason(before)
    expect(after.calendar).toEqual({ year: START_YEAR + 1, day: 0 })
    const b = before.players[0]
    const a = after.players[0]
    expect(a?.age).toBe((b?.age ?? 0) + 1)
    const changed = after.players.filter(
      (p, i) => JSON.stringify(p.ratings) !== JSON.stringify(before.players[i]?.ratings),
    )
    expect(changed.length).toBeGreaterThan(before.players.length / 2)
  })

  it('is deterministic: same seed, same seasons', () => {
    expect(playSeason(playSeason(start()))).toEqual(playSeason(playSeason(start())))
    const other = playSeason(newCareer({ seed: 43, managerName: 'Test', teamId: 'hyd' }))
    expect(other.players).not.toEqual(playSeason(start()).players)
  })

  it('a new career save stays well under the size budget', () => {
    const bytes = JSON.stringify(start()).length
    expect(bytes).toBeLessThan(250_000)
  })
})
