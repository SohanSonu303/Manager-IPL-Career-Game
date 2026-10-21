import { describe, expect, it } from 'vitest'
import { players, teams } from '../../data'
import { simMatch } from './engine'
import { setupMatch } from './setup'
import { chaseWinChance, turningPoint, winProbability, winProbabilityTrail } from './winProb'

describe('win probability', () => {
  it('a chase gets likelier with fewer runs needed, more balls and more wickets', () => {
    expect(chaseWinChance(20, 30, 4)).toBeGreaterThan(chaseWinChance(40, 30, 4))
    expect(chaseWinChance(40, 36, 4)).toBeGreaterThan(chaseWinChance(40, 24, 4))
    expect(chaseWinChance(40, 30, 2)).toBeGreaterThan(chaseWinChance(40, 30, 7))
    expect(chaseWinChance(0, 10, 3)).toBe(1)
    expect(chaseWinChance(5, 0, 3)).toBe(0)
  })

  it('starts near even, sums to one and ends at the result', () => {
    const squads = Object.fromEntries(
      teams.map((t) => [
        t.id,
        players.filter((p) => p.teamId === t.id).map((p) => ({ ...p, fitness: 100, form: 50 })),
      ]),
    )
    const [home, away] = [teams[0]?.id as string, teams[1]?.id as string]
    const { state, rng } = setupMatch({ seed: 11, homeId: home, awayId: away, squads })
    const p0 = winProbability(state, home)
    expect(p0).toBeGreaterThan(0.25)
    expect(p0).toBeLessThan(0.75)
    expect(p0 + winProbability(state, away)).toBeCloseTo(1)
    simMatch(state, rng)
    const trail = winProbabilityTrail(state, home)
    expect(trail.every((p) => p >= 0 && p <= 1)).toBe(true)
    if (state.innings.length === 2) {
      expect(trail.at(-1)).toBeCloseTo(state.result?.winnerId === home ? 1 : 0, 1)
    }
    expect(turningPoint(trail)?.index).toBeGreaterThanOrEqual(0)
  })
})
