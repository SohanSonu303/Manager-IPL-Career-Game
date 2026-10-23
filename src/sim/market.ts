import { today } from './calendar'
import type { Career, CareerPlayer } from './career'
import { autoPickXI } from './match/selection'
import { overallRating } from './player'
import { addNews, updateNews } from './news'
import { createRng, deriveSeed, pickWeighted, randInt, shuffle, type Rng } from './rng'
import { teams } from '../data'

const teamLabel = (id: string) => teams.find((t) => t.id === id)?.short ?? id

/*
 * Contracts, squad rules, the free-agent market and trades. Salaries are in lakhs per
 * season. All functions are pure: they return a new career (or an answer) and never
 * mutate their inputs.
 */

/** Salary cap per squad: ₹140 crore. Open decision in TODO.md. */
export const SALARY_CAP = 14_000
export const SQUAD_MIN = 18
export const SQUAD_MAX = 25
export const SQUAD_OVERSEAS_MAX = 8

export const squadOf = (players: CareerPlayer[], teamId: string) =>
  players.filter((p) => p.teamId === teamId)
/** Everyone without a club. Only some of them are on the market (see `marketAgents`). */
export const freeAgents = (players: CareerPlayer[]) => players.filter((p) => p.teamId === null)

/** Free agents on offer in one season; the rest of the unsigned are playing elsewhere. */
export const FREE_AGENT_MAX = 14

/** The free agents the manager can sign right now. */
export function marketAgents(career: Career): CareerPlayer[] {
  const ids = new Set(career.market.freeAgentIds)
  return career.players.filter((p) => p.teamId === null && ids.has(p.id))
}

/**
 * Draw the season's free agents from everyone unsigned: 10 to 14 names, at least one
 * keeper and a few bowlers if there are any, better players more likely, and last
 * season's unsold names less likely so the list looks different each year.
 */
export function rerollFreeAgents(career: Career, tag: string | number): Career {
  const rng = createRng(deriveSeed(career.seed, 'fa-reroll', tag))
  const before = new Set(career.market.freeAgentIds)
  const pool = freeAgents(career.players)
  const want = Math.min(pool.length, randInt(rng, 10, FREE_AGENT_MAX))
  const chosen: CareerPlayer[] = []
  const draw = (from: CareerPlayer[]) => {
    const left = from.filter((p) => !chosen.includes(p))
    if (!left.length) return
    chosen.push(
      pickWeighted(
        rng,
        left.map((p) => [
          p,
          Math.max(1, overallRating(p) - 35) ** 1.5 * (before.has(p.id) ? 0.35 : 1),
        ]),
      ),
    )
  }
  draw(pool.filter((p) => p.role === 'wicketkeeper'))
  for (let i = 0; i < 3; i++) draw(pool.filter((p) => p.role === 'bowler'))
  while (chosen.length < want) draw(pool)
  return {
    ...career,
    market: { ...career.market, freeAgentIds: chosen.slice(0, want).map((p) => p.id) },
  }
}
export const payroll = (players: CareerPlayer[], teamId: string) =>
  squadOf(players, teamId).reduce((s, p) => s + (p.contract?.salary ?? 0), 0)
export const capRoom = (players: CareerPlayer[], teamId: string) =>
  SALARY_CAP - payroll(players, teamId)

/** Market value of a player: a steep curve on overall rating, floor of 20 lakh. */
export function salaryFor(overall: number): number {
  const x = Math.max(0, (overall - 40) / 45)
  return Math.max(20, Math.round((x ** 2.2 * 1800) / 5) * 5)
}

const round5 = (v: number) => Math.max(20, Math.ceil(v / 5) * 5)

/** What a player wants per season: value, adjusted for age, growth room and form. */
export function askingSalary(p: CareerPlayer): number {
  const overall = overallRating(p)
  let v = salaryFor(overall)
  if (p.age >= 34) v *= 0.8
  else if (p.age >= 31) v *= 0.92
  if (p.age <= 24) v *= 1 + Math.max(0, p.potential - overall) * 0.015
  v *= 0.92 + p.form * 0.0016
  return round5(v)
}

