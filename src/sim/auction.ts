import { teams } from '../data'
import { START_YEAR, type Career, type CareerPlayer } from './career'
import {
  askingSalary,
  freeAgents,
  preferredYears,
  SALARY_CAP,
  SQUAD_MAX,
  SQUAD_MIN,
  SQUAD_OVERSEAS_MAX,
  squadOf,
} from './market'
import {
  CAPABILITY_LABEL,
  evaluatePlayer,
  personalityOf,
  planFor,
  squadNeeds,
  type AuctionView,
  type Evaluation,
  type Personality,
} from './auctionAI'
import { addNews } from './news'
import { overallRating } from './player'
import { createRng, deriveSeed, pickWeighted, randInt, shuffle } from './rng'

/*
 * The mega auction. Every third season, once the season is over, each club keeps up to
 * five players (the retentions) and everyone else goes into one pool that is sold in sets
 * (marquee, batters, all-rounders, keepers, fast bowlers, spinners, then an accelerated
 * round for the unsold). Prices are salaries in lakh per season. All functions are pure
 * and deterministic: the same career seed and the same choices give the same auction, so
 * the whole thing lives in `career.mega` and saves like everything else.
 */

const TEAM_IDS = teams.map((t) => t.id)

/** A mega auction follows every third season. */
export const MEGA_EVERY = 3
export const RETAIN_MAX = 5
export const RETAIN_OVERSEAS_MAX = 2
/** What the 1st to 5th most valuable retention costs a club, in lakh. */
export const RETENTION_PRICE = [1800, 1400, 1100, 900, 700]
const MARQUEE_SIZE = 8
const SET_SIZE = 10

export const isMegaYear = (endedYear: number) => (endedYear - START_YEAR + 1) % MEGA_EVERY === 0

/** The season after which the next mega auction is held (this year's, if it is one). */
export function nextMegaSeason(year: number): number {
  let y = year
  while (!isMegaYear(y)) y++
  return y
}

export type SetKind = 'marquee' | 'bat' | 'ar' | 'wk' | 'fast' | 'spin' | 'accelerated'

export const KIND_LABEL: Record<SetKind, string> = {
  marquee: 'Marquee',
  bat: 'Batters',
  ar: 'All-rounders',
  wk: 'Wicketkeepers',
  fast: 'Fast bowlers',
  spin: 'Spin bowlers',
  accelerated: 'Accelerated round',
}

export interface AuctionSet {
  kind: SetKind
  label: string
  ids: string[]
}

export interface Lot {
  playerId: string
  /** Starting price. */
  base: number
  /** The standing bid (the base price while nobody has bid). */
  bid: number
  bidderId: string | null
  /** The manager has dropped out of this lot. */
  out: boolean
  /** Each club's limit for this player (0 = not interested). The manager's is used only when the captain bids for him. */
  ceilings: Record<string, number>
  /** Price at which each club joins in (patient clubs let the price develop first). */
  entry?: Record<string, number>
  /** The last few bids, oldest first. */
  trail: { teamId: string; bid: number }[]
  /** Rival decisions taken so far (seeds the next one). */
  step: number
}

export interface Sale {
  playerId: string
  teamId: string
  price: number
}

export interface MegaState {
  /** The season whose end started it. */
  year: number
  stage: 'retention' | 'auction' | 'done'
  retained: Record<string, string[]>
  /** Auction money left, per club, in lakh. */
  purses: Record<string, number>
  sets: AuctionSet[]
  setIndex: number
  /** Position within the current set. */
  lotIndex: number
  lot: Lot | null
  sold: Sale[]
  unsold: string[]
  /** Players the manager wants, with the most he will pay (lakh). Sims bid for him up to it. */
  shortlist: Record<string, number>
  /** While simming, the captain also buys players the manager's squad needs. */
  autoBid: boolean
  /** Sims stop when a shortlisted player comes up, so the manager can bid himself. */
  stopForShortlist: boolean
  accelerated: boolean
  /** How the last lot ended, for the screen. */
  last: { playerId: string; teamId: string | null; price: number } | null
}

