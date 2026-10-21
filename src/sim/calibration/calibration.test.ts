import { describe, expect, it } from 'vitest'
import { runCalibration, targets } from './harness'

/**
 * The calibration harness as a test: simulated T20 cricket must stay close to real IPL
 * numbers (2024+). The full 10,000-match report is `npm run calibrate`.
 */
describe('calibration vs real IPL', () => {
  const sim = runCalibration(3000, 7)
  const near = (actual: number, expected: number, tolerance: number) =>
    expect(Math.abs(actual - expected), `${actual} vs ${expected}`).toBeLessThanOrEqual(tolerance)

  it('run rates overall and by phase', () => {
    near(sim.runRate, targets.runRate, 0.3)
    near(sim.phaseRunRate.powerplay, targets.phaseRunRate.powerplay, 0.5)
    near(sim.phaseRunRate.middle, targets.phaseRunRate.middle, 0.5)
    near(sim.phaseRunRate.death, targets.phaseRunRate.death, 0.6)
  })

  it('first-innings total distribution', () => {
    near(sim.firstInnings.mean, targets.firstInnings.mean, 8)
    near(sim.firstInnings.sd, targets.firstInnings.sd, 6)
    near(sim.firstInnings.p10, targets.firstInnings.p10, 12)
    near(sim.firstInnings.p90, targets.firstInnings.p90, 12)
  })

  it('wickets, boundaries, dots, extras', () => {
    near(sim.wicketsPerInnings, targets.wicketsPerInnings, 0.4)
    near(sim.phaseWicketPerBall.death, targets.phaseWicketPerBall.death, 0.012)
    near(sim.perLegalBall.dot, targets.perLegalBall.dot, 0.02)
    near(sim.perLegalBall.four, targets.perLegalBall.four, 0.012)
    near(sim.perLegalBall.six, targets.perLegalBall.six, 0.012)
    near(sim.extrasPerInnings.wides, targets.extrasPerInnings.wides, 0.8)
  })

  it('chase win rate and ties', () => {
    near(sim.chaseWinRate, targets.chaseWinRate, 0.06)
    expect(sim.tieRate).toBeLessThan(0.03)
  })
})
