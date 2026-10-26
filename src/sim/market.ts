import { today } from './calendar'
import { START_YEAR, type Career, type CareerPlayer, type Talks } from './career'
import { autoPickXI } from './match/selection'
import { overallRating } from './player'
import { credit, fundsOf } from './finance'
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
export const FREE_AGENT_MAX = 20
/** Share of the season's free agents who are young prospects. */
export const FREE_AGENT_YOUNG = 0.7

/** The free agents the manager can sign right now. */
export function marketAgents(career: Career): CareerPlayer[] {
  const ids = new Set(career.market.freeAgentIds)
  return career.players.filter((p) => p.teamId === null && ids.has(p.id))
}

/** A young prospect (22 or under) from the youth intake. */
export const isProspect = (p: CareerPlayer) => !!p.prospect && p.age <= 22

/**
 * Draw the season's free agents from everyone unsigned: 16 to 20 names, about 70% of
 * them young prospects (the most promising likelier), the rest experienced players with
 * at least one keeper and a few bowlers. Last season's unsold names are less likely, so
 * the list looks different each year.
 */
export function rerollFreeAgents(career: Career, tag: string | number): Career {
  const rng = createRng(deriveSeed(career.seed, 'fa-reroll', tag))
  const before = new Set(career.market.freeAgentIds)
  const pool = freeAgents(career.players)
  const want = Math.min(pool.length, randInt(rng, 16, FREE_AGENT_MAX))
  const chosen: CareerPlayer[] = []
  const stale = (p: CareerPlayer) => (before.has(p.id) ? 0.35 : 1)
  const draw = (from: CareerPlayer[], weight: (p: CareerPlayer) => number) => {
    const left = from.filter((p) => !chosen.includes(p))
    if (!left.length) return
    chosen.push(
      pickWeighted(
        rng,
        left.map((p) => [p, weight(p) * stale(p)]),
      ),
    )
  }
  const young = pool.filter(isProspect)
  const old = pool.filter((p) => !isProspect(p))
  const byPotential = (p: CareerPlayer) => Math.max(1, p.potential - 55) ** 1.3
  const byRating = (p: CareerPlayer) => Math.max(1, overallRating(p) - 35) ** 1.5
  const youngWant = Math.min(young.length, Math.round(want * FREE_AGENT_YOUNG))
  while (chosen.length < youngWant) draw(young, byPotential)
  draw(
    old.filter((p) => p.role === 'wicketkeeper'),
    byRating,
  )
  for (let i = 0; i < 2; i++)
    draw(
      old.filter((p) => p.role === 'bowler'),
      byRating,
    )
  while (chosen.length < want && old.some((p) => !chosen.includes(p))) draw(old, byRating)
  while (chosen.length < want) draw(pool, byRating)
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
  // Form moves the price a lot: 0.80× when badly out of form, 1.25× at the top.
  v *= 0.8 + p.form * 0.0045
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
  /** His one counter: take it, or talks end. */
  | { kind: 'counter'; salary: number; years: number; message: string }
  | { kind: 'reject'; message: string; ended?: boolean }

/** Days before a player who walked out of talks will listen again. */
export const TALKS_COOLDOWN = 14

/** Talks as they stand: a walk-out that has cooled off starts afresh. */
export function talksWith(career: Career, playerId: string): Talks {
  const t = career.market.talks[playerId]
  if (!t) return { rounds: 0, walkedAway: false }
  if (t.walkedAway && t.walkedDay !== undefined && talksReopenIn(career, t) <= 0)
    return { rounds: 0, walkedAway: false, letGo: t.letGo }
  return t
}

/** Days until a walked-out player listens again (Infinity: not this season). */
export function talksReopenIn(career: Career, t: Talks): number {
  if (!t.walkedAway) return 0
  if (t.walkedDay === undefined) return Infinity
  return t.walkedDay + TALKS_COOLDOWN - career.calendar.day
}

/** Why an offer cannot even be made, or null if it can. */
export function offerBlocker(career: Career, playerId: string, offer: Offer): string | null {
  const teamId = career.manager.teamId
  const p = career.players.find((x) => x.id === playerId)
  if (!p) return 'Player not found.'
  if (career.mega) return 'The mega auction is under way. Finish it first.'
  const renewal = p.teamId === teamId
  if (p.teamId !== null && !renewal)
    return `${p.name} is under contract with another club. Try a trade.`
  // Free agents can be signed all year, and a player can be renewed any time in his final year.
  if (!renewal && !career.market.freeAgentIds.includes(p.id))
    return `${p.name} is not on the market this season.`
  if (renewal && (p.contract?.years ?? 0) > 1)
    return `${p.name} still has ${p.contract?.years} seasons left. Renew him in his final year.`
  const t = talksWith(career, playerId)
  if (t.walkedAway) {
    const days = talksReopenIn(career, t)
    return days === Infinity
      ? `${p.name} has ended talks for now.`
      : `${p.name} has ended talks. He will listen again in ${days} day${days === 1 ? '' : 's'}.`
  }
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

/** Seasons a player has been at the manager's club (roughly: since his last move here). */
export function seasonsAtClub(career: Career, p: CareerPlayer): number {
  const me = career.manager.teamId
  const joined = [...career.market.log]
    .reverse()
    .find(
      (e) => e.playerId === p.id && e.teamId === me && (e.kind === 'signed' || e.kind === 'traded'),
    )
  return career.calendar.year - (joined?.year ?? START_YEAR)
}

/** A happy, long-serving player gives his own club a discount; an unhappy one wants out. */
function loyalty(career: Career, p: CareerPlayer): number {
  const mood = p.morale < 35 ? 0.85 : p.morale >= 70 ? 1.1 : 1.05
  return mood + (seasonsAtClub(career, p) >= 3 ? 0.05 : 0)
}

/**
 * The salary that would make this player say yes to this club: asking price, scaled by
 * how appealing the club is, whether he would start, loyalty and the contract length.
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
  // Your own bench players know their place; a star from outside wants a starting spot.
  const role = starts ? 1 : renewal || overallRating(p) < 75 ? 0.95 : 0.85
  const loyal = renewal ? loyalty(career, p) : 1
  return round5(askingSalary(p) / (appeal * role * loyal * yearsFit(p.age, years)))
}

/** Form bands for a renewal: how much more (or less) than his current pay he asks. */
export function formRaise(form: number): number {
  if (form >= 65) return 0.3 + 0.2 * Math.min(1, (form - 65) / 20)
  if (form >= 45) return 0.1 + 0.1 * ((form - 45) / 20)
  return -0.25 * Math.min(1, (45 - form) / 20)
}

/**
 * What a player asks to renew: his current pay moved by his form (in form +30–50%,
 * average +10–20%, out of form a pay cut of up to 25%). An overpaid veteran past his best
 * takes a further cut, and loyalty and the contract length shade it a little.
 */
export function renewalAsk(career: Career, p: CareerPlayer, years: number): number {
  const now = p.contract?.salary ?? askingSalary(p)
  let v = now * (1 + formRaise(p.form))
  if (p.age >= 33 && askingSalary(p) < now) v *= 0.9
  v *= 1.05 / loyalty(career, p)
  v /= yearsFit(p.age, years)
  return round5(v)
}

export interface Agent {
  /** How far below (−) or above (+) a fair price a free agent pitches. */
  greed: number
  label: 'Keen' | 'Fair' | 'Tough'
}

/** The least he will take, as a share of his ask: keen agents come down further. */
const FLOOR: Record<Agent['label'], number> = { Keen: 0.88, Fair: 0.92, Tough: 0.95 }

/**
 * Every player's agent has a personality (seeded per career): some are keen and take
 * a little less, some play hardball.
 */
export function agentOf(career: Career, p: CareerPlayer): Agent {
  const rng = createRng(deriveSeed(career.seed, 'agent', p.id))
  const greed = -0.12 + rng() * 0.2
  return { greed, label: greed < -0.05 ? 'Keen' : greed > 0.03 ? 'Tough' : 'Fair' }
}

/** What he asks for (shown to the manager). Offer this and he signs. */
export function askingPrice(
  career: Career,
  p: CareerPlayer,
  years: number,
  teamIds: string[],
): number {
  if (p.teamId === career.manager.teamId) return renewalAsk(career, p, years)
  return round5(requiredSalary(career, p, years, teamIds) * (1 + agentOf(career, p).greed))
}

/** The least he will take (hidden): an offer at or above this signs him. */
function floorPrice(career: Career, p: CareerPlayer, years: number, teamIds: string[]): number {
  return round5(askingPrice(career, p, years, teamIds) * FLOOR[agentOf(career, p).label])
}

/** The offer slider runs from this share of his ask up to the ask. */
export const OFFER_MIN = 0.8

/**
 * The player's answer to an offer. Deterministic: same situation, same answer. At or
 * above his (hidden) floor he signs. Otherwise he makes one counter, halfway between his
 * ask and your offer; anything short of that counter ends the talks.
 */
export function answerOffer(
  career: Career,
  playerId: string,
  offer: Offer,
  teamIds: string[],
): OfferAnswer {
  const p = career.players.find((x) => x.id === playerId) as CareerPlayer
  const talks = talksWith(career, playerId)
  const floor = floorPrice(career, p, offer.years, teamIds)
  const counter = talks.asks?.[offer.years]
  if (offer.salary >= floor || (counter !== undefined && offer.salary >= counter))
    return { kind: 'accept' }
  if (talks.final)
    return { kind: 'reject', message: `${p.name}'s agent ends the talks.`, ended: true }
  const ask = askingPrice(career, p, offer.years, teamIds)
  const salary = Math.max(floor, round5((ask + offer.salary) / 2))
  const agent = agentOf(career, p).label
  const tone =
    agent === 'Keen'
      ? `${p.name} is keen to make this work.`
      : agent === 'Tough'
        ? `${p.name}'s agent is playing hardball.`
        : `${p.name} wants a little more.`
  return { kind: 'counter', salary, years: offer.years, message: tone }
}

/** Turn down his counter: he ends talks for a fortnight. */
export function declineCounter(career: Career, playerId: string): Career {
  const t = talksWith(career, playerId)
  return {
    ...career,
    market: {
      ...career.market,
      talks: {
        ...career.market.talks,
        [playerId]: { ...t, walkedAway: true, walkedDay: career.calendar.day },
      },
    },
  }
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
  const prev = talksWith(career, playerId)
  const p = career.players.find((x) => x.id === playerId) as CareerPlayer
  const { [playerId]: _done, ...others } = career.market.talks
  void _done
  const ended = answer.kind === 'reject' && !!answer.ended
  const talks: Record<string, Talks> =
    answer.kind === 'accept'
      ? others
      : {
          ...others,
          [playerId]: {
            ...prev,
            rounds: prev.rounds + 1,
            walkedAway: ended,
            ...(ended ? { walkedDay: career.calendar.day } : {}),
            asks:
              answer.kind === 'counter'
                ? { ...prev.asks, [answer.years]: answer.salary }
                : prev.asks,
            final: answer.kind === 'counter' || prev.final,
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
        ? `${p.name} signs a ${offer.years}-season extension with ${teamLabel(me)}.`
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

/**
 * Sign a player. A renewal adds the new seasons to what is left of his deal (so renewing
 * in his final year, at any point of it, keeps him for that many more seasons).
 */
export function signPlayer(career: Career, playerId: string, teamId: string, offer: Offer): Career {
  const p = career.players.find((x) => x.id === playerId)
  const renewal = p?.teamId === teamId
  const years = (renewal ? (p?.contract?.years ?? 0) : 0) + offer.years
  return {
    ...career,
    players: career.players.map((x) =>
      x.id === playerId ? { ...x, teamId, contract: { salary: offer.salary, years } } : x,
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

/** Decide not to renew a player (he plays on until his contract ends), or change your mind. */
export function setLetGo(career: Career, playerId: string, on: boolean): Career {
  const t = talksWith(career, playerId)
  return {
    ...career,
    market: {
      ...career.market,
      talks: { ...career.market.talks, [playerId]: { ...t, letGo: on } },
    },
  }
}

/** Put one of the manager's players on the transfer list (or take him off). */
export function setListed(career: Career, playerId: string, on: boolean): Career {
  const listed = (career.market.listed ?? []).filter((id) => id !== playerId)
  return { ...career, market: { ...career.market, listed: on ? [...listed, playerId] : listed } }
}

export function releaseBlocker(career: Career, playerId: string): string | null {
  const teamId = career.manager.teamId
  const p = career.players.find((x) => x.id === playerId)
  if (!p || p.teamId !== teamId) return 'Not your player.'
  if (career.mega) return 'The mega auction is under way. Finish it first.'
  if (squadOf(career.players, teamId).length <= SQUAD_MIN)
    return `Your squad needs at least ${SQUAD_MIN} players: sign a replacement before releasing anyone.`
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
    return 'squad would have too many overseas players'
  if (!squad.some((p) => p.role === 'wicketkeeper')) return 'squad would have no wicketkeeper'
  if (payroll(players, teamId) > SALARY_CAP) return 'payroll would go over the salary cap'
  return null
}

/** Cash in a trade: lakh per trade-value point. */
export const CASH_PER_POINT = 5
/** Clubs count cash they receive a little below the same value in players. */
export const CASH_WORTH = 0.85
/** Counters a club makes before its final word (per club, per season). */
export const TRADE_ROUNDS = 3
/** Clubs want this much more value than they give up. */
const TRADE_MARGIN = 1.05

/** A trade proposal: players both ways plus cash from club funds. */
export interface TradeDeal {
  /** The other club. */
  club: string
  /** Your players who go to them. */
  give: string[]
  /** Their players who come to you. */
  get: string[]
  /** Lakh. Positive: you pay them; negative: they pay you. */
  cash: number
}

export type TradeReply =
  | { kind: 'accept' }
  | {
      kind: 'counter'
      message: string
      /** Meet their price with this much cash (the deal's new `cash`)... */
      cash?: number
      /** ...or add this player of yours. */
      player?: string
      /** Their last counter: after this they stop talking for the season. */
      final: boolean
    }
  | { kind: 'reject'; message: string }

/** How far a deal goes towards what the club wants: `progress` 1 means value enough. */
export function tradeTally(career: Career, deal: TradeDeal) {
  const value = (ids: string[]) =>
    ids.reduce((s, id) => {
      const p = career.players.find((x) => x.id === id)
      return s + (p ? tradeValue(p) : 0)
    }, 0)
  const valueIn = value(deal.give) + (Math.max(0, deal.cash) / CASH_PER_POINT) * CASH_WORTH
  const valueOut = value(deal.get) + Math.max(0, -deal.cash) / CASH_PER_POINT
  const target = valueOut * TRADE_MARGIN
  const progress = target > 0 ? Math.min(1, valueIn / target) : valueIn > 0 ? 1 : 0
  return { valueIn, valueOut, target, progress }
}

/** Counters a club has made this season. */
export const tradeRounds = (career: Career, club: string) => career.market.tradeTalks?.[club] ?? 0

/**
 * The other club's answer to a deal. It must leave both squads legal, and the club won't
 * open a hole in its own squad (it asks for a player of that role instead). Short of
 * value, it counters with the cash that closes the gap, or one of your spare players
 * who does; after {@link TRADE_ROUNDS} counters it stops talking for the season.
 */
export function judgeTrade(career: Career, deal: TradeDeal): TradeReply {
  const me = career.manager.teamId
  const { club, give, get, cash } = deal
  const no = (message: string): TradeReply => ({ kind: 'reject', message })
  if (!isWindowOpen(career))
    return no(
      career.mega
        ? 'The mega auction is under way.'
        : 'Trades happen in the preseason or after the season.',
    )
  if (!club || club === me) return no('Pick another club.')
  if (!get.length && !give.length) return no('Put players or cash on the table.')
  if (!get.length && cash >= 0) return no('Ask for a player, or ask them to pay for yours.')
  if (!give.length && cash <= 0) return no('Offer players or cash for him.')
  const byId = new Map(career.players.map((p) => [p.id, p]))
  const out = give.map((id) => byId.get(id))
  const inn = get.map((id) => byId.get(id))
  if (out.some((p) => p?.teamId !== me)) return no('You can only offer your own players.')
  if (inn.some((p) => p?.teamId !== club)) return no('Ask for players from one other club.')
  if (inn.some((p) => p?.injury) || out.some((p) => p?.injury))
    return no('Injured players cannot be traded.')
  if (cash > fundsOf(career, me)) return no("You don't have that much in club funds.")
  if (-cash > fundsOf(career, club)) return no(`${teamLabel(club)} can't afford that.`)
  if (tradeRounds(career, club) >= TRADE_ROUNDS)
    return no(`${teamLabel(club)} have said their last word. Try again next season.`)

  const legal = (g: string[]): string | null => {
    const after = swap(career.players, g, get, me, club)
    const mine = squadProblem(after, me, squadOf(career.players, me).length)
    if (mine) return `Your ${mine}.`
    const theirs = squadProblem(after, club, squadOf(career.players, club).length)
    return theirs ? `They refuse: their ${theirs}.` : null
  }
  const problem = legal(give)
  if (problem) return no(problem)

  const final = tradeRounds(career, club) + 1 >= TRADE_ROUNDS
  const xi = new Set(autoPickXI(squadOf(career.players, me)).map((p) => p.id))
  // Your spare players first (outside the XI), cheapest first.
  const spares = squadOf(career.players, me)
    .filter((p) => !give.includes(p.id) && !p.injury)
    .sort((a, b) => Number(xi.has(a.id)) - Number(xi.has(b.id)) || tradeValue(a) - tradeValue(b))

  // A hole in their squad: they want a player of that role back.
  const theirs = squadOf(career.players, club)
  const after = swap(career.players, give, get, me, club)
  const hole = ROLES.find((r) => {
    const before = countRole(theirs, r)
    const now = countRole(squadOf(after, club), r)
    return now < before && now < IDEAL[r] - 1
  })
  if (hole) {
    const fill = spares.find((p) => p.role === hole && !legal([...give, p.id]))
    return fill
      ? {
          kind: 'counter',
          player: fill.id,
          final,
          message: `${teamLabel(club)} won't be left short of a ${ROLE_WORD[hole]}: they want one back, like ${fill.name}.`,
        }
      : no(
          `${teamLabel(club)} won't be left short of a ${ROLE_WORD[hole]}, and you have none to spare.`,
        )
  }

  const t = tradeTally(career, deal)
  if (t.valueIn >= t.target) return { kind: 'accept' }
  // The cash that closes the gap, in 5-lakh steps.
  let more = cash
  while (tradeTally(career, { ...deal, cash: more }).progress < 1) more += 5
  const cashOk = more <= fundsOf(career, me)
  const gap = t.target - t.valueIn
  const player = spares.find((p) => tradeValue(p) >= gap && !legal([...give, p.id]))
  if (!cashOk && !player) return no('They want more value in return.')
  const extra = more - cash
  const bits = [
    cashOk
      ? cash < 0 && more <= 0
        ? `pay ${money(-more)} instead of ${money(-cash)}`
        : `${extra > 0 && cash > 0 ? 'another ' : ''}${money(more - Math.max(0, cash))} in cash`
      : '',
    player ? `add ${player.name}` : '',
  ].filter(Boolean)
  return {
    kind: 'counter',
    cash: cashOk ? more : undefined,
    player: player?.id,
    final,
    message: `${teamLabel(club)} want more: ${bits.join(', or ')}.`,
  }
}

const ROLE_WORD: Record<CareerPlayer['role'], string> = {
  batter: 'batter',
  wicketkeeper: 'wicketkeeper',
  allrounder: 'all-rounder',
  bowler: 'bowler',
}

/** "₹1.5 cr" / "₹75 L" for news and counters. */
const money = (lakh: number) =>
  lakh >= 100 ? `₹${+(lakh / 100).toFixed(2)} cr` : `₹${Math.round(lakh)} L`

/** Would the other club accept a straight player swap? (No cash, no counter.) */
export function evaluateTrade(career: Career, give: string[], get: string[]): TradeAnswer {
  if (!give.length || !get.length) return { ok: false, reason: 'Pick players on both sides.' }
  const club = career.players.find((p) => p.id === get[0])?.teamId ?? ''
  const r = judgeTrade(
    { ...career, market: { ...career.market, tradeTalks: {} } },
    { club, give, get, cash: 0 },
  )
  return r.kind === 'accept'
    ? { ok: true }
    : { ok: false, reason: r.kind === 'reject' ? r.message : 'They want more value in return.' }
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

/**
 * Put a deal to the other club: on acceptance the players and cash move; a counter
 * uses up one of the season's rounds with that club.
 */
export function proposeDeal(
  career: Career,
  deal: TradeDeal,
): { career: Career; reply: TradeReply } {
  const reply = judgeTrade(career, deal)
  const rounds = (n: number) => ({
    ...career.market,
    tradeTalks: { ...career.market.tradeTalks, [deal.club]: n },
  })
  if (reply.kind === 'counter')
    return {
      career: { ...career, market: rounds(tradeRounds(career, deal.club) + 1) },
      reply,
    }
  if (reply.kind !== 'accept') return { career, reply }
  const done = doTrade(
    { ...career, market: rounds(0) },
    career.manager.teamId,
    deal.give,
    deal.club,
    deal.get,
    deal.cash,
  )
  return { career: done, reply }
}

/**
 * Move players between two clubs (contracts go with them) and `cash` from a to b (lakh,
 * negative: b pays a); log and news the deal.
 */
export function doTrade(
  career: Career,
  a: string,
  aIds: string[],
  b: string,
  bIds: string[],
  cash = 0,
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
  const side = (ids: string[], pays: number) =>
    [ids.map(name).join(', '), pays > 0 ? `${money(pays)} cash` : ''].filter(Boolean).join(' + ')
  let c: Career = { ...career, players, market: { ...career.market, log } }
  if (cash) {
    const label = `Trade with ${teamLabel(cash > 0 ? b : a)}`
    c = credit(credit(c, a, -cash, cash > 0 ? label : `Trade with ${teamLabel(b)}`), b, cash, label)
  }
  return addNews(c, {
    kind: 'trade',
    teamIds: [a, b],
    text: `Trade: ${side(aIds, cash)} to ${teamLabel(b)}; ${side(bIds, -cash)} to ${teamLabel(a)}.`,
  })
}

/** Ideal squad shape the AI aims for when it trades. */
export const IDEAL: Record<CareerPlayer['role'], number> = {
  wicketkeeper: 2,
  batter: 5,
  allrounder: 4,
  bowler: 6,
}
export const ROLES = Object.keys(IDEAL) as CareerPlayer['role'][]
function countRole(squad: CareerPlayer[], r: CareerPlayer['role']) {
  return squad.filter((p) => p.role === r).length
}
export const deficits = (squad: CareerPlayer[]) =>
  ROLES.filter((r) => countRole(squad, r) < IDEAL[r]).sort(
    (x, y) => countRole(squad, x) - IDEAL[x] - (countRole(squad, y) - IDEAL[y]),
  )
const surpluses = (squad: CareerPlayer[]) => ROLES.filter((r) => countRole(squad, r) > IDEAL[r])

/** Players a club would part with: not among its six most valuable; unhappy ones first. */
export function tradeable(squad: CareerPlayer[], role: CareerPlayer['role']): CareerPlayer[] {
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
 * AI clubs come to the manager with trade offers: they want one of his listed, spare (or
 * unhappy) players and offer one of similar value, ideally where he is short. With
 * `only`, every offer is for that one (listed) player.
 */
export function aiTradeOffers(
  career: Career,
  teamIds: string[],
  rng: Rng,
  max = 2,
  only?: string,
): Career {
  const me = career.manager.teamId
  const mine = squadOf(career.players, me)
  const myNeeds = deficits(mine)
  const listed = new Set(career.market.listed ?? [])
  const spare = only
    ? mine.filter((p) => p.id === only && !p.injury)
    : [
        ...mine.filter((p) => listed.has(p.id) && !p.injury),
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
    const want = spare.find(
      (p) => listed.has(p.id) || deficits(sb).includes(p.role) || p.morale < 30,
    )
    if (!want) continue
    const offer = [
      ...myNeeds.flatMap((r) => tradeable(sb, r)),
      ...surpluses(sb).flatMap((r) => tradeable(sb, r)),
      // A listed player is wanted for himself: the club offers whoever fits the value.
      ...(listed.has(want.id) ? ROLES.flatMap((r) => tradeable(sb, r)) : []),
    ].find((p) => {
      const ratio = tradeValue(p) / tradeValue(want)
      return ratio > 0.85 && ratio < 1.2 && swapOk(c.players, me, [want.id], b, [p.id])
    })
    if (!offer) {
      // No player fits: a club that wants him (or he's listed) may simply pay for him.
      const price = Math.ceil((tradeValue(want) * CASH_PER_POINT * 0.9) / 5) * 5
      if (
        (listed.has(want.id) || deficits(sb).includes(want.role)) &&
        fundsOf(c, b) >= price &&
        swapOk(c.players, me, [want.id], b, [])
      ) {
        c = addNews(c, {
          kind: 'offer',
          teamIds: [me, b],
          playerId: want.id,
          text: `${teamLabel(b)} offer ${money(price)} cash for your ${want.name}.`,
          offer: { fromTeamId: b, give: [want.id], get: [], cash: -price, status: 'pending' },
        })
        made++
      }
      continue
    }
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
  const cash = o.cash ?? 0
  if (
    !isWindowOpen(career) ||
    !stillThere ||
    !swapOk(career.players, me, o.give, o.fromTeamId, o.get) ||
    -cash > fundsOf(career, o.fromTeamId) ||
    cash > fundsOf(career, me)
  ) {
    return {
      career: setStatus(career, 'expired'),
      message: 'The deal is off: things have changed.',
    }
  }
  return {
    career: setStatus(doTrade(career, me, o.give, o.fromTeamId, o.get, cash), 'accepted'),
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

/** Does this (already aged) player retire at the end of `endedYear`? Seeded per player. */
export function retires(seed: number, endedYear: number, aged: CareerPlayer): boolean {
  const chance = retirementChance(aged)
  return chance > 0 && createRng(deriveSeed(seed, 'retire', endedYear, aged.id))() < chance
}

/**
 * Safety net at season end: of the manager's players with no years left, the best are
 * kept (one season at asking price) so that he still has eleven.
 */
export function safetyNet(mine: CareerPlayer[]): Set<string> {
  const staying = mine.filter((p) => (p.contract?.years ?? 0) > 0).length
  return new Set(
    mine
      .filter((p) => (p.contract?.years ?? 0) <= 0)
      .sort((a, b) => overallRating(b) - overallRating(a))
      .slice(0, Math.max(0, 11 - staying))
      .map((p) => p.id),
  )
}

/**
 * Contracts at season end (after the year has been used): the manager's players with no
 * years left become free agents unless renewed; AI clubs keep most of their good ones.
 */
export function expireContracts(career: Career, rng: Rng): Career {
  const me = career.manager.teamId
  let players = career.players
  const rescue = safetyNet(squadOf(players, me))
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