const me = (c: Career) => c.manager.teamId
const byId = (c: Career, id: string) => c.players.find((p) => p.id === id) as CareerPlayer
const withMega = (c: Career, mega: MegaState | null): Career => ({ ...c, mega })

// --- Prices ------------------------------------------------------------------------

/** Bid steps: finer at the bottom, coarser at the top. */
export const increment = (bid: number) => (bid < 100 ? 5 : bid < 200 ? 10 : bid < 500 ? 25 : 50)

export function basePrice(p: CareerPlayer): number {
  const o = overallRating(p)
  return o >= 78 ? 200 : o >= 68 ? 100 : o >= 58 ? 50 : 20
}

/** The next bid anyone can make on this lot. */
export const nextBid = (lot: Lot) =>
  lot.bidderId === null ? lot.base : lot.bid + increment(lot.bid)

/**
 * How much a club wants to keep a player: proven ability first, a little extra for a
 * young player still growing, a little less for a veteran.
 */
export function retentionValue(p: CareerPlayer): number {
  const overall = overallRating(p)
  const growth = p.age <= 25 ? Math.max(0, p.potential - overall) * 0.3 : 0
  return overall + growth - (p.age >= 35 ? 3 : 0)
}

/** The retention prices by value: the most valuable player takes the dearest slab. */
export function retentionPrices(players: CareerPlayer[]): Record<string, number> {
  const out: Record<string, number> = {}
  ;[...players]
    .sort((a, b) => retentionValue(b) - retentionValue(a))
    .forEach((p, i) => {
      out[p.id] = RETENTION_PRICE[i] ?? 700
    })
  return out
}

// --- Retention -----------------------------------------------------------------------

/** Called at the turn of a mega year: squads stay as they are until retentions are in. */
export function startMega(career: Career, endedYear: number): Career {
  const mega: MegaState = {
    year: endedYear,
    stage: 'retention',
    retained: {},
    purses: {},
    sets: [],
    setIndex: 0,
    lotIndex: 0,
    lot: null,
    sold: [],
    unsold: [],
    shortlist: {},
    autoBid: true,
    stopForShortlist: false,
    accelerated: false,
    last: null,
  }
  return addNews(withMega(career, mega), {
    kind: 'board',
    teamIds: [me(career)],
    text: `Mega auction time: pick up to ${RETAIN_MAX} players to keep. Everyone else goes into the pool.`,
  })
}

/** Why this retention is not allowed, or null. */
export function retentionBlocker(career: Career, ids: string[]): string | null {
  const m = career.mega
  if (!m || m.stage !== 'retention') return 'There is no retention to make.'
  if (new Set(ids).size !== ids.length) return 'A player is listed twice.'
  if (ids.length > RETAIN_MAX) return `You can keep at most ${RETAIN_MAX} players.`
  const mine = squadOf(career.players, me(career))
  const picked = ids.map((id) => mine.find((p) => p.id === id))
  if (picked.some((p) => !p)) return 'You can only keep your own players.'
  if (picked.filter((p) => p?.overseas).length > RETAIN_OVERSEAS_MAX)
    return `At most ${RETAIN_OVERSEAS_MAX} overseas players can be kept.`
  return null
}

/** Retain the most valuable players, within the overseas limit. */
function bestToKeep(squad: CareerPlayer[], count: number): CareerPlayer[] {
  const out: CareerPlayer[] = []
  for (const p of [...squad].sort((a, b) => retentionValue(b) - retentionValue(a))) {
    if (out.length >= count) break
    if (p.age >= 38) continue
    if (p.overseas && out.filter((q) => q.overseas).length >= RETAIN_OVERSEAS_MAX) continue
    out.push(p)
  }
  return out
}

/** A sensible default for the manager. */
export const suggestRetention = (career: Career): string[] =>
  bestToKeep(squadOf(career.players, me(career)), RETAIN_MAX).map((p) => p.id)

/**
 * The manager's retentions go in, the AI clubs make theirs, everyone else joins the pool
 * and the sets are drawn. The auction opens at the first lot.
 */
