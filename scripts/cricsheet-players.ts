/**
 * Per-player aggregates from Cricsheet IPL ball-by-ball JSON, used to rate players from
 * real recent performance.
 *
 *   npx tsx scripts/cricsheet-players.ts <unzipped-dir> [fromSeason=2023]
 *
 * Writes scripts/source/player-stats.json (aggregates only, keyed by Cricsheet's name,
 * e.g. "V Kohli"). Data: Cricsheet (https://cricsheet.org), Open Data Commons Attribution.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface Delivery {
  batter: string
  bowler: string
  runs: { batter: number; extras: number; total: number }
  extras?: { wides?: number; noballs?: number; byes?: number; legbyes?: number }
  wickets?: { kind: string; player_out: string; fielders?: { name?: string }[] }[]
}
interface MatchFile {
  info: { season: string | number }
  innings: { super_over?: boolean; overs?: { deliveries: Delivery[] }[] }[]
}

export interface PlayerAgg {
  /** Batting */
  balls: number
  runs: number
  outs: number
  fours: number
  sixes: number
  /** Matches in which he faced a ball. */
  inns: number
  /** Bowling */
  bowled: number
  conceded: number
  wkts: number
  dots: number
  /** Stumpings made (a wicketkeeper marker). */
  stumpings: number
}

const [dir, fromArg] = process.argv.slice(2)
if (!dir) throw new Error('usage: tsx scripts/cricsheet-players.ts <dir> [fromSeason]')
const from = Number(fromArg ?? 2023)
const stats: Record<string, PlayerAgg> = {}
const get = (n: string): PlayerAgg =>
  (stats[n] ??= {
    balls: 0,
    runs: 0,
    outs: 0,
    fours: 0,
    sixes: 0,
    inns: 0,
    bowled: 0,
    conceded: 0,
    wkts: 0,
    dots: 0,
    stumpings: 0,
  })

let matches = 0
for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const m = JSON.parse(readFileSync(join(dir, f), 'utf8')) as MatchFile
  if (Number(String(m.info.season).slice(0, 4)) < from) continue
  matches++
  const faced = new Set<string>()
  for (const inn of m.innings) {
    if (inn.super_over) continue
    for (const o of inn.overs ?? []) {
      for (const d of o.deliveries) {
        const ex = d.extras ?? {}
        const legal = !ex.wides && !ex.noballs
        const b = get(d.batter)
        if (!ex.wides) b.balls++
        b.runs += d.runs.batter
        if (d.runs.batter === 4) b.fours++
        if (d.runs.batter === 6) b.sixes++
        faced.add(d.batter)
        const bw = get(d.bowler)
        if (legal) bw.bowled++
        // Byes and leg-byes are not charged to the bowler.
        bw.conceded += d.runs.batter + (ex.wides ?? 0) + (ex.noballs ?? 0)
        if (legal && d.runs.total === 0 && !d.wickets?.length) bw.dots++
        for (const w of d.wickets ?? []) {
          if (w.kind === 'retired hurt' || w.kind === 'retired out') continue
          get(w.player_out).outs++
          if (w.kind !== 'run out') bw.wkts++
          if (w.kind === 'stumped')
            for (const fl of w.fielders ?? []) if (fl.name) get(fl.name).stumpings++
        }
      }
    }
  }
  for (const n of faced) get(n).inns++
}

writeFileSync(new URL('./source/player-stats.json', import.meta.url), JSON.stringify(stats) + '\n')
console.log(`${matches} matches since ${from}, ${Object.keys(stats).length} players`)
