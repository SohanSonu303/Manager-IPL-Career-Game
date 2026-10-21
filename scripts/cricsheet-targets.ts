/**
 * Builds calibration targets from Cricsheet IPL ball-by-ball JSON.
 *
 *   1. Download https://cricsheet.org/downloads/ipl_json.zip and unzip it somewhere
 *   2. npx tsx scripts/cricsheet-targets.ts <unzipped-dir> [fromSeason=2024]
 *
 * Writes src/sim/calibration/targets.json (aggregate numbers only).
 * Data: Cricsheet (https://cricsheet.org), Open Data Commons Attribution License.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface Delivery {
  batter: string
  runs: { batter: number; extras: number; total: number }
  extras?: { wides?: number; noballs?: number; byes?: number; legbyes?: number; penalty?: number }
  wickets?: { kind: string }[]
}
interface Innings {
  team: string
  overs?: { over: number; deliveries: Delivery[] }[]
  super_over?: boolean
}
interface MatchFile {
  info: {
    season: string | number
    outcome: { winner?: string; result?: string; method?: string; eliminator?: string }
    overs?: number
    toss: { winner: string; decision: string }
  }
  innings: Innings[]
}

const [dir, fromArg] = process.argv.slice(2)
if (!dir) throw new Error('usage: tsx scripts/cricsheet-targets.ts <dir> [fromSeason]')
const fromSeason = Number(fromArg ?? 2024)

const phaseOf = (over: number) => (over < 6 ? 'powerplay' : over < 15 ? 'middle' : 'death')
type Phase = ReturnType<typeof phaseOf>

const legalBalls = { powerplay: 0, middle: 0, death: 0 }
const phaseRuns = { powerplay: 0, middle: 0, death: 0 }
const phaseWkts = { powerplay: 0, middle: 0, death: 0 }
const phaseShots = {
  powerplay: { dot: 0, four: 0, six: 0 },
  middle: { dot: 0, four: 0, six: 0 },
  death: { dot: 0, four: 0, six: 0 },
}
let legal = 0
let dots = 0
let fours = 0
let sixes = 0
let singles = 0
let twos = 0
let threes = 0
const extras = { wides: 0, noballs: 0, byes: 0, legbyes: 0 }
const dismissals: Record<string, number> = {}
const firstInnings: number[] = []
const wicketsPerInnings: number[] = []
let innCount = 0
let matches = 0
let chaseWins = 0
let decided = 0
let ties = 0

for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const m = JSON.parse(readFileSync(join(dir, f), 'utf8')) as MatchFile
  const season = Number(String(m.info.season).slice(0, 4))
  if (season < fromSeason) continue
  // Only full 20-over games with a normal result (no rain rules, no abandonments).
  if (m.info.outcome.method || m.info.outcome.result === 'no result') continue
  const main = m.innings.filter((i) => !i.super_over)
  if (main.length !== 2) continue
  matches++

  main.forEach((inn, idx) => {
    let runs = 0
    let wkts = 0
    for (const o of inn.overs ?? []) {
      const ph: Phase = phaseOf(o.over)
      for (const d of o.deliveries) {
        runs += d.runs.total
        phaseRuns[ph] += d.runs.total
        const ex = d.extras ?? {}
        extras.wides += ex.wides ?? 0
        extras.noballs += ex.noballs ?? 0
        extras.byes += ex.byes ?? 0
        extras.legbyes += ex.legbyes ?? 0
        const isLegal = !ex.wides && !ex.noballs
        if (isLegal) {
          legal++
          legalBalls[ph]++
          if (d.runs.total === 0 && !d.wickets?.length) {
            dots++
            phaseShots[ph].dot++
          }
          const b = d.runs.batter
          if (b === 4) phaseShots[ph].four++
          if (b === 6) phaseShots[ph].six++
          if (b === 4) fours++
          else if (b === 6) sixes++
          else if (b === 1) singles++
          else if (b === 2) twos++
          else if (b === 3) threes++
        }
        for (const w of d.wickets ?? []) {
          if (w.kind === 'retired hurt' || w.kind === 'retired out') continue
          wkts++
          phaseWkts[ph]++
          dismissals[w.kind] = (dismissals[w.kind] ?? 0) + 1
        }
      }
    }
    innCount++
    wicketsPerInnings.push(wkts)
    if (idx === 0) firstInnings.push(runs)
  })

  if (m.info.outcome.result === 'tie') ties++
  const chasing = main[1]?.team
  if (m.info.outcome.winner && !m.info.outcome.eliminator) {
    decided++
    if (m.info.outcome.winner === chasing) chaseWins++
  }
}

const round = (v: number, dp = 3) => Number(v.toFixed(dp))
const sorted = [...firstInnings].sort((a, b) => a - b)
const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const sd = (xs: number[]) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)))
const totalWkts = Object.values(dismissals).reduce((a, b) => a + b, 0)

const targets = {
  source: `Cricsheet IPL ball-by-ball (https://cricsheet.org), seasons ${fromSeason}+, ODC-By licence. Aggregates only.`,
  matches,
  runRate: round((Object.values(phaseRuns).reduce((a, b) => a + b, 0) / legal) * 6, 2),
  phaseRunRate: {
    powerplay: round((phaseRuns.powerplay / legalBalls.powerplay) * 6, 2),
    middle: round((phaseRuns.middle / legalBalls.middle) * 6, 2),
    death: round((phaseRuns.death / legalBalls.death) * 6, 2),
  },
  phaseWicketPerBall: {
    powerplay: round(phaseWkts.powerplay / legalBalls.powerplay, 4),
    middle: round(phaseWkts.middle / legalBalls.middle, 4),
    death: round(phaseWkts.death / legalBalls.death, 4),
  },
  phasePerLegalBall: Object.fromEntries(
    (['powerplay', 'middle', 'death'] as const).map((ph) => [
      ph,
      {
        dot: round(phaseShots[ph].dot / legalBalls[ph]),
        four: round(phaseShots[ph].four / legalBalls[ph]),
        six: round(phaseShots[ph].six / legalBalls[ph]),
      },
    ]),
  ),
  perLegalBall: {
    dot: round(dots / legal),
    single: round(singles / legal),
    two: round(twos / legal),
    three: round(threes / legal, 4),
    four: round(fours / legal),
    six: round(sixes / legal),
  },
  extrasPerInnings: {
    wides: round(extras.wides / innCount, 2),
    noballs: round(extras.noballs / innCount, 2),
    byes: round(extras.byes / innCount, 2),
    legbyes: round(extras.legbyes / innCount, 2),
  },
  firstInnings: {
    mean: round(mean(firstInnings), 1),
    sd: round(sd(firstInnings), 1),
    p10: pct(0.1),
    p50: pct(0.5),
    p90: pct(0.9),
  },
  wicketsPerInnings: round(mean(wicketsPerInnings), 2),
  chaseWinRate: round(chaseWins / decided),
  tieRate: round(ties / matches, 4),
  dismissals: Object.fromEntries(
    Object.entries(dismissals)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [k, round(v / totalWkts)]),
  ),
}

const out = new URL('../src/sim/calibration/targets.json', import.meta.url)
writeFileSync(out, JSON.stringify(targets, null, 2) + '\n')
console.log(JSON.stringify(targets, null, 2))
