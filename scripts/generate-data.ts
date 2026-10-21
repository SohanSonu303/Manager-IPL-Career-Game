/**
 * Builds src/data/players.json and src/data/teams.json from the source lists.
 * Deterministic: same source + same seed = same output. See src/data/README.md.
 *
 *   npm run data
 */
import { writeFileSync } from 'node:fs'
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
import { overallRating } from '../src/sim/player.ts'
import {
  createRng,
  gaussian,
  hashString,
  pick,
  pickWeighted,
  randInt,
  shuffle,
} from '../src/sim/rng.ts'
import { realPlayers } from './source/real-players.ts'
import { sourceTeams } from './source/teams.ts'

const SEED = 20261
const START_YEAR = 2026
const SQUAD_SIZE = 18
/** Draft cap for balance. The league rule (max 8 per squad) is enforced in Phase 7. */
const DRAFT_OVERSEAS_CAP = 6

/** Mean of the main skill per tier. */
const TIER_MEAN = { 1: 50, 2: 58, 3: 66, 4: 74, 5: 82 } as const
type Tier = keyof typeof TIER_MEAN

const rng = createRng(SEED)
const clamp = (v: number) => Math.max(1, Math.min(99, Math.round(v)))

interface Draft {
  name: string
  nationality: Nationality
  age: number
  role: Role
  bowlingType: BowlingType | null
  tier: Tier
}

function makeRatings(d: Draft): Player['ratings'] {
  const main = TIER_MEAN[d.tier] + gaussian(rng) * 4
  const partTime = () => randInt(rng, 12, 35)
  let batting: number
  let bowling: number
  switch (d.role) {
    case 'batter':
      batting = main
      bowling = partTime()
      break
    case 'wicketkeeper':
      batting = main - 1
      bowling = randInt(rng, 3, 12)
      break
    case 'bowler':
      bowling = main
      batting = randInt(rng, 12, 38)
      break
    case 'allrounder': {
      // Lean towards one skill so all-rounders are not all identical.
      const lean = gaussian(rng) * 5
      batting = main - 5 + lean
      bowling = main - 5 - lean
      break
    }
  }
  let fielding = randInt(rng, 52, 84) + (d.role === 'wicketkeeper' ? 6 : 0)
  if (d.age > 32) fielding -= (d.age - 32) * 1.5
  return { batting: clamp(batting), bowling: clamp(bowling), fielding: clamp(fielding) }
}

function makeTraits(d: Draft, r: Player['ratings']): Trait[] {
  const traits: Trait[] = []
  const bats = d.role !== 'bowler'
  if (bats && r.batting >= 62) {
    const style = pickWeighted(rng, [
      ['big-hitter', 3],
      ['anchor', 2],
      ['finisher', 2],
      [null, 4],
    ] as const)
    if (style) traits.push(style)
  }
  if (bats && r.batting < 72 && rng() < 0.15) traits.push('poor-vs-spin')
  if (d.bowlingType === 'pace' && r.bowling >= 60 && traits.length < 2) {
    const style = pickWeighted(rng, [
      ['death-bowler', 2],
      ['powerplay-specialist', 2],
      [null, 3],
    ] as const)
    if (style) traits.push(style)
  }
  return traits
}

/** Yearly salary in lakhs: steep curve on overall rating, floor of 20. */
function salaryFor(overall: number): number {
  const x = Math.max(0, (overall - 40) / 45)
  return Math.max(20, Math.round((x ** 2.2 * 1800) / 5) * 5)
}

// --- Build the pool ---------------------------------------------------------

const drafts: Draft[] = realPlayers.map(
  ([name, nationality, role, bowlingType, tier, birthYear]) => ({
    name,
    nationality,
    age: START_YEAR - birthYear,
    role,
    bowlingType,
    tier,
  }),
)

const dupes = drafts.filter((d, i) => drafts.findIndex((o) => o.name === d.name) !== i)
if (dupes.length)
  throw new Error(`Duplicate names in source: ${dupes.map((d) => d.name).join(', ')}`)

