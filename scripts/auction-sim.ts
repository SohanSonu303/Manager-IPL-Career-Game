/**
 * Mega auction check: run many CPU-only auctions and report how the clubs built their
 * squads (balance, prices, purse use, how many players the league had to hand out).
 *
 *   npm run auction            # 12 auctions
 *   npm run auction -- 40      # more
 *   npm run auction -- 3 log   # also print every CPU decision on the marquee set
 */
import { teams } from '../src/data/index.ts'
import {
  autoAuction,
  confirmRetention,
  explainLot,
  nextLot,
  setAutoBid,
  simAuction,
  startMega,
  suggestRetention,
} from '../src/sim/auction.ts'
import { capabilities, depthFor, personalityOf, primaryRole } from '../src/sim/auctionAI.ts'
import type { Career } from '../src/sim/career.ts'
import { finishMega, startCareer } from '../src/sim/game.ts'
import { payroll, SALARY_CAP, squadOf } from '../src/sim/market.ts'
import { overallRating } from '../src/sim/player.ts'

const runs = Number(process.argv[2] ?? 12)
const log = process.argv[3] === 'log'
const ids = teams.map((t) => t.id)

interface Row {
  size: number
  filled: number
  keepers: number
  pace: number
  spin: number
  death: number
  finishers: number
  allrounders: number
  overseas: number
  purseLeft: number
  earlyShare: number
  xi: number
  maxPrice: number
  overloaded: number
  thin: number
}
const rows: Row[] = []
let unsold = 0
let lots = 0
const prices: number[] = []
const t0 = performance.now()

for (let seed = 1; seed <= runs; seed++) {
  const manager = ids[seed % ids.length] as string
  let c: Career = startMega(startCareer({ seed, managerName: 'Sim', teamId: manager }), 2028)
  // The manager's club is played by the captain too, so all ten clubs are CPU.
  c = confirmRetention(c, suggestRetention(c))
  if (log && seed === 1) {
    c = setAutoBid(c, true)
    for (let i = 0; i < (c.mega?.sets[0]?.ids.length ?? 0); i++) {
      c = nextLot(c)
      for (const d of explainLot(c))
        if (d.decision !== 'skip' || d.team === 'che') console.log(d.text)
      console.log('---')
      c = simAuction(c).career
    }
  }
  c = autoAuction(c)
  const m = c.mega!
  const before = Object.fromEntries(ids.map((t) => [t, squadOf(c.players, t).length]))
  const total = m.sets.reduce((s, x) => s + x.ids.length, 0)
  const early = new Set(m.sets.flatMap((s) => s.ids).slice(0, Math.floor(total / 3)))
  lots += total
  unsold += m.unsold.length
  prices.push(...m.sold.map((s) => s.price))
  const startPurse = Object.fromEntries(
    ids.map((t) => [
      t,
      (m.purses[t] ?? 0) + m.sold.filter((s) => s.teamId === t).reduce((a, s) => a + s.price, 0),
    ]),
  )
  const purseLeft = { ...m.purses }
  for (const t of ids)
    if (payroll(c.players, t) > SALARY_CAP) console.log(`over cap at the hammer: seed ${seed} ${t}`)
  const done = finishMega(c)
  for (const t of ids) {
    const squad = squadOf(done.players, t)
    const caps = (k: string) =>
      squad.filter((p) => (capabilities(p)[k as never] ?? 0) >= 0.5).length
    const xi = squad
      .map(overallRating)
      .sort((a, b) => b - a)
      .slice(0, 11)
    rows.push({
      size: before[t] as number,
      filled: squad.length - (before[t] as number),
      keepers: squad.filter((p) => p.role === 'wicketkeeper').length,
      pace: caps('pace'),
      spin: caps('spin'),
      death: caps('death'),
      finishers: caps('finisher'),
      allrounders: squad.filter((p) => p.role === 'allrounder').length,
      overseas: squad.filter((p) => p.overseas).length,
      purseLeft: (purseLeft[t] ?? 0) / 100,
      earlyShare:
        m.sold
          .filter((s) => s.teamId === t && early.has(s.playerId))
          .reduce((a, s) => a + s.price, 0) / Math.max(1, startPurse[t] as number),
      xi: xi.reduce((a, v) => a + v, 0) / xi.length,
      maxPrice: Math.max(0, ...m.sold.filter((s) => s.teamId === t).map((s) => s.price)) / 100,
      // Primary roles more than 2 over (or more than 1 under) the club's own depth plan.
      ...(() => {
        const depth = depthFor(personalityOf(seed, ids, t).squadTarget)
        const roles = ['keeper', 'top', 'finisher', 'allround', 'pace', 'spin'] as const
        const n = (r: string) => squad.filter((p) => primaryRole(p) === r).length
        return {
          overloaded: roles.filter((r) => n(r) > depth[r] + 2).length,
          thin: roles.filter((r) => n(r) < depth[r] - 1).length,
        }
      })(),
    })
    if (seed === 1 && t === ids[3])
      console.log(
        `example ${t} (${personalityOf(seed, ids, t).style}):`,
        squad
          .map((p) => `${p.name} ${primaryRole(p)} ${overallRating(p)} ${p.contract?.salary}`)
          .join(' | '),
      )
  }
}

const avg = (k: keyof Row) => rows.reduce((s, r) => s + r[k], 0) / rows.length
const min = (k: keyof Row) => Math.min(...rows.map((r) => r[k]))
const max = (k: keyof Row) => Math.max(...rows.map((r) => r[k]))
const pct = (q: number) => {
  const s = [...prices].sort((a, b) => a - b)
  return (s[Math.floor(q * (s.length - 1))] ?? 0) / 100
}
console.log(
  `${runs} auctions, ${rows.length} squads, ${((performance.now() - t0) / 1000).toFixed(1)} s`,
)
console.log(
  `sold ${(100 - (100 * unsold) / lots).toFixed(0)}% of lots; price cr p50 ${pct(0.5)} p90 ${pct(0.9)} max ${pct(1)}`,
)
const keys: (keyof Row)[] = [
  'overloaded',
  'thin',
  'size',
  'filled',
  'keepers',
  'pace',
  'spin',
  'death',
  'finishers',
  'allrounders',
  'overseas',
  'purseLeft',
  'earlyShare',
  'xi',
  'maxPrice',
]
for (const k of keys)
  console.log(
    `${k.padEnd(12)} avg ${avg(k).toFixed(2).padStart(6)}  min ${min(k).toFixed(2).padStart(6)}  max ${max(k).toFixed(2).padStart(6)}`,
  )
console.log(
  `squads short of 18 before the league topped them up: ${rows.filter((r) => r.size < 18).length}`,
)
console.log(`squads with no keeper bought or kept: ${rows.filter((r) => r.keepers === 0).length}`)