export function confirmRetention(career: Career, ids: string[]): Career {
  const m = career.mega
  if (!m || retentionBlocker(career, ids)) return career
  const retained: Record<string, string[]> = {}
  for (const t of TEAM_IDS) {
    retained[t] =
      t === me(career)
        ? ids
        : bestToKeep(
            squadOf(career.players, t),
            randInt(createRng(deriveSeed(career.seed, 'mega-keep', m.year, t)), 4, RETAIN_MAX),
          ).map((p) => p.id)
  }
  const keep = new Set(Object.values(retained).flat())
  const price: Record<string, number> = {}
  const purses: Record<string, number> = {}
  for (const t of TEAM_IDS) {
    const prices = retentionPrices((retained[t] ?? []).map((id) => byId(career, id)))
    Object.assign(price, prices)
    purses[t] = SALARY_CAP - Object.values(prices).reduce((s, v) => s + v, 0)
  }
  const players = career.players.map((p) =>
    keep.has(p.id)
      ? {
          ...p,
          morale: Math.max(p.morale, 70),
          contract: { salary: price[p.id] as number, years: preferredYears(p.age) },
        }
      : p.teamId
        ? { ...p, teamId: null, contract: null }
        : p,
  )
  const pool = players.filter((p) => p.teamId === null)
  const announce = (t: string) => {
    const names = (retained[t] ?? []).map((id) => byId(career, id).name)
    return `${teams.find((x) => x.id === t)?.short} retain ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}.`
  }
  const sets = buildSets(pool, deriveSeed(career.seed, 'mega-sets', m.year)).filter(
    (s) => s.ids.length > 0,
  )
  const next = withMega(
    { ...career, players },
    {
      ...m,
      // A league with nobody left to sell has no auction to run.
      stage: sets.length ? 'auction' : 'done',
      retained,
      purses,
      sets,
      setIndex: 0,
      lotIndex: 0,
    },
  )
  return addNews(
    next,
    ...TEAM_IDS.filter((t) => t !== me(career)).map((t) => ({
      kind: 'transfer' as const,
      teamIds: [t],
      text: announce(t),
    })),
  )
}

// --- Sets ------------------------------------------------------------------------------

const kindOf = (p: CareerPlayer): SetKind =>
  p.role === 'batter'
    ? 'bat'
    : p.role === 'wicketkeeper'
      ? 'wk'
      : p.role === 'allrounder'
        ? 'ar'
        : p.bowlingType === 'spin'
          ? 'spin'
          : 'fast'

/** The order in which role groups come round, as in the real auctions. */
const ROUND: SetKind[] = ['bat', 'ar', 'wk', 'fast', 'spin']

/** Split n into the fewest groups of at most SET_SIZE, as evenly as possible. */
function chunk<T>(items: T[]): T[][] {
  const groups = Math.ceil(items.length / SET_SIZE)
  const out: T[][] = []
  let from = 0
  for (let g = 0; g < groups; g++) {
    const take = Math.ceil((items.length - from) / (groups - g))
    out.push(items.slice(from, from + take))
    from += take
  }
  return out
}

/** Marquee set first, then rounds of batters, all-rounders, keepers, fast bowlers and spinners. */
export function buildSets(pool: CareerPlayer[], seed: number): AuctionSet[] {
  const rng = createRng(seed)
  const ranked = [...pool].sort((a, b) => retentionValue(b) - retentionValue(a))
  const marquee = ranked.slice(0, MARQUEE_SIZE)
  const rest = ranked.slice(MARQUEE_SIZE)
  const sets: AuctionSet[] = [
    { kind: 'marquee', label: 'Marquee', ids: shuffle(rng, marquee).map((p) => p.id) },
  ]
  const groups = Object.fromEntries(
    ROUND.map((k) => [k, chunk(rest.filter((p) => kindOf(p) === k))]),
  ) as Record<SetKind, CareerPlayer[][]>
  const rounds = Math.max(...ROUND.map((k) => groups[k].length))
  for (let r = 0; r < rounds; r++) {
    for (const k of ROUND) {
      const g = groups[k][r]
      if (g)
        sets.push({
          kind: k,
          label: `${KIND_LABEL[k]} ${r + 1}`,
          ids: shuffle(rng, g).map((p) => p.id),
        })
    }
  }
  return sets
}

