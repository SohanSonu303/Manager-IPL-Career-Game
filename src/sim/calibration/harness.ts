import { players, teams } from '../../data'
import { deriveSeed } from '../rng'
import { simMatch } from '../match/engine'
import { setupMatch } from '../match/setup'
import type { Selectable } from '../match/selection'
import { phaseOf, type MatchState } from '../match/types'
import targets from './targets.json'

export type Targets = typeof targets
export { targets }

/** Same shape as the parts of targets.json the harness can measure. */
export interface SimStats {
  matches: number
  runRate: number
  phaseRunRate: Record<'powerplay' | 'middle' | 'death', number>
  phaseWicketPerBall: Record<'powerplay' | 'middle' | 'death', number>
  perLegalBall: {
    dot: number
    single: number
    two: number
    three: number
    four: number
    six: number
  }
  extrasPerInnings: { wides: number; noballs: number; byes: number; legbyes: number }
  firstInnings: { mean: number; sd: number; p10: number; p50: number; p90: number }
  wicketsPerInnings: number
  chaseWinRate: number
  tieRate: number
  dismissals: Record<string, number>
}

const squads: Record<string, Selectable[]> = Object.fromEntries(
  teams.map((t) => [
    t.id,
    players.filter((p) => p.teamId === t.id).map((p) => ({ ...p, fitness: 100, form: 50 })),
  ]),
)

/** Play `n` AI-vs-AI matches between random pairs of the real squads and aggregate. */
export function runCalibration(n: number, seed = 1): SimStats {
  const phases = ['powerplay', 'middle', 'death'] as const
  const legal = { powerplay: 0, middle: 0, death: 0 }
  const runs = { powerplay: 0, middle: 0, death: 0 }
  const wkts = { powerplay: 0, middle: 0, death: 0 }
  const shots = { dot: 0, single: 0, two: 0, three: 0, four: 0, six: 0 }
  const extras = { wides: 0, noballs: 0, byes: 0, legbyes: 0 }
  const dismissals: Record<string, number> = {}
  const firsts: number[] = []
  const wicketsPerInn: number[] = []
  let chaseWins = 0
  let decided = 0
  let ties = 0

  for (let i = 0; i < n; i++) {
    const h = i % teams.length
    const a = (h + 1 + (Math.floor(i / teams.length) % (teams.length - 1))) % teams.length
    const home = teams[h]?.id as string
    const away = teams[a]?.id as string
    const { state, rng } = setupMatch({
      seed: deriveSeed(seed, 'cal', i),
      homeId: home,
      awayId: away,
      squads,
    })
    simMatch(state, rng)
    collect(state)
  }

  function collect(state: MatchState) {
    state.innings.slice(0, 2).forEach((inn, idx) => {
      for (const e of inn.events) {
        const ph = phaseOf(e.over)
        runs[ph] += e.total
        if (e.extra) {
          const k = { wide: 'wides', noball: 'noballs', bye: 'byes', legbye: 'legbyes' } as const
          extras[k[e.extra.kind]] += e.extra.runs
        }
        if (e.legal) {
          legal[ph]++
          if (e.total === 0 && !e.wicket) shots.dot++
          if (e.runs === 1) shots.single++
          if (e.runs === 2) shots.two++
          if (e.runs === 3) shots.three++
          if (e.runs === 4) shots.four++
          if (e.runs === 6) shots.six++
        }
        if (e.wicket) {
          wkts[ph]++
          const kind = {
            caught: 'caught',
            bowled: 'bowled',
            lbw: 'lbw',
            runOut: 'run out',
            stumped: 'stumped',
            hitWicket: 'hit wicket',
          }[e.wicket.kind]
          dismissals[kind] = (dismissals[kind] ?? 0) + 1
        }
      }
      wicketsPerInn.push(inn.wickets)
      if (idx === 0) firsts.push(inn.runs)
    })
    const r = state.result
    if (state.innings.length > 2) ties++
    else if (r?.winnerId) {
      decided++
      if (r.winnerId === state.order[1]) chaseWins++
    }
  }

  const totalLegal = legal.powerplay + legal.middle + legal.death
  const round = (v: number, dp = 3) => Number(v.toFixed(dp))
  const sorted = [...firsts].sort((x, y) => x - y)
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
  const m = mean(firsts)
  const totalW = Object.values(dismissals).reduce((s, x) => s + x, 0)
  const inns = n * 2
  return {
    matches: n,
    runRate: round(((runs.powerplay + runs.middle + runs.death) / totalLegal) * 6, 2),
    phaseRunRate: Object.fromEntries(
      phases.map((p) => [p, round((runs[p] / legal[p]) * 6, 2)]),
    ) as SimStats['phaseRunRate'],
    phaseWicketPerBall: Object.fromEntries(
      phases.map((p) => [p, round(wkts[p] / legal[p], 4)]),
    ) as SimStats['phaseWicketPerBall'],
    perLegalBall: {
      dot: round(shots.dot / totalLegal),
      single: round(shots.single / totalLegal),
      two: round(shots.two / totalLegal),
      three: round(shots.three / totalLegal, 4),
      four: round(shots.four / totalLegal),
      six: round(shots.six / totalLegal),
    },
    extrasPerInnings: {
      wides: round(extras.wides / inns, 2),
      noballs: round(extras.noballs / inns, 2),
      byes: round(extras.byes / inns, 2),
      legbyes: round(extras.legbyes / inns, 2),
    },
    firstInnings: {
      mean: round(m, 1),
      sd: round(Math.sqrt(mean(firsts.map((x) => (x - m) ** 2))), 1),
      p10: pct(0.1),
      p50: pct(0.5),
      p90: pct(0.9),
    },
    wicketsPerInnings: round(mean(wicketsPerInn), 2),
    chaseWinRate: round(chaseWins / Math.max(1, decided)),
    tieRate: round(ties / n, 4),
    dismissals: Object.fromEntries(
      Object.entries(dismissals)
        .sort((x, y) => y[1] - x[1])
        .map(([k, v]) => [k, round(v / totalW)]),
    ),
  }
}