const players: Player[] = drafts.map((d) => {
  const ratings = makeRatings(d)
  return {
    id: 'p' + hashString(`real:${d.name}`).toString(36),
    name: d.name,
    nationality: d.nationality,
    age: d.age,
    role: d.role,
    bowlingType: d.bowlingType,
    ratings,
    traits: makeTraits(d, ratings),
    overseas: d.nationality !== 'IND',
    teamId: null,
    contract: null,
  }
})

// --- Draft squads -----------------------------------------------------------

/** Minimum counts each squad must reach. */
const NEEDS: { key: string; min: number; test: (p: Player) => boolean }[] = [
  { key: 'keepers', min: 2, test: (p) => p.role === 'wicketkeeper' },
  { key: 'batters', min: 4, test: (p) => p.role === 'batter' },
  { key: 'allrounders', min: 3, test: (p) => p.role === 'allrounder' },
  { key: 'bowlers', min: 5, test: (p) => p.role === 'bowler' },
  { key: 'pace', min: 4, test: (p) => p.role !== 'batter' && p.bowlingType === 'pace' },
  { key: 'spin', min: 3, test: (p) => p.role !== 'batter' && p.bowlingType === 'spin' },
]

const deficits = (squad: Player[]) =>
  NEEDS.map((n) => Math.max(0, n.min - squad.filter(n.test).length))

const available = [...players].sort((a, b) => overallRating(b) - overallRating(a))
const order = shuffle(rng, sourceTeams).map((t) => t.id)
const squads = new Map<string, Player[]>(order.map((id) => [id, []]))

for (let round = 0; round < SQUAD_SIZE; round++) {
  const roundOrder = round % 2 === 0 ? order : [...order].reverse()
  for (const teamId of roundOrder) {
    const squad = squads.get(teamId) as Player[]
    const overseas = squad.filter((p) => p.overseas).length
    const keepers = squad.filter((p) => p.role === 'wicketkeeper').length
    const before = deficits(squad)
    const slotsLeft = SQUAD_SIZE - squad.length
    const unmet = before.reduce((a, b) => a + b, 0)
    const choice = available.find((p) => {
      if (p.overseas && overseas >= DRAFT_OVERSEAS_CAP) return false
      // Keepers are scarce; stop strong batting keepers being hoarded.
      if (p.role === 'wicketkeeper' && keepers >= 2) return false
      if (slotsLeft > unmet) return true
      // Squad is tight: the pick must reduce at least one deficit.
      const after = deficits([...squad, p])
      return after.some((v, i) => v < (before[i] as number))
    })
    if (!choice) throw new Error(`No valid pick for ${teamId} in round ${round}`)
    available.splice(available.indexOf(choice), 1)
    squad.push(choice)
    choice.teamId = teamId
    choice.contract = { salary: salaryFor(overallRating(choice)), years: randInt(rng, 1, 3) }
  }
}

// --- Crests -----------------------------------------------------------------

const usedCrests = new Set<string>()
const teams: Team[] = sourceTeams.map(({ glyph, ...t }) => {
  let crest: CrestSpec
  do {
    crest = { shape: pick(rng, CREST_SHAPES), glyph, band: rng() < 0.5 }
  } while (usedCrests.has(`${crest.shape}/${crest.glyph}`))
  usedCrests.add(`${crest.shape}/${crest.glyph}`)
  return { ...t, crest }
})

// --- Write ------------------------------------------------------------------

const out = new URL('../src/data/', import.meta.url)
writeFileSync(new URL('players.json', out), JSON.stringify(players, null, 2) + '\n')
writeFileSync(new URL('teams.json', out), JSON.stringify(teams, null, 2) + '\n')

const free = players.filter((p) => p.teamId === null).length
console.log(`players: ${players.length}, free agents: ${free}`)
for (const id of order) {
  const sq = squads.get(id) as Player[]
  const avg = sq.reduce((s, p) => s + overallRating(p), 0) / sq.length
  const pay = sq.reduce((s, p) => s + (p.contract?.salary ?? 0), 0)
  console.log(
    `${id}: avg ${avg.toFixed(1)}, overseas ${sq.filter((p) => p.overseas).length}, payroll ${pay} lakh`,
  )
}
