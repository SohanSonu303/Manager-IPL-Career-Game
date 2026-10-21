/**
 * Build the win-probability table: mean and spread of the runs still to come from every
 * (balls left, wickets lost) state, measured over many simulated first innings.
 *
 *   npm run winprob            # 20,000 matches
 */
import { writeFileSync } from 'node:fs'
import { teams } from '../src/data/index.ts'
import { squads } from '../src/sim/calibration/harness.ts'
import { simMatch } from '../src/sim/match/engine.ts'
import { setupMatch } from '../src/sim/match/setup.ts'
import { deriveSeed } from '../src/sim/rng.ts'

const n = Number(process.argv[2] ?? 20_000)
const BALLS = 121
const WKTS = 10
const sum = Array.from({ length: BALLS * WKTS }, () => 0)
const sq = Array.from({ length: BALLS * WKTS }, () => 0)
const count = Array.from({ length: BALLS * WKTS }, () => 0)

for (let i = 0; i < n; i++) {
  const h = i % teams.length
  const a = (h + 1 + (Math.floor(i / teams.length) % (teams.length - 1))) % teams.length
  const { state, rng } = setupMatch({
    seed: deriveSeed(99, 'winprob', i),
    homeId: teams[h]?.id as string,
    awayId: teams[a]?.id as string,
    squads,
  })
  simMatch(state, rng)
  const inn = state.innings[0]
  if (!inn) continue
  // State before each legal ball, plus the end state.
  let runs = 0
  let wkts = 0
  let legal = 0
  const add = () => {
    if (wkts >= WKTS) return
    const k = (120 - legal) * WKTS + wkts
    const rest = inn.runs - runs
    sum[k] = (sum[k] ?? 0) + rest
    sq[k] = (sq[k] ?? 0) + rest * rest
    count[k] = (count[k] ?? 0) + 1
  }
  for (const e of inn.events) {
    if (e.legal && legal === e.score.legalBalls - 1) add()
    runs = e.score.runs
    wkts = e.score.wickets
    legal = e.score.legalBalls
  }
}

// Mean and sd per cell; thin cells borrow from the neighbour with one wicket fewer.
const mean: number[] = []
const sd: number[] = []
for (let b = 0; b < BALLS; b++) {
  for (let w = 0; w < WKTS; w++) {
    const k = b * WKTS + w
    const c = count[k] ?? 0
    if (b === 0) {
      mean.push(0)
      sd.push(0)
    } else if (c >= 30) {
      const m = (sum[k] ?? 0) / c
      mean.push(Number(m.toFixed(2)))
      sd.push(Number(Math.sqrt(Math.max(0, (sq[k] ?? 0) / c - m * m)).toFixed(2)))
    } else {
      const prevW = w > 0 ? k - 1 : (b - 1) * WKTS + w
      const scale = w > 0 ? 0.8 : b / (b + 1)
      mean.push(Number(((mean[prevW] ?? 0) * scale).toFixed(2)))
      sd.push(Number(((sd[prevW] ?? 0) * Math.sqrt(scale)).toFixed(2)))
    }
  }
}
const out = new URL('../src/sim/match/winprob.json', import.meta.url)
writeFileSync(out, JSON.stringify({ matches: n, balls: BALLS, wickets: WKTS, mean, sd }) + '\n')
console.log(`win-prob table from ${n} matches → src/sim/match/winprob.json`)
