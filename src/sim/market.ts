import { today } from './calendar'
import type { Career, CareerPlayer } from './career'
import { autoPickXI } from './match/selection'
import { overallRating } from './player'
import { randInt, type Rng } from './rng'

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
/** Offers a player will hear before walking away for this window. */
export const MAX_ROUNDS = 3

export const squadOf = (players: CareerPlayer[], teamId: string) =>
  players.filter((p) => p.teamId === teamId)
export const freeAgents = (players: CareerPlayer[]) => players.filter((p) => p.teamId === null)
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
  if (!isWindowOpen(career))
    return 'The market is closed. Sign players in the preseason or after the season.'
  const renewal = p.teamId === teamId
  if (p.teamId !== null && !renewal)
    return `${p.name} is under contract with another club. Try a trade.`
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
  const loyalty = renewal ? 1.05 : 1
  return round5(askingSalary(p) / (appeal * role * loyalty * yearsFit(p.age, years)))
}

/** The player's answer to an offer. Deterministic: same situation, same answer. */
export function answerOffer(
  career: Career,
  playerId: string,
  offer: Offer,
  teamIds: string[],
): OfferAnswer {
  const p = career.players.find((x) => x.id === playerId) as CareerPlayer
  const need = requiredSalary(career, p, offer.years, teamIds)
  const rounds = (career.market.talks[playerId]?.rounds ?? 0) + 1
  if (offer.salary >= need) return { kind: 'accept' }
  if (rounds >= MAX_ROUNDS)
    return { kind: 'reject', message: `${p.name} has heard enough and ends the talks.` }
  if (offer.salary >= need * 0.8) {
    const years = preferredYears(p.age)
    return {
      kind: 'counter',
      salary: requiredSalary(career, p, years, teamIds),
      years,
      message: `${p.name} wants more. He would sign for ${years} season${years > 1 ? 's' : ''}.`,
    }
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
  const talks = {
    ...career.market.talks,
    [playerId]: {
      rounds: prev.rounds + 1,
      walkedAway: answer.kind === 'reject' && prev.rounds + 1 >= MAX_ROUNDS,
    },
  }
  let next: Career = { ...career, market: { ...career.market, talks } }
  if (answer.kind === 'accept') next = signPlayer(next, playerId, career.manager.teamId, offer)
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
  if (!isWindowOpen(career))
    return 'You can only release players in the preseason or after the season.'
  if (squadOf(career.players, teamId).length <= SQUAD_MIN)
    return `Your squad needs at least ${SQUAD_MIN} players.`
  return null
}

/** Release a player to the free-agent market (his salary comes off your payroll). */
export function releasePlayer(career: Career, playerId: string): Career {
  if (releaseBlocker(career, playerId)) return career
  return {
    ...career,
    players: career.players.map((x) =>
      x.id === playerId ? { ...x, teamId: null, contract: null } : x,
    ),
    market: {
      ...career.market,
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

/** Signings, releases and trades happen in the preseason and after the season. */
export function isWindowOpen(career: Career): boolean {
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
    return { ok: false, reason: 'Trades happen in the preseason or after the season.' }
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
  const me = career.manager.teamId
  return {
    ...career,
    players: swap(career.players, give, get, me, them),
    market: {
      ...career.market,
      log: [
        ...career.market.log,
        ...give.map((playerId) => ({
          year: career.calendar.year,
          kind: 'traded' as const,
          playerId,
          teamId: them,
          salary: 0,
        })),
        ...get.map((playerId) => ({
          year: career.calendar.year,
          kind: 'traded' as const,
          playerId,
          teamId: me,
          salary: 0,
        })),
      ],
    },
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
  const sign = (p: CareerPlayer, teamId: string) => {
    const salary = askingSalary(p)
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
  return { ...career, players, market: { ...career.market, log } }
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
  return { ...career, players }
}

function medianOverall(squad: CareerPlayer[]): number {
  const v = squad.map((p) => overallRating(p)).sort((a, b) => a - b)
  return v[Math.floor(v.length / 2)] ?? 0
}