/** Total lots in the auction so far, and how many are done. */
export function progress(m: MegaState): { done: number; total: number } {
  const total = m.sets.reduce((s, x) => s + x.ids.length, 0)
  const before = m.sets.slice(0, m.setIndex).reduce((s, x) => s + x.ids.length, 0)
  return { done: before + m.lotIndex, total }
}

/** The index of the next set of this kind after the current one, or null. */
export function nextSetOfKind(m: MegaState, kind: SetKind): number | null {
  const i = m.sets.findIndex((s, idx) => idx > m.setIndex && s.kind === kind)
  return i < 0 ? null : i
}

/** The player whose lot comes up next (or is on now). */
export function upNext(m: MegaState): string | null {
  return m.lot?.playerId ?? m.sets[m.setIndex]?.ids[m.lotIndex] ?? null
}

// --- Bidders ---------------------------------------------------------------------------

/** The money a club must keep back to still reach the squad minimum. */
export const reserveFor = (squadSize: number) => Math.max(0, SQUAD_MIN - squadSize - 1) * 20

/** The manager's captain bids like a balanced club when he lets it. */
const CAPTAIN: Personality = {
  style: 'balanced',
  premium: 1.08,
  maxShare: 0.27,
  patience: 0,
  squadTarget: 22,
  eagerness: 1,
}

const personality = (career: Career, teamId: string): Personality =>
  teamId === me(career) ? CAPTAIN : personalityOf(career.seed, TEAM_IDS, teamId)

/** Players still to be auctioned after the current position (the order is published). */
function upcoming(m: MegaState): string[] {
  return [
    ...(m.sets[m.setIndex]?.ids.slice(m.lotIndex + 1) ?? []),
    ...m.sets.slice(m.setIndex + 1).flatMap((s) => s.ids),
  ]
}

/** What every club can see at this lot: squads, purses, needs, and who is still to come. */
export function auctionView(career: Career, m: MegaState): AuctionView {
  const byIdMap = new Map(career.players.map((p) => [p.id, p]))
  const pool = upcoming(m)
    .map((id) => byIdMap.get(id))
    .filter((p): p is CareerPlayer => !!p && p.teamId === null)
  const { done, total } = progress(m)
  const clubs = Object.fromEntries(
    TEAM_IDS.map((t) => {
      const squad = squadOf(career.players, t)
      return [
        t,
        {
          teamId: t,
          squad,
          overseas: squad.filter((p) => p.overseas).length,
          purse: m.purses[t] ?? 0,
          needs: squadNeeds(squad, planFor(t)),
          personality: personality(career, t),
        },
      ]
    }),
  )
  return {
    clubs,
    pool,
    lotsLeft: pool.length + 1,
    progress: total ? done / total : 0,
    accelerated: m.accelerated,
  }
}

/** Every club's evaluation of the player on the block (same noise as the lot uses). */
function evaluateLot(career: Career, m: MegaState, p: CareerPlayer): Evaluation[] {
  const view = auctionView(career, m)
  const base = m.accelerated ? 20 : basePrice(p)
  const rng = createRng(deriveSeed(career.seed, 'mega-lot', m.year, p.id, m.accelerated ? 1 : 0))
  return TEAM_IDS.map((t) => evaluatePlayer(view, t, p, base, rng()))
}

/** How high a club would go for a player (0 if it cannot or will not bid). */
export function ceilingFor(
  career: Career,
  m: MegaState,
  teamId: string,
  p: CareerPlayer,
  noise: number,
): number {
  const base = m.accelerated ? 20 : basePrice(p)
  return evaluatePlayer(auctionView(career, m), teamId, p, base, noise).maxBid
}

/**
 * Why each club is in or out on the open lot: a developer-facing breakdown (the Debug
 * page and `npm run auction -- 3 log` print it).
 */
