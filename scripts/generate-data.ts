/**
 * Builds src/data/players.json and src/data/teams.json.
 *
 *   rosters.txt     real IPL 2026 squads (who plays for whom, birth dates, styles, salaries)
 *   player-stats.json   Cricsheet per-player aggregates since 2023 (our ratings come from these)
 *   real-players.ts older hand list: roles/tiers for known players and extra free agents
 *
 * Deterministic: same sources + same seed = same output. See src/data/README.md.
 *
 *   npm run data
 */
import { readFileSync, writeFileSync } from 'node:fs'
import {
  CREST_SHAPES,
  type BowlingType,
  type CrestSpec,
  type Nationality,
  type Player,
  type Role,
  type Team,
  type Trait,
} from '../src/data/types.ts'
import { overallRating, potentialFor } from '../src/sim/player.ts'
import { createRng, gaussian, hashString, pick, pickWeighted, randInt } from '../src/sim/rng.ts'
import { knownTraits } from './source/known-traits.ts'
import { realPlayers } from './source/real-players.ts'
import { sourceTeams } from './source/teams.ts'

const SEED = 20261
const START_YEAR = 2026
const rng = createRng(SEED)
const crestRng = createRng(SEED + 7)
const clamp = (v: number, lo = 1, hi = 99) => Math.max(lo, Math.min(hi, Math.round(v)))

const COUNTRY: Record<string, Nationality> = {
  India: 'IND',
  Australia: 'AUS',
  England: 'ENG',
  'South Africa': 'RSA',
  'New Zealand': 'NZ',
  'West Indies': 'WI',
  Afghanistan: 'AFG',
  'Sri Lanka': 'SL',
  Bangladesh: 'BAN',
  Zimbabwe: 'ZIM',
}

/** Roster spelling for players the older hand list spelled differently. */
const ALIAS_TO_ROSTER: Record<string, string> = {
  'Vaibhav Suryavanshi': 'Vaibhav Sooryavanshi',
  'Rasikh Dar': 'Rasikh Salam',
}

/** Roster name -> Cricsheet name, where the usual initials+surname match cannot work. */
const CRICSHEET_ALIAS: Record<string, string> = {
  'Vaibhav Sooryavanshi': 'V Suryavanshi',
  'Varun Chakravarthy': 'CV Varun',
  'Sai Sudharsan': 'B Sai Sudharsan',
  'Nitish Kumar Reddy': 'Nithish Kumar Reddy',
  'Angkrish Raghuvanshi': 'A Raghuvanshi',
  'Rasikh Salam': 'Rasikh Dar',
  'Prasidh Krishna': 'M Prasidh Krishna',
  'Sai Kishore': 'R Sai Kishore',
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.'’-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Per-player aggregates written by scripts/cricsheet-players.ts. */
interface PlayerAgg {
  balls: number
  runs: number
  outs: number
  fours: number
  sixes: number
  inns: number
  bowled: number
  conceded: number
  wkts: number
  dots: number
  stumpings: number
}

// --- Sources ------------------------------------------------------------------------

const stats = JSON.parse(
  readFileSync(new URL('./source/player-stats.json', import.meta.url), 'utf8'),
) as Record<string, PlayerAgg>

interface RosterEntry {
  teamId: string | null
  name: string
  country: string
  dob: string
  style: string
  salaryCr: number
  status: 'A' | 'R' | 'W'
  wk: boolean
}

function parseRosters(): RosterEntry[] {
  const out: RosterEntry[] = []
  let team: string | null = null
  for (const raw of readFileSync(new URL('./source/rosters.txt', import.meta.url), 'utf8').split(
    '\n',
  )) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('@')) {
      team = line.slice(1)
      continue
    }
    const [name, country, dob, style, salary, status, flag] = line.split('|').map((x) => x.trim())
    if (!name || !country || !dob || !style || !salary || !status)
      throw new Error(`Bad roster line: ${line}`)
    if (!(country in COUNTRY)) throw new Error(`Unknown country ${country} for ${name}`)
    out.push({
      teamId: status === 'W' ? null : team,
      name,
      country,
      dob,
      style,
      salaryCr: Number(salary),
      status: status as RosterEntry['status'],
      wk: flag === 'wk',
    })
  }
  return out
}