/** Squad strength: average overall of the best XI. */
export function squadStrength(players: CareerPlayer[], teamId: string): number {
  const xi = autoPickXI(squadOf(players, teamId))
  return xi.length ? xi.reduce((s, p) => s + overallRating(p), 0) / xi.length : 0
}

/** Clubs ranked by squad strength, strongest first. */
export function strengthRanking(career: Career, teamIds: string[]): string[] {
  return [...teamIds].sort(
    (a, b) => squadStrength(career.players, b) - squadStrength(career.players, a),
  )
}

/** 0.85–1.1: stronger clubs and better-known managers are easier to join. */
export function clubAppeal(career: Career, teamId: string, teamIds: string[]): number {
  const rank = strengthRanking(career, teamIds).indexOf(teamId)
  const strength = 1.0 - (0.15 * Math.max(0, rank)) / Math.max(1, teamIds.length - 1)
  const rep = teamId === career.manager.teamId ? career.manager.reputation : 50
  return strength + (rep - 50) / 500
}

/** True if the player would walk into this team's best XI. */
export function wouldStart(players: CareerPlayer[], teamId: string, p: CareerPlayer): boolean {
  const pool = [...squadOf(players, teamId).filter((q) => q.id !== p.id), p]
  return autoPickXI(pool).some((q) => q.id === p.id)
}

/** Older players want security; young players prefer not to be tied to one season. */
function yearsFit(age: number, years: number): number {
  if (age >= 31 && years === 1) return 0.9
  if (age >= 34 && years >= 2) return 1.05
  if (age <= 24 && years === 1) return 0.95
  return 1
}

export const preferredYears = (age: number) => (age >= 31 ? 2 : 3)

export interface Offer {
  salary: number
  years: number
}

export type OfferAnswer =
  | { kind: 'accept' }
  | { kind: 'counter'; salary: number; years: number; message: string }
  | { kind: 'reject'; message: string }

/** Why an offer cannot even be made, or null if it can. */
export function offerBlocker(career: Career, playerId: string, offer: Offer): string | null {
  const teamId = career.manager.teamId
  const p = career.players.find((x) => x.id === playerId)
  if (!p) return 'Player not found.'
  if (career.mega) return 'The mega auction is under way. Finish it first.'
  const renewal = p.teamId === teamId
  if (p.teamId !== null && !renewal)
    return `${p.name} is under contract with another club. Try a trade.`
  // Free agents can be signed all year; renewals wait for the preseason or the season's end.
  if (renewal && !isWindowOpen(career))
    return 'Contracts can be renewed in the preseason or after the season.'
  if (!renewal && !career.market.freeAgentIds.includes(p.id))
    return `${p.name} is not on the market this season.`
  if (renewal && (p.contract?.years ?? 0) > 1)
    return `${p.name} still has ${p.contract?.years} seasons left.`
  if (career.market.talks[playerId]?.walkedAway) return `${p.name} has ended talks for now.`
  if (offer.years < 1 || offer.years > 3) return 'Contracts run for 1 to 3 seasons.'
  if (offer.salary < 20) return 'The minimum salary is 20 lakh.'
  const squad = squadOf(career.players, teamId)
  if (!renewal && squad.length >= SQUAD_MAX) return `Your squad is full (${SQUAD_MAX}).`
  if (!renewal && p.overseas && squad.filter((q) => q.overseas).length >= SQUAD_OVERSEAS_MAX) {
    return `You already have ${SQUAD_OVERSEAS_MAX} overseas players.`
  }
  const room = capRoom(career.players, teamId) + (renewal ? (p.contract?.salary ?? 0) : 0)
  if (offer.salary > room) return `Not enough room under the cap (${room} lakh available).`
  return null
}

/**
 * The salary that would make this player say yes to this club: asking price, scaled by
 * how appealing the club is, whether he would start, and the contract length.
 */
export function requiredSalary(
  career: Career,
  p: CareerPlayer,
  years: number,
  teamIds: string[],
): number {
  const teamId = career.manager.teamId
  const renewal = p.teamId === teamId
  const appeal = clubAppeal(career, teamId, teamIds)
  const starts = wouldStart(career.players, teamId, p)
  const role = starts ? 1 : overallRating(p) >= 75 ? 0.85 : 0.95
  // A happy player gives his own club a discount; an unhappy one wants out.
  const loyalty = renewal ? (p.morale < 35 ? 0.85 : 1.05) : 1
  return round5(askingSalary(p) / (appeal * role * loyalty * yearsFit(p.age, years)))
}

