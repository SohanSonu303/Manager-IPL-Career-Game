import type { Player } from '../../data/types'
import { effectiveRating, overallRating, type Condition } from '../player'
import { createRng, hashString } from '../rng'
import { chooseBowler, MAX_OVERS_PER_BOWLER } from './tactics'
import type { Aggression, InningsState, MatchPlayer, MatchState, Pitch, TeamSheet } from './types'

export const XI_SIZE = 11
export const MAX_OVERSEAS_IN_XI = 4
export const MIN_BOWLING_OPTIONS = 5

/** A squad member as selection sees it: data + condition + availability. */
export type Selectable = Player & Condition & { injury?: { matchesOut: number } | null }

export const isAvailable = (p: Selectable) => !p.injury || p.injury.matchesOut <= 0
const bowls = (p: Pick<Player, 'role'>) => p.role === 'bowler' || p.role === 'allrounder'

/** Today's ratings: ability adjusted for form and fitness. */
export function toMatchPlayer(p: Selectable): MatchPlayer {
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    bowlingType: p.bowlingType,
    traits: p.traits,
    overseas: p.overseas,
    batting: effectiveRating(p.ratings.batting, p),
    bowling: effectiveRating(p.ratings.bowling, p),
    fielding: effectiveRating(p.ratings.fielding, p),
  }
}

/** Selection value: overall rating as it plays today. */
function value(p: Selectable): number {
  const m = toMatchPlayer(p)
  return overallRating({
    role: p.role,
    ratings: { batting: m.batting, bowling: m.bowling, fielding: m.fielding },
  })
}

/**
 * Best balanced XI from the available squad: a keeper, two pace and one spin bowler,
 * a fourth bowler, two all-rounders, four batters, then the best of the rest, never more
 * than four overseas players and always at least five bowling options.
 */
export function autoPickXI<T extends Selectable>(squad: T[]): T[] {
  // Rotation: worn-out players (fitness under 45) are only picked if there's no one else.
  const tired = (p: T) => (p.fitness < 45 ? 1 : 0)
  const pool = squad.filter(isAvailable).sort((a, b) => tired(a) - tired(b) || value(b) - value(a))
  const xi: T[] = []
  const overseas = () => xi.filter((p) => p.overseas).length
  const take = (test: (p: T) => boolean, n: number) => {
    for (const p of pool) {
      if (n <= 0 || xi.length >= XI_SIZE) break
      if (xi.includes(p) || !test(p)) continue
      if (p.overseas && overseas() >= MAX_OVERSEAS_IN_XI) continue
      xi.push(p)
      n--
    }
  }
  const byBowling = [...pool].sort((a, b) => b.ratings.bowling - a.ratings.bowling)
  const takeBowlers = (test: (p: T) => boolean, n: number) => {
    for (const p of byBowling) {
      if (n <= 0) break
      if (xi.includes(p) || !test(p) || (p.overseas && overseas() >= MAX_OVERSEAS_IN_XI)) continue
      xi.push(p)
      n--
    }
  }

  take((p) => p.role === 'wicketkeeper', 1)
  takeBowlers((p) => p.role === 'bowler' && p.bowlingType === 'pace', 2)
  takeBowlers((p) => p.role === 'bowler' && p.bowlingType === 'spin', 1)
  takeBowlers((p) => p.role === 'bowler', 1)
  take((p) => p.role === 'allrounder', 2)
  take((p) => p.role === 'batter' || p.role === 'wicketkeeper', 4)
  take(() => true, XI_SIZE - xi.length)

  // Guarantee five bowling options: swap the weakest batter for the best spare bowler.
  while (xi.filter(bowls).length < MIN_BOWLING_OPTIONS) {
    const spare = byBowling.find(
      (p) => bowls(p) && !xi.includes(p) && (!p.overseas || overseas() < MAX_OVERSEAS_IN_XI),
    )
    const weakest = [...xi]
      .filter((p) => !bowls(p) && p.role !== 'wicketkeeper')
      .sort((a, b) => value(a) - value(b))[0]
    if (!spare || !weakest) break
    xi.splice(xi.indexOf(weakest), 1, spare)
  }
  return xi
}

/**
 * Batting order: specialist batters by rating (finishers held back for 5–7), the keeper
 * among them, then all-rounders, then bowlers by batting.
 */
export function autoBattingOrder(xi: Selectable[]): string[] {
  const bat = (p: Selectable) => effectiveRating(p.ratings.batting, p)
  const specialists = xi
    .filter((p) => p.role === 'batter' || p.role === 'wicketkeeper')
    .sort((a, b) => bat(b) - bat(a))
  const finishers = specialists.filter((p) => p.traits.includes('finisher'))
  const top = specialists.filter((p) => !finishers.includes(p))
  const allrounders = xi.filter((p) => p.role === 'allrounder').sort((a, b) => bat(b) - bat(a))
  const bowlers = xi.filter((p) => p.role === 'bowler').sort((a, b) => bat(b) - bat(a))
  return [
    ...top,
    ...allrounders.slice(0, 1),
    ...finishers,
    ...allrounders.slice(1),
    ...bowlers,
  ].map((p) => p.id)
}

/** Best keeper in the XI (or the best fielder if none was picked). */
export function pickKeeper(xi: Selectable[]): string {
  const k = xi
    .filter((p) => p.role === 'wicketkeeper')
    .sort((a, b) => b.ratings.fielding - a.ratings.fielding)[0]
  const fallback = [...xi].sort((a, b) => b.ratings.fielding - a.ratings.fielding)[0]
  const id = (k ?? fallback)?.id
  if (!id) throw new Error('Empty XI')
  return id
}