// --- Cricsheet name matching ------------------------------------------------------------

const byNorm = new Map(Object.keys(stats).map((n) => [norm(n), n]))
const bySurname = new Map<string, string[]>()
for (const n of Object.keys(stats)) {
  const last = norm(n).split(' ').pop() as string
  bySurname.set(last, [...(bySurname.get(last) ?? []), n])
}
const volume = (s: PlayerAgg) => s.balls + s.bowled

/** Cricsheet record for a full name: alias, exact, then surname + initial (busiest wins). */
function statsFor(full: string): { key: string; agg: PlayerAgg } | null {
  const alias = CRICSHEET_ALIAS[full]
  const direct = (alias ? byNorm.get(norm(alias)) : undefined) ?? byNorm.get(norm(full))
  if (direct) return { key: direct, agg: stats[direct] as PlayerAgg }
  const parts = norm(full).split(' ')
  const last = parts.at(-1) as string
  const first = parts[0] as string
  const cands = (bySurname.get(last) ?? []).filter((n) => {
    const initials = norm(n).split(' ')[0] as string
    return initials.length <= 3 ? initials[0] === first[0] : initials === first
  })
  const best = cands.sort(
    (a, b) => volume(stats[b] as PlayerAgg) - volume(stats[a] as PlayerAgg),
  )[0]
  if (best) return { key: best, agg: stats[best] as PlayerAgg }
  // Cricsheet initials need not start with the first name (e.g. "PVD Chameera"): accept
  // a surname that only one Cricsheet player has.
  const only = bySurname.get(last)
  return only?.length === 1
    ? { key: only[0] as string, agg: stats[only[0] as string] as PlayerAgg }
    : null
}

// --- Rating model ------------------------------------------------------------------------

/** Mean of a main skill per tier (older hand tiers, used as a prior only). */
const TIER_MEAN = { 1: 50, 2: 58, 3: 66, 4: 74, 5: 82 } as const

/** Batting rating from real numbers: average and strike rate against the league norm. */
function batFromStats(a: PlayerAgg): number {
  const avg = Math.min(70, a.runs / Math.max(a.outs, 1))
  const sr = (a.runs / Math.max(a.balls, 1)) * 100
  const s = (avg / 30) * 0.5 + (sr / 140) * 0.5
  return clamp(68 + 30 * (s - 1), 30, 92)
}

/** Bowling rating from economy and wickets per over against the league norm. */
function bowlFromStats(a: PlayerAgg): number {
  const econ = (a.conceded / Math.max(a.bowled, 1)) * 6
  const wpo = (a.wkts / Math.max(a.bowled, 1)) * 6
  const s = (9.6 - econ) * 7 + (wpo - 0.25) * 120
  return clamp(66 + 0.75 * s, 30, 92)
}

const shrink = (prior: number, stat: number, n: number, k: number) => {
  const w = n / (n + k)
  return prior * (1 - w) + stat * w
}

interface Draft {
  name: string
  nationality: Nationality
  age: number
  style: string
  bowlingType: BowlingType | null
  role: Role
  /** Prior for the main skill when there is little or no data. */
  prior: number
  agg: PlayerAgg | null
  teamId: string | null
  salaryCr: number | null
}

const bowlingTypeOf = (style: string): BowlingType | null =>
  style === 'none' ? null : /break|spin|orthodox/.test(style) ? 'spin' : 'pace'

/** Role from real usage: keepers flagged, otherwise by how much he bats and bowls. */
function roleOf(style: string, wk: boolean, agg: PlayerAgg | null, known: Role | null): Role {
  if (wk || (agg && agg.stumpings >= 2) || known === 'wicketkeeper') return 'wicketkeeper'
  if (style === 'none') return 'batter'
  if (agg && agg.bowled >= 120) {
    const bats = agg.balls >= 120 && (agg.runs / Math.max(agg.outs, 1) >= 16 || agg.balls >= 250)
    return bats ? 'allrounder' : 'bowler'
  }
  if (agg && agg.balls >= 100) return 'batter'
  return known ?? 'allrounder'
}