export interface Agent {
  /** Hidden: how far below (−) or above (+) his stated demand he will really go. */
  greed: number
  /** Rounds of talks before he walks away. */
  patience: number
  label: 'Keen' | 'Fair' | 'Tough'
}

/**
 * Every player's agent has a personality (seeded per career): some are keen and will
 * take a little less than they ask, some play hardball and lose patience quickly.
 */
export function agentOf(career: Career, p: CareerPlayer): Agent {
  const rng = createRng(deriveSeed(career.seed, 'agent', p.id))
  const greed = -0.12 + rng() * 0.2
  const patience = randInt(rng, 2, 5)
  return { greed, patience, label: greed < -0.05 ? 'Keen' : greed > 0.03 ? 'Tough' : 'Fair' }
}

/** What he will actually accept (hidden from the manager). */
function reservation(career: Career, p: CareerPlayer, years: number, teamIds: string[]): number {
  return round5(requiredSalary(career, p, years, teamIds) * (1 + agentOf(career, p).greed))
}

/**
 * The player's answer to an offer. Deterministic: same situation, same answer.
 * Meet his (hidden) price and he signs; get close and he comes down halfway; lowball
 * him and he loses patience.
 */
export function answerOffer(
  career: Career,
  playerId: string,
  offer: Offer,
  teamIds: string[],
): OfferAnswer {
  const p = career.players.find((x) => x.id === playerId) as CareerPlayer
  const agent = agentOf(career, p)
  const res = reservation(career, p, offer.years, teamIds)
  const talks = career.market.talks[playerId]
  const rounds = (talks?.rounds ?? 0) + 1
  if (offer.salary >= res) return { kind: 'accept' }
  if (rounds >= agent.patience) {
    return { kind: 'reject', message: `${p.name}'s agent has heard enough and ends the talks.` }
  }
  if (offer.salary >= res * 0.75) {
    // He comes down halfway towards your offer, but never below his real price.
    const ask = talks?.ask ?? requiredSalary(career, p, offer.years, teamIds)
    const years =
      offer.years === preferredYears(p.age) || agent.label !== 'Tough'
        ? offer.years
        : preferredYears(p.age)
    const salary = Math.max(
      reservation(career, p, years, teamIds),
      round5((ask + offer.salary) / 2),
    )
    const tone =
      agent.label === 'Keen'
        ? `${p.name} is keen to make this work.`
        : agent.label === 'Tough'
          ? `${p.name}'s agent is playing hardball.`
          : `${p.name} wants a little more.`
    return { kind: 'counter', salary, years, message: tone }
  }
  return { kind: 'reject', message: `${p.name} says the offer is far too low.` }
}

/** Record one round of talks; on acceptance, sign the player. */
export function makeOffer(
  career: Career,
  playerId: string,
  offer: Offer,
  teamIds: string[],
): { career: Career; answer: OfferAnswer } {
  const blocked = offerBlocker(career, playerId, offer)
  if (blocked) return { career, answer: { kind: 'reject', message: blocked } }
  const answer = answerOffer(career, playerId, offer, teamIds)
  const prev = career.market.talks[playerId] ?? { rounds: 0, walkedAway: false }
  const p = career.players.find((x) => x.id === playerId) as CareerPlayer
  const talks = {
    ...career.market.talks,
    [playerId]: {
      rounds: prev.rounds + 1,
      walkedAway: answer.kind === 'reject' && prev.rounds + 1 >= agentOf(career, p).patience,
      ask: answer.kind === 'counter' ? answer.salary : prev.ask,
    },
  }
  let next: Career = { ...career, market: { ...career.market, talks } }
  if (answer.kind === 'accept') {
    const me = career.manager.teamId
    const renewal = p.teamId === me
    next = signPlayer(next, playerId, me, offer)
    next = addNews(next, {
      kind: renewal ? 'contract' : 'transfer',
      teamIds: [me],
      playerId,
      text: renewal
        ? `${p.name} signs a new ${offer.years}-season deal with ${teamLabel(me)}.`
        : `${teamLabel(me)} sign ${p.name} on a ${offer.years}-season deal.`,
    })
    // A new deal cheers a player up.
    next = {
      ...next,
      players: next.players.map((x) =>
        x.id === playerId ? { ...x, morale: Math.min(100, x.morale + 15) } : x,
      ),
    }
  }
  return { career: next, answer }
}

