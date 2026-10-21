/**
 * Calibration run: simulate many AI-vs-AI matches and compare with real IPL numbers.
 *
 *   npm run calibrate            # 10,000 matches
 *   npm run calibrate -- 2000    # fewer, faster
 */
import { runCalibration, targets } from '../src/sim/calibration/harness.ts'

const n = Number(process.argv[2] ?? 10_000)
const t0 = performance.now()
const sim = runCalibration(n)
const secs = ((performance.now() - t0) / 1000).toFixed(1)

const rows: [string, number, number][] = [
  ['run rate', targets.runRate, sim.runRate],
  ['RR powerplay', targets.phaseRunRate.powerplay, sim.phaseRunRate.powerplay],
  ['RR middle', targets.phaseRunRate.middle, sim.phaseRunRate.middle],
  ['RR death', targets.phaseRunRate.death, sim.phaseRunRate.death],
  ['wkt/ball powerplay', targets.phaseWicketPerBall.powerplay, sim.phaseWicketPerBall.powerplay],
  ['wkt/ball middle', targets.phaseWicketPerBall.middle, sim.phaseWicketPerBall.middle],
  ['wkt/ball death', targets.phaseWicketPerBall.death, sim.phaseWicketPerBall.death],
  ['dot %', targets.perLegalBall.dot, sim.perLegalBall.dot],
  ['single %', targets.perLegalBall.single, sim.perLegalBall.single],
  ['two %', targets.perLegalBall.two, sim.perLegalBall.two],
  ['four %', targets.perLegalBall.four, sim.perLegalBall.four],
  ['six %', targets.perLegalBall.six, sim.perLegalBall.six],
  ['wides / inns', targets.extrasPerInnings.wides, sim.extrasPerInnings.wides],
  ['no-balls / inns', targets.extrasPerInnings.noballs, sim.extrasPerInnings.noballs],
  ['leg-byes / inns', targets.extrasPerInnings.legbyes, sim.extrasPerInnings.legbyes],
  ['1st inns mean', targets.firstInnings.mean, sim.firstInnings.mean],
  ['1st inns sd', targets.firstInnings.sd, sim.firstInnings.sd],
  ['1st inns p10', targets.firstInnings.p10, sim.firstInnings.p10],
  ['1st inns p50', targets.firstInnings.p50, sim.firstInnings.p50],
  ['1st inns p90', targets.firstInnings.p90, sim.firstInnings.p90],
  ['wickets / inns', targets.wicketsPerInnings, sim.wicketsPerInnings],
  ['chase win %', targets.chaseWinRate, sim.chaseWinRate],
  ['tie %', targets.tieRate, sim.tieRate],
]

console.log(`${n} matches in ${secs}s\n`)
console.log('metric'.padEnd(22) + 'real'.padStart(9) + 'sim'.padStart(9) + 'diff'.padStart(9))
for (const [name, real, s] of rows) {
  const diff = s - real
  const rel = real ? Math.abs(diff / real) : 0
  const flag = rel > 0.08 ? '  <--' : ''
  console.log(
    name.padEnd(22) +
      String(real).padStart(9) +
      String(s).padStart(9) +
      diff.toFixed(3).padStart(9) +
      flag,
  )
}
console.log('\ndismissals (sim):', sim.dismissals)
console.log(
  `fielding (sim): ${sim.dropsPerMatch} drops, ${sim.misfieldsPerMatch} misfields per match`,
)
