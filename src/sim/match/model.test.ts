import { describe, expect, it } from 'vitest'
import { ballOdds, wideFactor, type BallContext } from './model'
import type { MatchPlayer } from './types'

const player = (over: Partial<MatchPlayer>): MatchPlayer => ({
  id: 'x',
  name: 'X',
  role: 'batter',
  bowlingType: null,
  traits: [],
  overseas: false,
  batting: 70,
  bowling: 30,
  fielding: 70,
  ...over,
})

const bat = player({})
const pacer = player({ role: 'bowler', bowlingType: 'pace', batting: 20, bowling: 72 })
const pitch = { pace: 0, spin: 0, flat: 0, boundary: 70 }
const base: BallContext = { batter: bat, bowler: pacer, phase: 'death', pitch, intent: 0 }
const boundary = (c: BallContext) => {
  const o = ballOdds(c)
  return o.four + o.six
}

describe('bowling tactics', () => {
  it('attacking fields buy wickets at the cost of boundaries; defensive fields save runs', () => {
    expect(ballOdds({ ...base, field: 'attacking' }).wicket).toBeGreaterThan(ballOdds(base).wicket)
    expect(boundary({ ...base, field: 'attacking' })).toBeGreaterThan(boundary(base))
    expect(boundary({ ...base, field: 'defensive' })).toBeLessThan(boundary(base))
    expect(ballOdds({ ...base, field: 'defensive' }).wicket).toBeLessThan(ballOdds(base).wicket)
  })

  it('an attacking bowler takes more risk than a containing one', () => {
    expect(ballOdds({ ...base, bowlIntent: 1 }).wicket).toBeGreaterThan(
      ballOdds({ ...base, bowlIntent: -1 }).wicket,
    )
    expect(wideFactor({ ...base, bowlIntent: 1 })).toBeGreaterThan(1)
  })

  it('yorkers work best from a yorker specialist', () => {
    const spec = { ...base, bowler: { ...pacer, traits: ['yorker-specialist' as const] } }
    expect(boundary({ ...spec, plan: 'yorkers' })).toBeLessThan(
      boundary({ ...base, plan: 'yorkers' }),
    )
    expect(boundary({ ...base, plan: 'yorkers' })).toBeLessThan(boundary(base))
  })

  it('a wide line costs wides but saves boundaries', () => {
    expect(wideFactor({ ...base, plan: 'wide' })).toBeGreaterThan(1.5)
    expect(boundary({ ...base, plan: 'wide' })).toBeLessThan(boundary(base))
  })

  it('batting skills: spin basher feasts on spin', () => {
    const spinner = player({ role: 'bowler', bowlingType: 'spin', bowling: 72 })
    const sb = { ...base, phase: 'middle' as const, bowler: spinner }
    expect(boundary({ ...sb, batter: { ...bat, traits: ['spin-basher'] } })).toBeGreaterThan(
      boundary(sb),
    )
  })

  it('odds always sum to 1', () => {
    for (const field of ['attacking', 'balanced', 'defensive'] as const)
      for (const plan of ['stock', 'yorkers', 'bouncers', 'wide', 'variations'] as const) {
        const o = ballOdds({ ...base, field, plan, bowlIntent: 1, intent: 2 })
        expect(Object.values(o).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9)
      }
  })
})