export function signPlayer(career: Career, playerId: string, teamId: string, offer: Offer): Career {
  const p = career.players.find((x) => x.id === playerId)
  const renewal = p?.teamId === teamId
  return {
    ...career,
    players: career.players.map((x) =>
      x.id === playerId
        ? { ...x, teamId, contract: { salary: offer.salary, years: offer.years } }
        : x,
    ),
    market: {
      ...career.market,
      log: [
        ...career.market.log,
        {
          year: career.calendar.year,
          kind: renewal ? 'renewed' : 'signed',
          playerId,
          teamId,
          salary: offer.salary,
        },
      ],
    },
  }
}

export function releaseBlocker(career: Career, playerId: string): string | null {
  const teamId = career.manager.teamId
  const p = career.players.find((x) => x.id === playerId)
  if (!p || p.teamId !== teamId) return 'Not your player.'
  if (career.mega) return 'The mega auction is under way. Finish it first.'
  if (squadOf(career.players, teamId).length <= SQUAD_MIN)
    return `Your squad needs at least ${SQUAD_MIN} players.`
  return null
}

/** Release a player to the free-agent market (his salary comes off your payroll). */
export function releasePlayer(career: Career, playerId: string): Career {
  if (releaseBlocker(career, playerId)) return career
  const name = career.players.find((x) => x.id === playerId)?.name ?? ''
  const me = career.manager.teamId
  return addNews(released(career, playerId), {
    kind: 'transfer',
    teamIds: [me],
    playerId,
    text: `${teamLabel(me)} release ${name}.`,
  })
}

/** Put a player on the market; if that makes more than 14, the weakest other one leaves. */
function withAgent(ids: string[], players: CareerPlayer[], playerId: string): string[] {
  const next = [...ids.filter((id) => id !== playerId), playerId]
  if (next.length <= FREE_AGENT_MAX) return next
  const rating = (id: string) => {
    const p = players.find((x) => x.id === id)
    return p ? overallRating(p) : 0
  }
  const weakest = next.filter((id) => id !== playerId).sort((a, b) => rating(a) - rating(b))[0]
  return next.filter((id) => id !== weakest)
}

function released(career: Career, playerId: string): Career {
  return {
    ...career,
    players: career.players.map((x) =>
      x.id === playerId ? { ...x, teamId: null, contract: null } : x,
    ),
    market: {
      ...career.market,
      // A player you let go is on offer to everyone until the next reroll.
      freeAgentIds: withAgent(career.market.freeAgentIds, career.players, playerId),
      log: [
        ...career.market.log,
        {
          year: career.calendar.year,
          kind: 'released',
          playerId,
          teamId: career.manager.teamId,
          salary: 0,
        },
      ],
    },
  }
}

// --- Market window -----------------------------------------------------------

/**
 * The off-season window (preseason and the season's end): trades, and renewals of
 * expiring contracts. Free agents can be signed and players released at any time.
 * Shut while a mega auction is under way.
 */
export function isWindowOpen(career: Career): boolean {
  if (career.mega) return false
  const phase = today(career.calendar).phase
  return phase === 'preseason' || phase === 'offseason'
}

// --- Trades -------------------------------------------------------------------

/** What a club thinks a player is worth in a trade. */
export function tradeValue(p: CareerPlayer): number {
  const overall = overallRating(p)
  const age = p.age <= 24 ? 1.2 : p.age <= 29 ? 1 : p.age <= 32 ? 0.85 : 0.65
  const growth = p.age <= 25 ? Math.max(0, p.potential - overall) * 0.8 : 0
  return Math.max(1, overall - 40 + growth) ** 1.6 * age
}

export type TradeAnswer = { ok: true } | { ok: false; reason: string }