export function explainLot(career: Career): (Evaluation & { team: string; text: string })[] {
  const m = career.mega
  const lot = m?.lot
  if (!m || !lot) return []
  const p = byId(career, lot.playerId)
  return evaluateLot(career, m, p).map((e) => {
    const team = teams.find((t) => t.id === e.teamId)
    const pers = personality(career, e.teamId)
    const text = [
      `Team: ${team?.name}${e.teamId === me(career) ? ' (you, captain)' : ''} · ${pers.style}`,
      `Player: ${p.name} (${p.role}${p.bowlingType ? `, ${p.bowlingType}` : ''}, overall ${e.quality}, worth ${e.marketValue} lakh)`,
      `Stage: ${e.stage} · purse ${m.purses[e.teamId]} lakh · squad ${squadOf(career.players, e.teamId).length}`,
      `Fills: ${e.fills.map((f) => `${CAPABILITY_LABEL[f.role]} ${f.share.toFixed(2)}`).join(', ') || 'nothing missing'} · fit ${e.fit.toFixed(2)}`,
      `Alternatives left: ${e.alternatives} · rivals needing the role: ${e.rivals}`,
      `Valuation ${e.valuation} · reserve ${e.reserve} · max bid ${e.maxBid} · joins at ${e.entryAt}`,
      `Decision: ${e.decision.toUpperCase()} · ${e.reason}`,
    ].join('\n  ')
    return { ...e, team: e.teamId, text }
  })
}

/** What the manager would pay while a sim bids for him: his max if shortlisted, else the captain's view. */
function myCeiling(career: Career, m: MegaState, p: CareerPlayer, captain: number): number {
  const max = m.shortlist[p.id]
  if (max === undefined) return m.autoBid ? captain : 0
  const squad = squadOf(career.players, me(career))
  if (squad.length >= SQUAD_MAX) return 0
  if (p.overseas && squad.filter((q) => q.overseas).length >= SQUAD_OVERSEAS_MAX) return 0
  const spendable = (m.purses[me(career)] ?? 0) - reserveFor(squad.length)
  const limit = Math.floor(Math.min(max, spendable) / 5) * 5
  return limit >= (m.accelerated ? 20 : basePrice(p)) ? limit : 0
}

/** A starting max for a shortlisted player: a little over his market value. */
export const defaultMax = (p: CareerPlayer) =>
  Math.max(basePrice(p), Math.ceil((askingSalary(p) * 1.25) / 5) * 5)

function openLot(career: Career): Career {
  const m = career.mega
  if (!m || m.stage !== 'auction' || m.lot) return career
  const id = m.sets[m.setIndex]?.ids[m.lotIndex]
  if (!id) return career
  const p = byId(career, id)
  const evals = evaluateLot(career, m, p)
  const ceilings: Record<string, number> = {}
  const entry: Record<string, number> = {}
  for (const e of evals) {
    ceilings[e.teamId] = e.teamId === me(career) ? myCeiling(career, m, p, e.maxBid) : e.maxBid
    entry[e.teamId] = e.entryAt
  }
  const base = m.accelerated ? 20 : basePrice(p)
  return withMega(career, {
    ...m,
    lot: {
      playerId: id,
      base,
      bid: base,
      bidderId: null,
      out: false,
      ceilings,
      entry,
      trail: [],
      step: 0,
    },
  })
}

/** Why the manager cannot bid on the open lot right now, or null. */
export function userBidBlocker(career: Career, amount?: number): string | null {
  const m = career.mega
  const lot = m?.lot
  if (!m || !lot) return 'No lot is open.'
  if (lot.out) return 'You have dropped out of this lot.'
  if (lot.bidderId === me(career)) return 'You already hold the bid.'
  const squad = squadOf(career.players, me(career))
  const p = byId(career, lot.playerId)
  if (squad.length >= SQUAD_MAX) return `Your squad is full (${SQUAD_MAX}).`
  if (p.overseas && squad.filter((q) => q.overseas).length >= SQUAD_OVERSEAS_MAX)
    return `You already have ${SQUAD_OVERSEAS_MAX} overseas players.`
  const bid = amount ?? nextBid(lot)
  const purse = m.purses[me(career)] ?? 0
  if (bid > purse - reserveFor(squad.length))
    return purse >= bid
      ? `You must keep enough to fill your squad to ${SQUAD_MIN}.`
      : 'Not enough money left.'
  return null
}