function makeRatings(d: Draft): Player['ratings'] {
  const a = d.agg
  const batStat = a && a.balls >= 30 ? batFromStats(a) : null
  const bowlStat = a && a.bowled >= 30 ? bowlFromStats(a) : null
  const bat = (prior: number) =>
    batStat === null ? prior : shrink(prior, batStat, a?.balls ?? 0, 250)
  const bowl = (prior: number) =>
    bowlStat === null ? prior : shrink(prior, bowlStat, a?.bowled ?? 0, 150)
  let batting: number
  let bowling: number
  switch (d.role) {
    case 'batter':
      batting = bat(d.prior)
      bowling = bowlStat !== null ? Math.min(45, bowl(25)) : randInt(rng, 12, 35)
      break
    case 'wicketkeeper':
      batting = bat(d.prior - 1)
      bowling = randInt(rng, 3, 12)
      break
    case 'bowler':
      bowling = bowl(d.prior)
      batting = batStat !== null ? Math.min(45, bat(25)) : randInt(rng, 12, 38)
      break
    case 'allrounder': {
      const lean = gaussian(rng) * 4
      batting = bat(d.prior - 5 + lean)
      bowling = bowl(d.prior - 5 - lean)
      break
    }
  }
  let fielding = randInt(rng, 52, 84) + (d.role === 'wicketkeeper' ? 6 : 0)
  if (d.age > 32) fielding -= (d.age - 32) * 1.5
  return { batting: clamp(batting), bowling: clamp(bowling), fielding: clamp(fielding) }
}

/** Skills: hand-set for known players, else generated from role and ratings. */
function makeTraits(d: Draft, r: Player['ratings']): Trait[] {
  const traits: Trait[] = []
  const bats = d.role !== 'bowler'
  if (bats && r.batting >= 62) {
    const style = pickWeighted(rng, [
      ['big-hitter', 3],
      ['anchor', 2],
      ['finisher', 2],
      ['powerplay-hitter', 2],
      ['spin-basher', 1.5],
      ['pace-hitter', 1.5],
      [null, 5],
    ] as const)
    if (style) traits.push(style)
  }
  if (bats && r.batting < 72 && rng() < 0.15) traits.push('poor-vs-spin')
  if (d.bowlingType === 'pace' && r.bowling >= 60 && traits.length < 2) {
    const style = pickWeighted(rng, [
      ['death-bowler', 2],
      ['powerplay-specialist', 2],
      ['yorker-specialist', 1],
      ['swing-bowler', 1.5],
      ['bouncer-specialist', 1],
      ['economical', 1],
      [null, 4],
    ] as const)
    if (style) traits.push(style)
  }
  if (d.bowlingType === 'spin' && r.bowling >= 60 && traits.length < 2) {
    const style = pickWeighted(rng, [
      ['mystery-spinner', 1],
      ['economical', 2],
      [null, 4],
    ] as const)
    if (style) traits.push(style)
  }
  return knownTraits[d.name] ?? traits
}

// --- Build the pool ------------------------------------------------------------------------

const rosterEntries = parseRosters()
const older = new Map(realPlayers.map((p) => [norm(ALIAS_TO_ROSTER[p[0]] ?? p[0]), p]))
const seen = new Set<string>()
const drafts: Draft[] = []
const unmatched: string[] = []