/** Squad rules both sides must still meet after a trade (size only if it shrinks). */
function squadProblem(players: CareerPlayer[], teamId: string, sizeBefore: number): string | null {
  const squad = squadOf(players, teamId)
  if (squad.length > SQUAD_MAX) return 'squad would be too big'
  if (squad.length < sizeBefore && squad.length < SQUAD_MIN - 2) return 'squad would be too small'
  if (squad.filter((p) => p.overseas).length > SQUAD_OVERSEAS_MAX)
    return 'too many overseas players'
  if (!squad.some((p) => p.role === 'wicketkeeper')) return 'no wicketkeeper left'
  if (payroll(players, teamId) > SALARY_CAP) return 'over the salary cap'
  return null
}

/** Would the other club accept? They want at least 5% more value than they give up. */
export function evaluateTrade(career: Career, give: string[], get: string[]): TradeAnswer {
  const me = career.manager.teamId
  if (!isWindowOpen(career))
    return {
      ok: false,
      reason: career.mega
        ? 'The mega auction is under way.'
        : 'Trades happen in the preseason or after the season.',
    }
  if (!give.length || !get.length) return { ok: false, reason: 'Pick players on both sides.' }
  const byId = new Map(career.players.map((p) => [p.id, p]))
  const out = give.map((id) => byId.get(id))
  const inn = get.map((id) => byId.get(id))
  if (out.some((p) => p?.teamId !== me))
    return { ok: false, reason: 'You can only offer your own players.' }
  const them = inn[0]?.teamId
  if (!them || them === me || inn.some((p) => p?.teamId !== them)) {
    return { ok: false, reason: 'Ask for players from one other club.' }
  }
  if (inn.some((p) => p?.injury) || out.some((p) => p?.injury))
    return { ok: false, reason: 'Injured players cannot be traded.' }
  const after = swap(career.players, give, get, me, them)
  const mine = squadProblem(after, me, squadOf(career.players, me).length)
  if (mine) return { ok: false, reason: `Your ${mine}.` }
  const theirs = squadProblem(after, them, squadOf(career.players, them).length)
  if (theirs) return { ok: false, reason: `They refuse: their ${theirs}.` }
  const valueIn = out.reduce((s, p) => s + tradeValue(p as CareerPlayer), 0)
  const valueOut = inn.reduce((s, p) => s + tradeValue(p as CareerPlayer), 0)
  if (valueIn < valueOut * 1.05) return { ok: false, reason: 'They want more value in return.' }
  return { ok: true }
}

function swap(players: CareerPlayer[], give: string[], get: string[], me: string, them: string) {
  return players.map((p) =>
    give.includes(p.id) ? { ...p, teamId: them } : get.includes(p.id) ? { ...p, teamId: me } : p,
  )
}

export function executeTrade(career: Career, give: string[], get: string[]): Career {
  const check = evaluateTrade(career, give, get)
  if (!check.ok) return career
  const them = career.players.find((p) => p.id === get[0])?.teamId as string
  return doTrade(career, career.manager.teamId, give, them, get)
}

/** Swap players between two clubs: contracts move with them; log and news the deal. */
export function doTrade(
  career: Career,
  a: string,
  aIds: string[],
  b: string,
  bIds: string[],
): Career {
  const year = career.calendar.year
  const name = (id: string) => career.players.find((p) => p.id === id)?.name ?? id
  const players = career.players.map((p) =>
    aIds.includes(p.id)
      ? { ...p, teamId: b, morale: Math.max(p.morale, 60) }
      : bIds.includes(p.id)
        ? { ...p, teamId: a, morale: Math.max(p.morale, 60) }
        : p,
  )
  const log = [
    ...career.market.log,
    ...aIds.map((playerId) => ({ year, kind: 'traded' as const, playerId, teamId: b, salary: 0 })),
    ...bIds.map((playerId) => ({ year, kind: 'traded' as const, playerId, teamId: a, salary: 0 })),
  ]
  return addNews(
    { ...career, players, market: { ...career.market, log } },
    {
      kind: 'trade',
      teamIds: [a, b],
      text: `Trade: ${aIds.map(name).join(', ')} moves to ${teamLabel(b)}; ${bIds.map(name).join(', ')} heads to ${teamLabel(a)}.`,
    },
  )
}

