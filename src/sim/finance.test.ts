import { describe, expect, it } from 'vitest'
import { today } from './calendar'
import { fundsOf, PRIZES, START_FUNDS, WIN_BONUS } from './finance'
import { continueCareer, quickSim, startCareer, TEAM_IDS, userFixtureToday } from './game'

describe('club funds', () => {
  let c = startCareer({ seed: 5, managerName: 'T', teamId: 'kol' })
  for (let g = 0; today(c.calendar).event?.type !== 'seasonEnd' && g < 500; g++) {
    const mine = userFixtureToday(c)
    c = mine ? quickSim(c, mine) : continueCareer(c)
  }

  it('every club starts with the same funds', () => {
    const fresh = startCareer({ seed: 5, managerName: 'T', teamId: 'kol' })
    for (const id of TEAM_IDS) expect(fundsOf(fresh, id)).toBe(START_FUNDS)
  })

  it('pays a bonus for every win and prize money to the top four, nothing for losses', () => {
    const prizes = Object.values(PRIZES).reduce((s, v) => s + v, 0)
    let total = 0
    for (const id of TEAM_IDS) {
      const wins = c.season.results.filter((r) => r.winnerId === id).length
      const earned = fundsOf(c, id) - START_FUNDS
      expect(earned).toBeGreaterThanOrEqual(wins * WIN_BONUS)
      total += earned - wins * WIN_BONUS
    }
    expect(total).toBe(prizes)
    expect(fundsOf(c, c.season.review!.championId)).toBeGreaterThanOrEqual(
      START_FUNDS + PRIZES.champion,
    )
  })

  it("keeps a ledger of the manager's income", () => {
    expect(c.ledger.length).toBeGreaterThan(0)
    expect(c.ledger.every((e) => e.amount > 0)).toBe(true)
  })
})