for (const e of rosterEntries) {
  const key = norm(e.name)
  if (seen.has(key)) throw new Error(`Duplicate in rosters: ${e.name}`)
  seen.add(key)
  const old = older.get(key)
  const found = statsFor(e.name)
  if (!found) unmatched.push(e.name)
  const agg = found?.agg ?? null
  const salaryPrior = 50 + 8 * Math.log(1 + e.salaryCr)
  const prior = old ? (TIER_MEAN[old[4]] + salaryPrior) / 2 : salaryPrior
  const style = e.style
  drafts.push({
    name: e.name,
    nationality: COUNTRY[e.country] as Nationality,
    age: START_YEAR - Number(e.dob.slice(0, 4)),
    style,
    bowlingType: null, // set below once the role is known
    role: roleOf(style, e.wk, agg, old?.[2] ?? null),
    prior,
    agg,
    teamId: e.teamId,
    salaryCr: e.status === 'W' ? null : e.salaryCr,
  })
}
// Players from the older hand list who are on no 2026 roster become free agents.
for (const [key, p] of older) {
  if (seen.has(key)) continue
  const [name, nationality, role, bowling, tier, birthYear] = p
  const found = statsFor(ALIAS_TO_ROSTER[name] ?? name)
  drafts.push({
    name: ALIAS_TO_ROSTER[name] ?? name,
    nationality,
    age: START_YEAR - birthYear,
    style: bowling ? 'unknown' : 'none',
    bowlingType: bowling,
    role,
    prior: TIER_MEAN[tier],
    agg: found?.agg ?? null,
    teamId: null,
    salaryCr: null,
  })
}
for (const d of drafts) {
  if (d.style !== 'unknown')
    d.bowlingType = d.role === 'batter' || d.role === 'wicketkeeper' ? null : bowlingTypeOf(d.style)
  // A role that bowls needs a bowling type.
  if ((d.role === 'bowler' || d.role === 'allrounder') && !d.bowlingType) d.bowlingType = 'pace'
}

const ids = new Set<string>()
const players: Player[] = drafts.map((d) => {
  const ratings = makeRatings(d)
  const id = 'p' + hashString(`real:${d.name}`).toString(36)
  if (ids.has(id)) throw new Error(`Id collision for ${d.name}`)
  ids.add(id)
  return {
    id,
    name: d.name,
    nationality: d.nationality,
    age: d.age,
    role: d.role,
    bowlingType: d.bowlingType,
    ratings,
    potential: potentialFor(overallRating({ role: d.role, ratings }), d.age, rng),
    traits: makeTraits(d, ratings),
    overseas: d.nationality !== 'IND',
    teamId: d.teamId,
    contract:
      d.teamId && d.salaryCr !== null
        ? {
            salary: Math.max(20, Math.round((d.salaryCr * 100) / 5) * 5),
            years: randInt(rng, 1, 3),
          }
        : null,
  }
})

// --- Crests ----------------------------------------------------------------------------------

const usedCrests = new Set<string>()
const teams: Team[] = sourceTeams.map(({ glyph, ...t }) => {
  let crest: CrestSpec
  do {
    crest = { shape: pick(crestRng, CREST_SHAPES), glyph, band: crestRng() < 0.5 }
  } while (usedCrests.has(`${crest.shape}/${crest.glyph}`))
  usedCrests.add(`${crest.shape}/${crest.glyph}`)
  return { ...t, crest }
})

// --- Write and report -------------------------------------------------------------------------

const out = new URL('../src/data/', import.meta.url)
writeFileSync(new URL('players.json', out), JSON.stringify(players, null, 2) + '\n')
writeFileSync(new URL('teams.json', out), JSON.stringify(teams, null, 2) + '\n')

console.log(
  `players: ${players.length}, free agents: ${players.filter((p) => p.teamId === null).length}`,
)
for (const t of teams) {
  const sq = players.filter((p) => p.teamId === t.id)
  const avg = sq.reduce((s, p) => s + overallRating(p), 0) / sq.length
  const pay = sq.reduce((s, p) => s + (p.contract?.salary ?? 0), 0)
  const roles = (r: Role) => sq.filter((p) => p.role === r).length
  console.log(
    `${t.id}: ${sq.length} players (bat ${roles('batter')} wk ${roles('wicketkeeper')} ar ${roles('allrounder')} bowl ${roles('bowler')}), overseas ${sq.filter((p) => p.overseas).length}, avg ${avg.toFixed(1)}, payroll ${(pay / 100).toFixed(1)} cr`,
  )
}
console.log(`no Cricsheet record (rated from salary/tier prior): ${unmatched.length}`)
if (process.env.VERBOSE) console.log(unmatched.join(', '))