/** Ideal squad shape the AI aims for when it trades. */
export const IDEAL: Record<CareerPlayer['role'], number> = {
  wicketkeeper: 2,
  batter: 5,
  allrounder: 4,
  bowler: 6,
}
const ROLES = Object.keys(IDEAL) as CareerPlayer['role'][]
const countRole = (squad: CareerPlayer[], r: CareerPlayer['role']) =>
  squad.filter((p) => p.role === r).length
const deficits = (squad: CareerPlayer[]) =>
  ROLES.filter((r) => countRole(squad, r) < IDEAL[r]).sort(
    (x, y) => countRole(squad, x) - IDEAL[x] - (countRole(squad, y) - IDEAL[y]),
  )
const surpluses = (squad: CareerPlayer[]) => ROLES.filter((r) => countRole(squad, r) > IDEAL[r])

/** Players a club would part with: not among its six most valuable; unhappy ones first. */
function tradeable(squad: CareerPlayer[], role: CareerPlayer['role']): CareerPlayer[] {
  const core = new Set(
    [...squad]
      .sort((a, b) => tradeValue(b) - tradeValue(a))
      .slice(0, 6)
      .map((p) => p.id),
  )
  return squad
    .filter((p) => p.role === role && !p.injury && (!core.has(p.id) || p.morale < 30))
    .sort((a, b) => a.morale - b.morale || tradeValue(a) - tradeValue(b))
}

/** Both sides still legal (overseas, cap with a little slack) after a swap. */
function swapOk(
  players: CareerPlayer[],
  a: string,
  aIds: string[],
  b: string,
  bIds: string[],
): boolean {
  const after = players.map((p) =>
    aIds.includes(p.id) ? { ...p, teamId: b } : bIds.includes(p.id) ? { ...p, teamId: a } : p,
  )
  return [a, b].every(
    (t) =>
      squadOf(after, t).filter((p) => p.overseas).length <= SQUAD_OVERSEAS_MAX &&
      squadOf(after, t).some((p) => p.role === 'wicketkeeper') &&
      payroll(after, t) <= SALARY_CAP * 1.05,
  )
}

/**
 * AI clubs trade with each other in the windows: each fixes its biggest gap by sending
 * a spare player to a club with the opposite problem, at similar value.
 */
export function aiTrades(career: Career, teamIds: string[], rng: Rng, max = 3): Career {
  let c = career
  let done = 0
  for (const a of shuffle(
    rng,
    teamIds.filter((t) => t !== career.manager.teamId),
  )) {
    if (done >= max) break
    const sa = squadOf(c.players, a)
    for (const need of deficits(sa)) {
      const partner = shuffle(rng, teamIds).find((b) => {
        if (b === a || b === career.manager.teamId) return false
        const sb = squadOf(c.players, b)
        return surpluses(sb).includes(need) || countRole(sb, need) > IDEAL[need]
      })
      if (!partner) continue
      const sb = squadOf(c.players, partner)
      const theirs = tradeable(sb, need)[0]
      if (!theirs) continue
      const give = surpluses(sa)
        .flatMap((r) => tradeable(sa, r))
        .find((p) => {
          const ratio = tradeValue(p) / tradeValue(theirs)
          return ratio > 0.8 && ratio < 1.25 && swapOk(c.players, a, [p.id], partner, [theirs.id])
        })
      if (!give) continue
      c = doTrade(c, a, [give.id], partner, [theirs.id])
      done++
      break
    }
  }
  return c
}

/**
 * AI clubs come to the manager with trade offers: they want one of his spare (or
 * unhappy) players and offer one of similar value, ideally where he is short.
 */
export function aiTradeOffers(career: Career, teamIds: string[], rng: Rng, max = 2): Career {
  const me = career.manager.teamId
  const mine = squadOf(career.players, me)
  const myNeeds = deficits(mine)
  const spare = [
    ...surpluses(mine).flatMap((r) => tradeable(mine, r)),
    ...mine.filter((p) => p.morale < 30),
  ]
  let c = career
  let made = 0
  for (const b of shuffle(
    rng,
    teamIds.filter((t) => t !== me),
  )) {
    if (made >= max) break
    const sb = squadOf(c.players, b)
    const want = spare.find((p) => deficits(sb).includes(p.role) || p.morale < 30)
    if (!want) continue
    const offer = [
      ...myNeeds.flatMap((r) => tradeable(sb, r)),
      ...surpluses(sb).flatMap((r) => tradeable(sb, r)),
    ].find((p) => {
      const ratio = tradeValue(p) / tradeValue(want)
      return ratio > 0.85 && ratio < 1.2 && swapOk(c.players, me, [want.id], b, [p.id])
    })
    if (!offer) continue
    c = addNews(c, {
      kind: 'offer',
      teamIds: [me, b],
      playerId: want.id,
      text: `${teamLabel(b)} offer ${offer.name} for your ${want.name}.`,
      offer: { fromTeamId: b, give: [want.id], get: [offer.id], status: 'pending' },
    })
    made++
  }
  return c
}