/**
 * Impact Player substitutes: five fit players outside the XI, the best two batters and
 * best two bowlers first, then the best of the rest.
 */
export function impactSubs(squad: Selectable[], xi: string[], n = 5): string[] {
  const bench = squad.filter((p) => isAvailable(p) && !xi.includes(p.id))
  const picked: string[] = []
  const take = (sorted: Selectable[], k: number) => {
    for (const p of sorted) {
      if (k <= 0 || picked.length >= n) break
      if (!picked.includes(p.id)) {
        picked.push(p.id)
        k--
      }
    }
  }
  const by = (f: (p: Selectable) => number) => [...bench].sort((a, b) => f(b) - f(a))
  take(
    by((p) => effectiveRating(p.ratings.batting, p)),
    2,
  )
  take(
    by((p) => effectiveRating(p.ratings.bowling, p)),
    2,
  )
  take(by(value), n)
  return picked
}

/** A complete team sheet chosen by the AI (also the default for a human side). */
export function autoTeamSheet(teamId: string, squad: Selectable[], ai: boolean): TeamSheet {
  const xi = autoPickXI(squad)
  return {
    teamId,
    battingOrder: autoBattingOrder(xi),
    keeperId: pickKeeper(xi),
    aggression: 'balanced',
    intent: {},
    field: 'balanced',
    bowlIntent: 'balanced',
    bowlPlan: 'stock',
    ai,
  }
}

/**
 * A full 20-over bowling plan, made by running the in-match bowler AI over an empty
 * innings. Gives the manager a starting point that already follows the rules.
 */
export function autoBowlingPlan(sheet: TeamSheet, players: MatchPlayer[]): string[] {
  const state = {
    players: Object.fromEntries(players.map((p) => [p.id, p])),
    sheets: { [sheet.teamId]: { ...sheet, bowlingPlan: undefined } },
  } as unknown as MatchState
  const inn = {
    bowlingTeamId: sheet.teamId,
    maxOvers: 20,
    legalBalls: 0,
    lastOverBowlerId: null,
    bowling: {},
    events: [],
  } as unknown as InningsState
  const plan: string[] = []
  for (let over = 0; over < 20; over++) {
    const id = chooseBowler(state, inn)
    plan.push(id)
    inn.bowling[id] = {
      legalBalls: (inn.bowling[id]?.legalBalls ?? 0) + 6,
      runs: 0,
      wickets: 0,
      dots: 0,
      wides: 0,
      noballs: 0,
    }
    // Enough of an event for spell tracking.
    inn.events.push({ over, bowlerId: id } as InningsState['events'][number])
    inn.legalBalls += 6
    inn.lastOverBowlerId = id
  }
  return plan
}

/** Problems with a team sheet, as messages for the manager. Empty = valid. */
export function validateSheet(sheet: TeamSheet, squad: Selectable[]): string[] {
  const errors: string[] = []
  const byId = new Map(squad.map((p) => [p.id, p]))
  const ids = sheet.battingOrder
  if (ids.length !== XI_SIZE)
    errors.push(`Pick exactly ${XI_SIZE} players (you have ${ids.length}).`)
  if (new Set(ids).size !== ids.length) errors.push('A player is picked twice.')
  const xi = ids.map((id) => byId.get(id)).filter((p): p is Selectable => !!p)
  if (xi.length !== ids.length) errors.push('A picked player is not in the squad.')
  const injured = xi.filter((p) => !isAvailable(p))
  if (injured.length) errors.push(`Injured: ${injured.map((p) => p.name).join(', ')}.`)
  const os = xi.filter((p) => p.overseas).length
  if (os > MAX_OVERSEAS_IN_XI)
    errors.push(`At most ${MAX_OVERSEAS_IN_XI} overseas players (you have ${os}).`)
  if (!ids.includes(sheet.keeperId)) errors.push('The wicketkeeper must be in the XI.')
  if (xi.filter(bowls).length < MIN_BOWLING_OPTIONS) {
    errors.push(`Pick at least ${MIN_BOWLING_OPTIONS} bowlers or all-rounders.`)
  }
  if (sheet.bowlingPlan) {
    const plan = sheet.bowlingPlan
    const counts = new Map<string, number>()
    plan.forEach((id, over) => {
      if (!id) return
      if (!ids.includes(id)) errors.push(`Over ${over + 1}: bowler is not in the XI.`)
      if (id === sheet.keeperId) errors.push(`Over ${over + 1}: the keeper cannot bowl.`)
      if (over > 0 && plan[over - 1] === id)
        errors.push(`Over ${over + 1}: same bowler twice in a row.`)
      counts.set(id, (counts.get(id) ?? 0) + 1)
    })
    for (const [id, n] of counts) {
      if (n > MAX_OVERS_PER_BOWLER) {
        errors.push(`${byId.get(id)?.name ?? id} has ${n} overs (max ${MAX_OVERS_PER_BOWLER}).`)
      }
    }
  }
  return errors
}

/** Set one batter's intent (the manager's per-batter control). */
export function setIntent(sheet: TeamSheet, batterId: string, a: Aggression): TeamSheet {
  return { ...sheet, intent: { ...sheet.intent, [batterId]: a } }
}

/** Each ground has its own fixed character, seeded from the team id. */
export function pitchFor(teamId: string): Pitch {
  const rng = createRng(hashString(`pitch:${teamId}`))
  return {
    pace: rng() * 1.2 - 0.6,
    spin: rng() * 1.2 - 0.6,
    flat: rng() * 0.9 - 0.3,
    boundary: Math.round(64 + rng() * 10),
  }
}