/**
 * One club raises the bid. Clubs bid only up to their own limit for this player, set when
 * the lot opened from their squad, purse and the pool (never because someone else is
 * bidding). Patient clubs wait until the price reaches their entry point, unless nobody
 * else will go on. Keener characters and clubs with more room under their limit are more
 * likely to make the running. Returns null if nobody wants to go higher.
 */
function rivalStep(career: Career, lot: Lot, auto: boolean): Lot | null {
  const m = career.mega as MegaState
  const nb = nextBid(lot)
  const able = TEAM_IDS.filter(
    (t) => t !== lot.bidderId && (t !== me(career) || auto) && (lot.ceilings[t] ?? 0) >= nb,
  )
  if (!able.length) return null
  const entryOf = (t: string) => lot.entry?.[t] ?? lot.base
  const ready = able.filter((t) =>
    lot.bidderId === null ? entryOf(t) <= lot.base : nb >= entryOf(t),
  )
  const candidates = ready.length ? ready : able
  const rng = createRng(deriveSeed(career.seed, 'mega-step', m.year, lot.playerId, lot.step))
  const teamId = pickWeighted(
    rng,
    candidates.map((t) => {
      const ceiling = lot.ceilings[t] as number
      const room = (ceiling - nb) / Math.max(1, ceiling)
      return [t, personality(career, t).eagerness * (0.25 + room)] as const
    }),
  )
  return {
    ...lot,
    bid: nb,
    bidderId: teamId,
    step: lot.step + 1,
    trail: [...lot.trail, { teamId, bid: nb }].slice(-5),
  }
}

/** The hammer falls: the player goes to the standing bidder, or stays unsold. */
function settle(career: Career): Career {
  const m = career.mega
  const lot = m?.lot
  if (!m || !lot) return career
  let c = career
  const p = byId(career, lot.playerId)
  let next: MegaState = { ...m, lot: null, lotIndex: m.lotIndex + 1 }
  if (lot.bidderId) {
    const team = lot.bidderId
    c = {
      ...career,
      players: career.players.map((x) =>
        x.id === p.id
          ? {
              ...x,
              teamId: team,
              contract: { salary: lot.bid, years: preferredYears(p.age) },
              morale: Math.max(x.morale, 70),
            }
          : x,
      ),
    }
    next = {
      ...next,
      purses: { ...m.purses, [team]: (m.purses[team] ?? 0) - lot.bid },
      sold: [...m.sold, { playerId: p.id, teamId: team, price: lot.bid }],
      last: { playerId: p.id, teamId: team, price: lot.bid },
    }
    if (team === me(career)) {
      c = addNews(c, {
        kind: 'transfer',
        teamIds: [team],
        playerId: p.id,
        text: `You win ${p.name} at the auction for ${lot.bid} lakh.`,
      })
    }
  } else {
    next = {
      ...next,
      unsold: [...m.unsold, p.id],
      last: { playerId: p.id, teamId: null, price: 0 },
    }
  }
  // Next set, then the accelerated round for the unsold, then done.
  if (next.lotIndex >= (next.sets[next.setIndex]?.ids.length ?? 0)) {
    next = { ...next, setIndex: next.setIndex + 1, lotIndex: 0 }
  }
  if (next.setIndex >= next.sets.length) {
    next =
      !next.accelerated && next.unsold.length
        ? {
            ...next,
            accelerated: true,
            sets: [
              ...next.sets,
              { kind: 'accelerated', label: KIND_LABEL.accelerated, ids: next.unsold },
            ],
            unsold: [],
          }
        : { ...next, stage: 'done' }
  }
  return withMega(c, next)
}

/** Rivals bid among themselves until nobody goes higher, then the hammer falls. */
function resolve(career: Career, auto: boolean): Career {
  let c = career
  for (let guard = 0; guard < 500; guard++) {
    const m = c.mega
    const lot = m?.lot
    if (!m || !lot) return c
    const raised = rivalStep(c, lot, auto && !lot.out)
    if (!raised) return settle(c)
    c = withMega(c, { ...m, lot: raised })
  }
  return settle(c)
}