/** Accept or decline a trade offer from the news feed. */
export function answerTradeOffer(
  career: Career,
  newsId: string,
  accept: boolean,
): { career: Career; message: string } {
  const item = career.news.find((n) => n.id === newsId)
  const o = item?.offer
  if (!item || !o || o.status !== 'pending')
    return { career, message: 'This offer is no longer open.' }
  const setStatus = (c: Career, status: 'accepted' | 'declined' | 'expired') =>
    updateNews(c, newsId, (n) => ({ ...n, offer: { ...o, status } }))
  if (!accept) return { career: setStatus(career, 'declined'), message: 'Offer declined.' }
  const me = career.manager.teamId
  const stillThere =
    o.give.every((id) => career.players.find((p) => p.id === id)?.teamId === me) &&
    o.get.every((id) => career.players.find((p) => p.id === id)?.teamId === o.fromTeamId)
  if (
    !isWindowOpen(career) ||
    !stillThere ||
    !swapOk(career.players, me, o.give, o.fromTeamId, o.get)
  ) {
    return {
      career: setStatus(career, 'expired'),
      message: 'The deal is off: things have changed.',
    }
  }
  return {
    career: setStatus(doTrade(career, me, o.give, o.fromTeamId, o.get), 'accepted'),
    message: 'Trade done!',
  }
}

// --- AI clubs -----------------------------------------------------------------

const KEEPERS_MIN = 2
const BOWLERS_MIN = 5

/** What an AI squad is short of, most urgent first, as filters for free agents. */
function aiNeeds(squad: CareerPlayer[]): ((p: CareerPlayer) => boolean)[] {
  const needs: ((p: CareerPlayer) => boolean)[] = []
  if (squad.filter((p) => p.role === 'wicketkeeper').length < KEEPERS_MIN)
    needs.push((p) => p.role === 'wicketkeeper')
  if (squad.filter((p) => p.role === 'bowler').length < BOWLERS_MIN)
    needs.push((p) => p.role === 'bowler')
  if (squad.length < SQUAD_MIN) needs.push(() => true)
  return needs
}

/**
 * AI clubs fill gaps from the free-agent market at asking price: first to reach the
 * squad minimum and role needs, then (sometimes) one upgrade if they have cap room.
 */
