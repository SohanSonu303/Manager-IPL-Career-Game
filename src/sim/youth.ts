import { PROSPECT_NAMES } from '../data/prospectNames'
import { NATIONALITIES, type Nationality, type Role, type Trait } from '../data/types'
import { teams } from '../data'
import type { Career, CareerPlayer } from './career'
import {
  askingSalary,
  capRoom,
  freeAgents,
  isProspect,
  SQUAD_MAX,
  SQUAD_OVERSEAS_MAX,
  squadOf,
} from './market'
import { addNews } from './news'
import { overallRating, potentialFor } from './player'
import {
  createRng,
  deriveSeed,
  gaussian,
  hashString,
  pick,
  pickWeighted,
  randInt,
  type Rng,
} from './rng'

/*
 * Youth intake: each off-season a batch of generated young players joins the unsigned
 * pool, so the league never runs out of players as the real ones retire.
 */

/** Young players added each off-season: enough to replace the retirees, and then some. */
export const prospectCount = (retired: number) => Math.max(22, retired + 10)

/**
 * AI clubs pick up the youngsters too: each club with a place and the money takes the
 * most promising prospect about half the time, now and then a second.
 */
export function aiYouthSignings(career: Career, teamIds: string[], rng: Rng): Career {
  let c = career
  for (const teamId of teamIds) {
    if (teamId === career.manager.teamId) continue
    const wanted = rng() < 0.55 ? (rng() < 0.3 ? 2 : 1) : 0
    for (let i = 0; i < wanted; i++) {
      const squad = squadOf(c.players, teamId)
      if (squad.length >= SQUAD_MAX - 1) break
      const overseasFull = squad.filter((p) => p.overseas).length >= SQUAD_OVERSEAS_MAX
      const pick = freeAgents(c.players)
        .filter((p) => isProspect(p) && p.potential >= 72 && (!overseasFull || !p.overseas))
        .filter((p) => askingSalary(p) <= capRoom(c.players, teamId))
        .sort((a, b) => b.potential - a.potential)[0]
      if (!pick) break
      const salary = askingSalary(pick)
      c = addNews(
        {
          ...c,
          players: c.players.map((p) =>
            p.id === pick.id ? { ...p, teamId, contract: { salary, years: 3 } } : p,
          ),
          market: {
            ...c.market,
            log: [
              ...c.market.log,
              { year: c.calendar.year, kind: 'signed', playerId: pick.id, teamId, salary },
            ],
          },
        },
        {
          kind: 'transfer',
          teamIds: [teamId],
          playerId: pick.id,
          text: `${teams.find((t) => t.id === teamId)?.short ?? teamId} sign ${pick.age}-year-old prospect ${pick.name}.`,
        },
      )
    }
  }
  return c
}

const ROLE_MIX: readonly (readonly [Role, number])[] = [
  ['batter', 5],
  ['wicketkeeper', 2],
  ['allrounder', 4],
  ['bowler', 6],
]

const clamp = (v: number) => Math.round(Math.max(1, Math.min(99, v)))

/** Batting/bowling/fielding that land the overall close to `target` for the role. */
function ratingsFor(role: Role, target: number, rng: Rng) {
  const fielding = clamp(randInt(rng, 52, 82) + (role === 'wicketkeeper' ? 6 : 0))
  const main = (w: number) => clamp((target - (1 - w) * fielding) / w)
  switch (role) {
    case 'batter':
      return { batting: main(0.88), bowling: randInt(rng, 10, 35), fielding }
    case 'wicketkeeper':
      return { batting: main(0.8), bowling: randInt(rng, 3, 12), fielding }
    case 'bowler':
      return { batting: randInt(rng, 12, 38), bowling: main(0.88), fielding }
    case 'allrounder': {
      const lean = gaussian(rng) * 4
      const base = (target - 4 - 0.15 * fielding) / 0.85
      return { batting: clamp(base + lean), bowling: clamp(base - lean), fielding }
    }
  }
}

function traitsFor(
  role: Role,
  bowlingType: CareerPlayer['bowlingType'],
  r: CareerPlayer['ratings'],
  rng: Rng,
): Trait[] {
  const traits: Trait[] = []
  if (role !== 'bowler' && r.batting >= 58 && rng() < 0.35) {
    traits.push(pick(rng, ['big-hitter', 'anchor', 'finisher', 'powerplay-hitter'] as const))
  }
  if (bowlingType === 'pace' && r.bowling >= 58 && rng() < 0.35) {
    traits.push(pick(rng, ['death-bowler', 'powerplay-specialist', 'swing-bowler'] as const))
  }
  if (bowlingType === 'spin' && r.bowling >= 58 && rng() < 0.25) traits.push('mystery-spinner')
  return traits
}

/** A first and last name that nobody in the league has yet. */
function nameFor(nat: Nationality, rng: Rng, taken: Set<string>): string {
  const parts = PROSPECT_NAMES[nat]
  for (let i = 0; i < 40; i++) {
    const name = `${pick(rng, parts.first)} ${pick(rng, parts.last)}`
    if (!taken.has(name)) return name
  }
  return `${pick(rng, parts.first)} ${pick(rng, parts.last)} Jr`
}

/**
 * `count` young unsigned players for the given season: ages 17–21, mostly Indian,
 * overall 45–62 with real growth room (a rare few are future stars).
 */
export function generateProspects(
  seed: number,
  year: number,
  count: number,
  existing: CareerPlayer[],
): CareerPlayer[] {
  const rng = createRng(deriveSeed(seed, 'youth', year))
  const ids = new Set(existing.map((p) => p.id))
  const names = new Set(existing.map((p) => p.name))
  const out: CareerPlayer[] = []
  for (let i = 0; i < count; i++) {
    const nationality: Nationality =
      rng() < 0.65
        ? 'IND'
        : pick(
            rng,
            NATIONALITIES.filter((n) => n !== 'IND'),
          )
    const role = pickWeighted(rng, ROLE_MIX)
    const bowlingType =
      role === 'bowler' || role === 'allrounder' ? (rng() < 0.6 ? 'pace' : 'spin') : null
    const age = randInt(rng, 17, 21)
    // Mostly 45–55, sometimes up to 62.
    const target = Math.min(62, 45 + Math.abs(gaussian(rng)) * 7)
    const ratings = ratingsFor(role, target, rng)
    const overall = overallRating({ role, ratings })
    // A one-in-ten talent gets extra room on top of the usual age-based ceiling.
    const potential = Math.min(
      90,
      Math.max(65, potentialFor(overall, age, rng) + (rng() < 0.1 ? randInt(rng, 6, 12) : 0)),
    )
    let n = 0
    let id = `p${hashString(`youth:${seed}:${year}:${i}`).toString(36)}`
    while (ids.has(id)) id = `p${hashString(`youth:${seed}:${year}:${i}:${++n}`).toString(36)}`
    const name = nameFor(nationality, rng, names)
    ids.add(id)
    names.add(name)
    out.push({
      id,
      name,
      nationality,
      age,
      role,
      bowlingType,
      ratings,
      potential,
      traits: traitsFor(role, bowlingType, ratings, rng),
      overseas: nationality !== 'IND',
      teamId: null,
      contract: null,
      prospect: true,
      fitness: 100,
      form: randInt(rng, 45, 60),
      streak: 0,
      injury: null,
      morale: 70,
      seasonDev: { batting: 0, bowling: 0 },
    })
  }
  return out
}