// --- The manager's moves -------------------------------------------------------------------

/** Put the next lot on the block. */
export const nextLot = (career: Career): Career => openLot(career)

/** Raise the bid; a rival may answer. */
export function userBid(career: Career): Career {
  const m = career.mega
  if (!m?.lot || userBidBlocker(career)) return career
  const lot = m.lot
  const bid = nextBid(lot)
  const mine: Lot = {
    ...lot,
    bid,
    bidderId: me(career),
    trail: [...lot.trail, { teamId: me(career), bid }].slice(-5),
  }
  const answer = rivalStep(career, mine, false)
  const c = withMega(career, { ...m, lot: answer ?? mine })
  return answer ? c : settle(c)
}

/** Keep raising, answering every rival, up to a limit. */
export function userBidUpTo(career: Career, limit: number): Career {
  let c = career
  for (let guard = 0; guard < 500; guard++) {
    const lot = c.mega?.lot
    if (!lot || lot.bidderId === me(c)) return c
    const bid = nextBid(lot)
    if (bid > limit || userBidBlocker(c, bid)) return c
    c = userBid(c)
  }
  return c
}

/** Let the rivals take a turn. */
export function userWatch(career: Career): Career {
  const m = career.mega
  const lot = m?.lot
  if (!m || !lot) return career
  const raised = rivalStep(career, lot, false)
  return raised ? withMega(career, { ...m, lot: raised }) : settle(career)
}

// The live auction room: the screen runs the clock, and calls these one move at a time.

/** The manager raises the bid. Nobody answers yet: the rivals get their turn next. */
export function placeBid(career: Career): Career {
  const m = career.mega
  if (!m?.lot || userBidBlocker(career)) return career
  const lot = m.lot
  const bid = nextBid(lot)
  return withMega(career, {
    ...m,
    lot: {
      ...lot,
      bid,
      bidderId: me(career),
      trail: [...lot.trail, { teamId: me(career), bid }].slice(-5),
    },
  })
}

/** One rival raises, if any will. `raised` is false when nobody wants to go higher. */
export function rivalRaise(career: Career): { career: Career; raised: boolean } {
  const m = career.mega
  const lot = m?.lot
  if (!m || !lot) return { career, raised: false }
  const next = rivalStep(career, lot, false)
  return next
    ? { career: withMega(career, { ...m, lot: next }), raised: true }
    : { career, raised: false }
}

/** Going, going, gone: the standing bid wins (or the player is unsold). */
export const hammer = (career: Career): Career => settle(career)

/** Drop out of the lot; the rivals finish it. */
export function userPass(career: Career): Career {
  const m = career.mega
  if (!m?.lot) return career
  if (m.lot.bidderId === me(career)) return career
  return resolve(withMega(career, { ...m, lot: { ...m.lot, out: true } }), false)
}

/** Add a player to the shortlist (with a max), change his max, or take him off (null). */
export function setShortlist(career: Career, playerId: string, max: number | null): Career {
  const m = career.mega
  if (!m) return career
  const { [playerId]: _gone, ...rest } = m.shortlist
  void _gone
  const shortlist =
    max === null ? rest : { ...rest, [playerId]: Math.max(20, Math.round(max / 5) * 5) }
  return withMega(career, { ...m, shortlist })
}

export function setAutoBid(career: Career, on: boolean): Career {
  return career.mega ? withMega(career, { ...career.mega, autoBid: on }) : career
}

export function setStopForShortlist(career: Career, on: boolean): Career {
  return career.mega ? withMega(career, { ...career.mega, stopForShortlist: on }) : career
}

// --- Simming ---------------------------------------------------------------------------

export interface SimResult {
  career: Career
  /** Lots settled by this call. */
  lots: number
  /** What the manager's club won meanwhile. */
  bought: string[]
  /** Shortlisted players who went to another club (or nobody) meanwhile. */
  missed: string[]
  /** The dearest sale of the stretch. */
  biggest: { name: string; teamId: string; price: number } | null
  /** Where the sim stopped: the set on the block, and why. */
  at: string
  stopped: 'target' | 'set' | 'done' | 'lot'
}