export function aiSignings(career: Career, teamIds: string[], rng: Rng): Career {
  let players = career.players
  const log = [...career.market.log]
  const news: Parameters<typeof addNews>[1][] = []
  const sign = (p: CareerPlayer, teamId: string) => {
    const salary = askingSalary(p)
    news.push({
      kind: 'transfer',
      teamIds: [teamId],
      playerId: p.id,
      text: `${teamLabel(teamId)} sign free agent ${p.name}.`,
    })
    players = players.map((x) =>
      x.id === p.id ? { ...x, teamId, contract: { salary, years: randInt(rng, 1, 3) } } : x,
    )
    log.push({ year: career.calendar.year, kind: 'signed', playerId: p.id, teamId, salary })
  }
  const affordable = (teamId: string) => (p: CareerPlayer) => {
    const squad = squadOf(players, teamId)
    if (p.overseas && squad.filter((q) => q.overseas).length >= SQUAD_OVERSEAS_MAX) return false
    return askingSalary(p) <= capRoom(players, teamId)
  }
  // Smallest squads shop first, so the market doesn't favour the same clubs every year.
  const order = [...teamIds].sort((a, b) => squadOf(players, a).length - squadOf(players, b).length)
  for (const teamId of order) {
    if (teamId === career.manager.teamId) continue
    for (let guard = 0; guard < SQUAD_MAX; guard++) {
      const squad = squadOf(players, teamId)
      const needs = aiNeeds(squad)
      if (!needs.length || squad.length >= SQUAD_MAX) break
      // The most urgent need that the market can fill; broke clubs take the cheapest fit.
      let pick: CareerPlayer | undefined
      for (const need of needs) {
        const fits = freeAgents(players).filter(
          (p) =>
            need(p) && (!p.overseas || squad.filter((q) => q.overseas).length < SQUAD_OVERSEAS_MAX),
        )
        pick =
          fits.filter(affordable(teamId)).sort((a, b) => overallRating(b) - overallRating(a))[0] ??
          fits.sort((a, b) => askingSalary(a) - askingSalary(b))[0]
        if (pick) break
      }
      if (!pick) break
      sign(pick, teamId)
    }
    // One opportunistic upgrade over the weakest XI regular.
    if (rng() < 0.5 && squadOf(players, teamId).length < SQUAD_MAX) {
      const xi = autoPickXI(squadOf(players, teamId))
      const weakest = Math.min(...xi.map((p) => overallRating(p)))
      const target = freeAgents(players)
        .filter((p) => overallRating(p) > weakest + 2 && affordable(teamId)(p))
        .sort((a, b) => overallRating(b) - overallRating(a))[0]
      if (target) sign(target, teamId)
    }
  }
  return addNews({ ...career, players, market: { ...career.market, log } }, ...news)
}

// --- Season turnover ------------------------------------------------------------

/**
 * Chance a player retires at the end of a season. T20 careers run long (players often
 * go on past 40), and fading players go sooner.
 */
export function retirementChance(p: CareerPlayer): number {
  const overall = overallRating(p)
  if (p.age >= 43) return 1
  if (p.age >= 37) return Math.min(1, 0.1 + 0.12 * (p.age - 37) + (overall < 62 ? 0.15 : 0))
  if (p.age >= 34 && overall < 56) return 0.1
  return 0
}

/**
 * Contracts at season end (after the year has been used): the manager's players with no
 * years left become free agents unless renewed; AI clubs keep most of their good ones.
 */
export function expireContracts(career: Career, rng: Rng): Career {
  const me = career.manager.teamId
  let players = career.players
  // Safety net: the manager keeps enough expiring players (best first, one season at
  // asking price) to still have eleven.
  const mine = squadOf(players, me)
  const staying = mine.filter((p) => (p.contract?.years ?? 0) > 0).length
  const rescue = new Set(
    mine
      .filter((p) => (p.contract?.years ?? 0) <= 0)
      .sort((a, b) => overallRating(b) - overallRating(a))
      .slice(0, Math.max(0, 11 - staying))
      .map((p) => p.id),
  )
  for (const p of career.players) {
    if (!p.teamId || !p.contract || p.contract.years > 0) continue
    if (rescue.has(p.id)) {
      players = players.map((x) =>
        x.id === p.id ? { ...x, contract: { salary: askingSalary(x), years: 1 } } : x,
      )
      continue
    }
    const keep =
      p.teamId !== me &&
      rng() < 0.7 &&
      overallRating(p) >= medianOverall(squadOf(players, p.teamId)) - 3 &&
      askingSalary(p) <= capRoom(players, p.teamId) + p.contract.salary
    players = players.map((x) =>
      x.id !== p.id
        ? x
        : keep
          ? { ...x, contract: { salary: askingSalary(x), years: randInt(rng, 1, 3) } }
          : { ...x, teamId: null, contract: null },
    )
  }
  const leaving = career.players.filter(
    (p) => p.teamId === me && players.find((x) => x.id === p.id)?.teamId === null,
  )
  return addNews(
    { ...career, players },
    ...leaving.map((p) => ({
      kind: 'contract' as const,
      teamIds: [me],
      playerId: p.id,
      text: `${p.name} leaves ${teamLabel(me)} as his contract ends.`,
    })),
  )
}

function medianOverall(squad: CareerPlayer[]): number {
  const v = squad.map((p) => overallRating(p)).sort((a, b) => a - b)
  return v[Math.floor(v.length / 2)] ?? 0
}
