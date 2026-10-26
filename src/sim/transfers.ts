import {
  CAPABILITIES,
  CAPABILITY_LABEL,
  capabilities,
  planFor,
  skillFor,
  squadNeeds,
  type Capability,
} from './auctionAI'
import type { Career, CareerPlayer } from './career'
import { contractOutlook } from './contracts'
import { autoPickXI } from './match/selection'
import {
  askingPrice,
  evaluateTrade,
  marketAgents,
  preferredYears,
  ROLES,
  SQUAD_OVERSEAS_MAX,
  squadOf,
  tradeable,
  tradeValue,
  wouldStart,
} from './market'
import { overallRating } from './player'

/*
 * The transfer hub: what the squad is short of, who could fill it (free agents first,
 * then players other clubs would trade), and trade packages that the other club accepts.
 * Pure helpers for the Market screen.
 */

export interface Target {
  p: CareerPlayer
  kind: 'free' | 'trade'
  /** Free agent: his ask for his preferred length. Trade: his trade value. */
  price: number
  years: number
  /** His rating for the role. */
  skill: number
}

export interface NeedCard {
  /** A role, or 'upgrade' when the squad has no gaps and these would walk into the XI. */
  role: Capability | 'upgrade'
  /** "Death bowler". */
  title: string
  /** Why it is a need. */
  why: string
  options: Target[]
}

const title = (c: Capability) =>
  CAPABILITY_LABEL[c][0]!.toUpperCase() + CAPABILITY_LABEL[c].slice(1)
const fills = (p: CareerPlayer, c: Capability) => (capabilities(p)[c] ?? 0) >= 0.5

/** Players other clubs would part with in a trade. */
export function forTrade(career: Career, teamIds: string[]): CareerPlayer[] {
  return teamIds
    .filter((t) => t !== career.manager.teamId)
    .flatMap((t) => {
      const squad = squadOf(career.players, t)
      return ROLES.flatMap((r) => tradeable(squad, r))
    })
}

/**
 * Up to four needs, most urgent first, for next season's squad (leaving players already
 * gone), each with the three best options that would improve on what you have.
 */
export function transferNeeds(career: Career, teamIds: string[]): NeedCard[] {
  const me = career.manager.teamId
  const outlook = contractOutlook(career, teamIds)
  const gone = new Set(
    [
      ...outlook.retiring.filter((r) => r.outlook !== 'possible').map((r) => r.p),
      ...outlook.expiring.filter((r) => r.status !== 'open' && !r.rescued).map((r) => r.p),
    ].map((p) => p.id),
  )
  const squad = squadOf(career.players, me).filter((p) => !gone.has(p.id))
  const needs = squadNeeds(squad, planFor(me))
  const overseasFull = squad.filter((p) => p.overseas).length >= SQUAD_OVERSEAS_MAX
  const free = marketAgents(career).filter((p) => !overseasFull || !p.overseas)
  const trade = forTrade(career, teamIds).filter((p) => !overseasFull || !p.overseas)
  const leftFor = (c: Capability) =>
    [...gone]
      .map((id) => career.players.find((p) => p.id === id))
      .filter((p): p is CareerPlayer => !!p && fills(p, c))
  const cards = CAPABILITIES.filter((c) => needs[c].short > 0.3)
    .sort((a, b) => needs[b].priority - needs[a].priority)
    .slice(0, 4)
    .map((c) => {
      const mine = squad.filter((p) => fills(p, c))
      const best = Math.max(0, ...mine.map((p) => skillFor(p, c)))
      const target = (p: CareerPlayer, kind: Target['kind']): Target => {
        const years = preferredYears(p.age)
        return {
          p,
          kind,
          years,
          price:
            kind === 'free' ? askingPrice(career, p, years, teamIds) : Math.round(tradeValue(p)),
          skill: Math.round(skillFor(p, c)),
        }
      }
      const pick = (pool: CareerPlayer[], kind: Target['kind'], n: number) =>
        pool
          .filter((p) => fills(p, c) && skillFor(p, c) > best - 6)
          .sort((a, b) => skillFor(b, c) - skillFor(a, c))
          .slice(0, n)
          .map((p) => target(p, kind))
      const options = [...pick(free, 'free', 2), ...pick(trade, 'trade', 3)].slice(0, 3)
      const lost = leftFor(c)
      const why = lost.length
        ? `Replace ${lost.map((p) => p.name).join(', ')}`
        : mine.length
          ? `${mine.length} in the squad, best rated ${Math.round(best)}`
          : 'Nobody in the squad'
      return { role: c, title: title(c), why, options }
    })
  if (cards.length) return cards
  // No gaps: the best free agents who would walk into the XI.
  const upgrades = free
    .filter((p) => wouldStart(career.players, me, p))
    .sort((a, b) => overallRating(b) - overallRating(a))
    .slice(0, 3)
    .map((p): Target => {
      const years = preferredYears(p.age)
      const price = askingPrice(career, p, years, teamIds)
      return { p, kind: 'free', years, price, skill: overallRating(p) }
    })
  return upgrades.length
    ? [
        {
          role: 'upgrade',
          title: 'Upgrades',
          why: 'Free agents who would start',
          options: upgrades,
        },
      ]
    : []
}

export interface TradeBalance {
  /** Trade value you send. */
  give: number
  /** Trade value you get. */
  get: number
  /** What they need to receive (5% more than they give up). */
  target: number
}

export function tradeBalance(career: Career, give: string[], get: string[]): TradeBalance {
  const value = (ids: string[]) =>
    ids.reduce((s, id) => {
      const p = career.players.find((x) => x.id === id)
      return s + (p ? tradeValue(p) : 0)
    }, 0)
  const getV = value(get)
  return { give: value(give), get: getV, target: getV * 1.05 }
}

/**
 * The cheapest set of your players (one, two or three) that the other club would take
 * for `get`. Players outside your best XI are tried first. Null if nothing works.
 */
export function suggestPackage(career: Career, get: string[]): string[] | null {
  const me = career.manager.teamId
  const squad = squadOf(career.players, me).filter((p) => !p.injury)
  const xi = new Set(autoPickXI(squadOf(career.players, me)).map((p) => p.id))
  const works = (ids: string[]) => evaluateTrade(career, ids, get).ok
  const cost = (ps: CareerPlayer[]) => ps.reduce((s, p) => s + tradeValue(p), 0)
  for (const pool of [squad.filter((p) => !xi.has(p.id)), squad]) {
    const sorted = [...pool].sort((a, b) => tradeValue(a) - tradeValue(b))
    const one = sorted.find((p) => works([p.id]))
    if (one) return [one.id]
    let best: CareerPlayer[] | null = null
    for (let i = 0; i < sorted.length; i++)
      for (let j = i + 1; j < sorted.length; j++) {
        const pair = [sorted[i]!, sorted[j]!]
        if ((!best || cost(pair) < cost(best)) && works(pair.map((p) => p.id))) best = pair
      }
    if (best) return best.map((p) => p.id)
    // Three: the two most valuable spares plus the cheapest third that gets there.
    const top = [...sorted].reverse().slice(0, 2)
    const third = sorted.find((p) => !top.includes(p) && works([...top, p].map((q) => q.id)))
    if (top.length === 2 && third) return [...top, third].map((p) => p.id)
  }
  return null
}