/**
 * Sim on from here. With `toSet`, stop at the start of that set; otherwise just finish the
 * open lot. While simming, the manager's club bids for his shortlist up to each max, and
 * (if the captain is on) for players his squad needs. If he asked for it, sims stop when a
 * shortlisted player comes up so he can bid himself.
 */
export function simAuction(career: Career, toSet?: number | 'end'): SimResult {
  let c = career
  let lots = 0
  const before = new Set((career.mega?.sold ?? []).map((s) => s.playerId))
  const unsoldBefore = new Set(career.mega?.unsold ?? [])
  const result = (stopped: SimResult['stopped']): SimResult => {
    const m = c.mega
    const fresh = (m?.sold ?? []).filter((s) => !before.has(s.playerId))
    const top = [...fresh].sort((a, b) => b.price - a.price)[0]
    const shortlisted = Object.keys(m?.shortlist ?? {})
    return {
      career: c,
      lots,
      stopped,
      at: m?.stage === 'auction' ? (m.sets[m.setIndex]?.label ?? '') : 'The end',
      bought: fresh.filter((s) => s.teamId === me(c)).map((s) => byId(c, s.playerId).name),
      missed: shortlisted
        .filter(
          (id) =>
            fresh.some((s) => s.playerId === id && s.teamId !== me(c)) ||
            ((m?.unsold ?? []).includes(id) && !unsoldBefore.has(id)),
        )
        .map((id) => byId(c, id).name),
      biggest: top
        ? { name: byId(c, top.playerId).name, teamId: top.teamId, price: top.price }
        : null,
    }
  }
  if (c.mega?.lot) {
    c = resolve(c, true)
    lots++
    if (toSet === undefined) return result('lot')
  } else if (toSet === undefined) {
    c = resolve(openLot(c), true)
    lots++
    return result('lot')
  }
  for (let guard = 0; guard < 1000; guard++) {
    const m = c.mega
    if (!m || m.stage !== 'auction') return result('done')
    if (toSet !== 'end' && toSet !== undefined && m.setIndex >= toSet) return result('set')
    const id = upNext(m)
    if (!id) return result('done')
    c = openLot(c)
    if (m.stopForShortlist && m.shortlist[id] !== undefined) return result('target')
    c = resolve(c, true)
    lots++
  }
  return result('done')
}

/** Everything for the manager: sensible retentions, the captain bids, to the end. */
export function autoAuction(career: Career): Career {
  let c = career
  if (c.mega?.stage === 'retention') c = confirmRetention(c, suggestRetention(c))
  if (c.mega?.stage === 'auction')
    c = simAuction(setStopForShortlist(setAutoBid(c, true), false), 'end').career
  return c
}

// --- The end -------------------------------------------------------------------------------

/**
 * Bring a club up to the squad minimum (and a keeper) from the unsigned, at asking price,
 * ignoring the purse if it has to: the league insists on a full squad.
 */
export function fillSquad(career: Career, teamId: string): Career {
  let players = career.players
  const purse = career.mega?.purses[teamId] ?? 0
  const squad = () => players.filter((p) => p.teamId === teamId)
  for (let guard = 0; guard < SQUAD_MAX; guard++) {
    const s = squad()
    const needKeeper = !s.some((p) => p.role === 'wicketkeeper')
    if (s.length >= SQUAD_MIN && !needKeeper) break
    const overseasFull = s.filter((p) => p.overseas).length >= SQUAD_OVERSEAS_MAX
    const pool = freeAgents(players).filter(
      (p) => (!needKeeper || p.role === 'wicketkeeper') && !(overseasFull && p.overseas),
    )
    const affordable = pool.filter((p) => askingSalary(p) <= purse)
    const pick = (affordable.length ? affordable : pool).sort((a, b) =>
      affordable.length ? overallRating(b) - overallRating(a) : askingSalary(a) - askingSalary(b),
    )[0]
    if (!pick) break
    players = players.map((x) =>
      x.id === pick.id
        ? { ...x, teamId, contract: { salary: askingSalary(x), years: preferredYears(x.age) } }
        : x,
    )
  }
  return players === career.players ? career : { ...career, players }
}
