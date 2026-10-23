import type { CareerPlayer } from './career'
import { askingSalary, SQUAD_MAX, SQUAD_MIN, SQUAD_OVERSEAS_MAX } from './market'
import { pitchFor } from './match/selection'
import { overallRating } from './player'
import { createRng, deriveSeed, shuffle } from './rng'

/*
 * The CPU clubs' auction brain. Tactical roles are derived from what the game really
 * stores about a player: role, pace or spin, batting/bowling/fielding ratings, age,
 * potential and skills (traits). There is no batting-position data, so "top order" and
 * "finisher" come from skills and ratings.
 */

export type Capability =
  'keeper' | 'top' | 'finisher' | 'allround' | 'pace' | 'spin' | 'death' | 'newball'

export const CAPABILITIES: Capability[] = [
  'keeper',
  'top',
  'finisher',
  'allround',
  'pace',
  'spin',
  'death',
  'newball',
]

export const CAPABILITY_LABEL: Record<Capability, string> = {
  keeper: 'wicketkeeper',
  top: 'top-order batter',
  finisher: 'finisher',
  allround: 'all-rounder',
  pace: 'fast bowler',
  spin: 'spinner',
  death: 'death bowler',
  newball: 'new-ball bowler',
}

const has = (p: CareerPlayer, t: string) => (p.traits as string[]).includes(t)

/** How well a player fills each tactical role, 0 to 1 (roles he cannot fill are left out). */
export function capabilities(p: CareerPlayer): Partial<Record<Capability, number>> {
  const out: Partial<Record<Capability, number>> = {}
  const { batting, bowling } = p.ratings
  const bats = p.role === 'batter' || p.role === 'wicketkeeper'
  const pace = p.bowlingType === 'pace' && (p.role === 'bowler' || p.role === 'allrounder')
  const spin = p.bowlingType === 'spin' && (p.role === 'bowler' || p.role === 'allrounder')
  if (p.role === 'wicketkeeper') out.keeper = 1
  if (bats) {
    const lowerOrder = (has(p, 'finisher') || has(p, 'big-hitter')) && !has(p, 'anchor')
    out.top = has(p, 'anchor') || has(p, 'powerplay-hitter') ? 1 : lowerOrder ? 0.4 : 0.9
  } else if (p.role === 'allrounder' && batting >= bowling && batting >= 60) out.top = 0.5
  if (has(p, 'finisher')) out.finisher = 1
  else if (has(p, 'big-hitter')) out.finisher = 0.8
  else if (p.role === 'allrounder' && batting >= 55) out.finisher = 0.6
  else if (bats && batting >= 65) out.finisher = 0.3
  if (p.role === 'allrounder') out.allround = 1
  else if (p.role === 'bowler' && batting >= 45) out.allround = 0.3
  const bowlShare = p.role === 'bowler' ? 1 : Math.min(1, bowling / 70)
  if (pace) out.pace = bowlShare
  if (spin) out.spin = bowlShare
  if (has(p, 'death-bowler') || has(p, 'yorker-specialist')) out.death = 1
  else if (pace && bowling >= 72) out.death = 0.5
  else if (has(p, 'bouncer-specialist')) out.death = 0.3
  if (has(p, 'powerplay-specialist') || has(p, 'swing-bowler')) out.newball = 1
  else if (pace && p.role === 'bowler') out.newball = 0.4
  return out
}

/** The rating that matters for a role. */
export function skillFor(p: CareerPlayer, c: Capability): number {
  const { batting, bowling, fielding } = p.ratings
  switch (c) {
    case 'keeper':
      return 0.8 * batting + 0.2 * fielding
    case 'top':
    case 'finisher':
      return batting
    case 'allround':
      return (
        0.45 * Math.max(batting, bowling) + 0.4 * Math.min(batting, bowling) + 0.15 * fielding + 4
      )
    default:
      return bowling
  }
}

// --- Personalities --------------------------------------------------------------------------

export type Style = 'aggressive' | 'conservative' | 'balanced' | 'star' | 'talent' | 'specialist'

export interface Personality {
  style: Style
  /** How far over a player's market value the club will go for a real need. */
  premium: number
  /** Share of the purse the club will put into one player. */
  maxShare: number
  /** 0 = bids from the base price; higher = waits for the price to develop. */
  patience: number
  /** Squad size the club plans for (within the league's 18–25). */
  squadTarget: number
  /** How keen it is to make the running in a contest (who raises first). */
  eagerness: number
}

const STYLES: Record<Style, Omit<Personality, 'style'>> = {
  aggressive: { premium: 1.22, maxShare: 0.34, patience: 0, squadTarget: 22, eagerness: 1.5 },
  conservative: { premium: 0.95, maxShare: 0.22, patience: 0.4, squadTarget: 21, eagerness: 0.7 },
  balanced: { premium: 1.08, maxShare: 0.27, patience: 0.15, squadTarget: 22, eagerness: 1 },
  star: { premium: 1.12, maxShare: 0.32, patience: 0.1, squadTarget: 21, eagerness: 1.2 },
  talent: { premium: 1.05, maxShare: 0.25, patience: 0.25, squadTarget: 23, eagerness: 0.9 },
  specialist: { premium: 1.1, maxShare: 0.28, patience: 0.2, squadTarget: 22, eagerness: 1 },
}

export const STYLE_ORDER: Style[] = [
  'aggressive',
  'conservative',
  'balanced',
  'star',
  'talent',
  'specialist',
]

/** A club's character for this career: styles are dealt so every style appears. */
export function personalityOf(seed: number, teamIds: string[], teamId: string): Personality {
  const rng = createRng(deriveSeed(seed, 'auction-styles'))
  const deck = shuffle(rng, [...STYLE_ORDER, ...shuffle(rng, STYLE_ORDER)])
  const style = deck[Math.max(0, teamIds.indexOf(teamId)) % deck.length] as Style
  return { style, ...STYLES[style] }
}

// --- Squad plans and needs ------------------------------------------------------------------

/** How many of each role a squad wants, counting quality (a weak player covers less). */
export const PLAN: Record<Capability, number> = {
  keeper: 2,
  top: 4,
  finisher: 2,
  allround: 3,
  pace: 5,
  spin: 3,
  death: 2,
  newball: 2,
}

/** How much each role matters to the XI. */
const IMPORTANCE: Record<Capability, number> = {
  keeper: 1.3,
  top: 1,
  finisher: 0.9,
  allround: 0.9,
  pace: 1.1,
  spin: 1,
  death: 1,
  newball: 0.6,
}

/** 0.2 for a weak player up to 1.2 for a star: how much of a role he really covers. */
export const qualityWeight = (skill: number) => Math.max(0.2, Math.min(1.2, (skill - 45) / 25))

export interface Need {
  plan: number
  /** Quality-weighted cover now. */
  cover: number
  /** Players who really fill it (half a role or more). */
  count: number
  /** What is still missing (in quality-weighted players). */
  short: number
  /** Short, weighted by importance and the home pitch; the critical first keeper and spinner count double. */
  priority: number
}

export type Needs = Record<Capability, Need>

/** The home pitch shapes the plan: a spin-friendly ground wants another spinner, and so on. */
export function planFor(teamId: string): Record<Capability, number> {
  const pitch = pitchFor(teamId)
  return {
    ...PLAN,
    spin: PLAN.spin + (pitch.spin > 0.25 ? 1 : 0),
    pace: PLAN.pace + (pitch.pace > 0.25 ? 1 : 0),
  }
}

export function squadNeeds(squad: CareerPlayer[], plan: Record<Capability, number>): Needs {
  const out = {} as Needs
  for (const c of CAPABILITIES) {
    let cover = 0
    let count = 0
    for (const p of squad) {
      const s = capabilities(p)[c] ?? 0
      if (!s) continue
      cover += s * qualityWeight(skillFor(p, c))
      if (s >= 0.5) count++
    }
    const short = Math.max(0, plan[c] - cover)
    const critical = (c === 'keeper' || c === 'spin' || c === 'pace') && cover < 1 ? 2 : 1
    out[c] = {
      plan: plan[c],
      cover,
      count,
      short,
      priority: (short / plan[c]) * IMPORTANCE[c] * critical,
    }
  }
  return out
}

// --- What every club can see ----------------------------------------------------------------

export interface ClubView {
  teamId: string
  squad: CareerPlayer[]
  overseas: number
  purse: number
  needs: Needs
  personality: Personality
}

/** The public state of the auction at one lot: the clubs, and who is still to come. */
export interface AuctionView {
  clubs: Record<string, ClubView>
  /** Players still to be auctioned after this lot (the order is published). */
  pool: CareerPlayer[]
  /** Lots still to come, including this one. */
  lotsLeft: number
  /** Share of the auction done, 0–1. */
  progress: number
  accelerated: boolean
}

// --- Player evaluation ----------------------------------------------------------------------

export type Decision = 'bid' | 'wait' | 'skip'

export interface Evaluation {
  teamId: string
  playerId: string
  /** The roles he would fill here, with how much of each gap. */
  fills: { role: Capability; share: number }[]
  /** 0–1.4: how well he fits this squad's gaps. */
  fit: number
  quality: number
  /** How many comparable players are still to come for his main role. */
  alternatives: number
  /** Rival clubs that need his main role and can pay for it. */
  rivals: number
  /** Skill of the option the club could still expect to get later for his main role. */
  replacement: number
  marketValue: number
  valuation: number
  /** Money that must stay back for the rest of the squad. */
  reserve: number
  maxBid: number
  /** The price at which it joins the bidding (it waits below it). */
  entryAt: number
  stage: 'early' | 'middle' | 'late' | 'completion'
  decision: Decision
  reason: string
}

export const MIN_PRICE = 20

/** Where the club is in its own auction: driven by its open slots and what is left, not the clock alone. */
function stageFor(club: ClubView, view: AuctionView): Evaluation['stage'] {
  const mandatory = Math.max(0, SQUAD_MIN - club.squad.length)
  if (mandatory > 0 && view.lotsLeft <= mandatory * 8) return 'completion'
  if (view.progress < 0.25 && club.squad.length < 10) return 'early'
  if (view.progress < 0.65) return 'middle'
  return 'late'
}

/** Comparable players still to come: same role, within a few rating points. */
function alternativesFor(p: CareerPlayer, role: Capability, view: AuctionView): number {
  const skill = skillFor(p, role)
  return view.pool.filter(
    (q) => q.id !== p.id && (capabilities(q)[role] ?? 0) >= 0.5 && skillFor(q, role) >= skill - 4,
  ).length
}

/** Players per primary role in a full squad of 22, scaled to the club's planned size. */
const DEPTH: Record<Capability, number> = {
  keeper: 2,
  top: 5,
  finisher: 2,
  allround: 5,
  pace: 6,
  spin: 3,
  death: 0,
  newball: 0,
}

export function depthFor(squadTarget: number): Record<Capability, number> {
  const k = squadTarget / 22
  return Object.fromEntries(CAPABILITIES.map((c) => [c, Math.round(DEPTH[c] * k)])) as Record<
    Capability,
    number
  >
}

/** The role a player is picked for first. */
export function primaryRole(p: CareerPlayer): Capability {
  if (p.role === 'wicketkeeper') return 'keeper'
  if (p.role === 'allrounder') return 'allround'
  if (p.role === 'bowler') return p.bowlingType === 'spin' ? 'spin' : 'pace'
  return has(p, 'finisher') && !has(p, 'anchor') ? 'finisher' : 'top'
}

/**
 * The skill of the option a club can still expect for a role: the next best ones go to
 * the clubs that need the role too, so it is the one after them.
 */
function replacementSkill(role: Capability, rivals: number, view: AuctionView): number {
  const skills = view.pool
    .filter((q) => (capabilities(q)[role] ?? 0) >= 0.5)
    .map((q) => skillFor(q, role))
    .sort((a, b) => b - a)
  return skills[Math.min(skills.length - 1, rivals)] ?? 40
}

/** What a typical decent option for a role should cost, from who is left. */
function expectedPrice(role: Capability, view: AuctionView): number {
  const options = view.pool
    .filter((q) => (capabilities(q)[role] ?? 0) >= 0.5)
    .map((q) => askingSalary(q))
    .sort((a, b) => b - a)
    .slice(0, 6)
  if (!options.length) return MIN_PRICE
  return options[Math.floor(options.length / 2)] as number
}

/**
 * One club's view of one player: does he fill a real gap, how scarce is his role, who
 * else wants him, what can the club afford without wrecking the rest of its plan, and so
 * the most it will pay, the price at which it joins in, and the decision.
 */
export function evaluatePlayer(
  view: AuctionView,
  teamId: string,
  p: CareerPlayer,
  base: number,
  noise: number,
): Evaluation {
  const club = view.clubs[teamId] as ClubView
  const pers = club.personality
  const caps = capabilities(p)
  const marketValue = askingSalary(p)
  const quality = overallRating(p)
  const stage = stageFor(club, view)
  const result = (
    decision: Decision,
    reason: string,
    extra: Partial<Evaluation> = {},
  ): Evaluation => ({
    teamId,
    playerId: p.id,
    fills: [],
    fit: 0,
    quality,
    alternatives: 0,
    rivals: 0,
    replacement: 0,
    marketValue,
    valuation: 0,
    reserve: 0,
    maxBid: 0,
    entryAt: base,
    stage,
    decision,
    reason,
    ...extra,
  })

  // 1. Eligibility under the league's rules.
  if (club.squad.length >= SQUAD_MAX) return result('skip', 'Squad is full.')
  if (p.overseas && club.overseas >= SQUAD_OVERSEAS_MAX)
    return result('skip', 'Overseas places are all taken.')

  // 2. Fit: how much of a real gap he fills, role by role (cover beyond the plan is worth little).
  const fills: Evaluation['fills'] = []
  let useful = 0
  let possible = 0
  for (const c of CAPABILITIES) {
    const s = caps[c]
    if (!s) continue
    const n = club.needs[c]
    const adds = s * qualityWeight(skillFor(p, c))
    const fillsGap = Math.min(adds, n.short)
    // A clear upgrade on the current options still counts for something.
    const best = club.squad
      .filter((q) => (capabilities(q)[c] ?? 0) >= 0.5)
      .map((q) => skillFor(q, c))
      .sort((a, b) => b - a)
    const weakestStarter = best[Math.min(best.length, Math.ceil(n.plan / 2)) - 1] ?? 0
    const upgrade = n.short <= 0 && skillFor(p, c) >= weakestStarter + 6 ? adds * 0.45 : 0
    const imp = IMPORTANCE[c] * (n.priority > 0 ? 1 + n.priority : 1)
    useful += (fillsGap + upgrade + (adds - fillsGap - upgrade) * 0.15) * imp
    possible += adds * IMPORTANCE[c]
    if (fillsGap > 0.15 || upgrade > 0) fills.push({ role: c, share: fillsGap + upgrade })
  }
  fills.sort((a, b) => b.share - a.share)
  let fit = possible > 0 ? useful / possible : 0
  if (fills.length >= 2) fit += 0.12 // two real jobs in one player
  // Depth: past the XI plan, a full squad still wants backups in each primary role.
  const primary = primaryRole(p)
  const depthShort =
    depthFor(pers.squadTarget)[primary] -
    club.squad.filter((q) => primaryRole(q) === primary).length
  if (depthShort > 0 && club.squad.length < pers.squadTarget) {
    fit += 0.28 * Math.min(1, depthShort) * qualityWeight(skillFor(p, primary))
    if (!fills.length) fills.push({ role: primary, share: 0.5 })
  } else if (club.needs[primary].short <= 0) {
    // A third keeper or a seventh bowler rarely plays, whatever else he can do.
    fit *= 0.6
  }
  fit = Math.min(1.4, fit)
  const main = fills[0]?.role ?? (CAPABILITIES.find((c) => (caps[c] ?? 0) >= 0.5) as Capability)

  // 3. Scarcity and rival demand, from the published pool and the rivals' squads and purses.
  const alternatives = main ? alternativesFor(p, main, view) : 99
  const rivals = main
    ? Object.values(view.clubs).filter(
        (r) =>
          r.teamId !== teamId &&
          r.needs[main].short >= 0.5 &&
          r.purse - Math.max(0, SQUAD_MIN - r.squad.length - 1) * MIN_PRICE >= base &&
          r.squad.length < SQUAD_MAX,
      ).length
    : 0

  // 4. Valuation: market value shaped by fit, character, scarcity and competition.
  let valuation = marketValue * (0.3 + 0.85 * fit) * pers.premium
  if (pers.style === 'star' && quality >= 78) valuation *= 1.25
  if (pers.style === 'talent' && p.age <= 24 && p.potential - quality >= 5) valuation *= 1.25
  if (
    pers.style === 'specialist' &&
    fills.some((f) => f.role === 'death' || f.role === 'newball' || f.role === 'finisher')
  )
    valuation *= 1.18
  // Value over replacement: pay a premium only for how much better he is than the option
  // the club can realistically still get later (the rivals who need the role go first).
  const replacement = main ? replacementSkill(main, rivals, view) : 0
  const edge = main ? skillFor(p, main) - replacement : 0
  const scarcity = Math.max(0.45, Math.min(1.35, 0.5 + 0.1 * edge))
  valuation *= scarcity
  // Competition: more clubs chasing fewer players pushes the price up for those who must
  // have him; a careful club with options elsewhere lets the others fight.
  const pressure = rivals / (alternatives + 1)
  if (pressure > 1 && fit > 0.5)
    valuation *=
      pers.style === 'conservative' && alternatives >= 3 ? 0.92 : 1 + Math.min(0.2, 0.06 * pressure)
  // Squad already where it wants to be: only a real gap, and cheaply.
  if (club.squad.length >= pers.squadTarget) valuation *= 0.35
  // Late with gaps to fill: urgency.
  if (stage === 'completion' && fit > 0.2) valuation *= 1.25
  valuation *= 0.94 + noise * 0.12

  // 5. Budget feasibility: keep enough back to finish the squad and to fill the other big gaps.
  const left = Math.max(0, SQUAD_MIN - club.squad.length - 1)
  const planned = Math.max(left, pers.squadTarget - club.squad.length - 1)
  const otherGaps = CAPABILITIES.filter(
    (c) => club.needs[c].short >= 0.6 && !fills.some((f) => f.role === c),
  )
  const gapCost = otherGaps.reduce(
    (s, c) => s + expectedPrice(c, view) * Math.min(2, Math.round(club.needs[c].short)) * 0.6,
    0,
  )
  const reserve = Math.round(
    Math.max(
      left * MIN_PRICE,
      Math.min(gapCost, club.purse * 0.65) + Math.max(0, planned - otherGaps.length) * MIN_PRICE,
    ),
  )
  const spendable = club.purse - reserve
  // Money to spare per open place: unspent purse buys nothing, so a club with cash in hand
  // goes further for the places it still has (a little early on, more as places run out).
  if (fit >= 0.18) {
    const perSlot = spendable / Math.max(1, planned + 1)
    const cap = stage === 'late' || stage === 'completion' ? 1.6 : 1.25
    valuation *= Math.max(1, Math.min(cap, perSlot / Math.max(MIN_PRICE * 2, marketValue)))
  }
  const share = stage === 'early' ? pers.maxShare : stage === 'middle' ? pers.maxShare + 0.08 : 0.6
  const maxBid = Math.floor(Math.min(valuation, spendable, club.purse * share) / 5) * 5
  const extra = {
    fills,
    fit,
    alternatives,
    rivals,
    replacement: Math.round(replacement),
    valuation: Math.round(valuation),
    reserve,
  }

  // 6. The decision.
  const why = (s: string) =>
    `${s} Fit ${fit.toFixed(2)}${main ? ` as ${CAPABILITY_LABEL[main]}` : ''}, ${alternatives} alternatives left, ${rivals} rival${rivals === 1 ? '' : 's'} need the role.`
  if (spendable < base)
    return result('skip', why('Cannot afford him and still finish the squad.'), extra)
  if (fit < 0.18 && stage !== 'completion')
    return result('skip', why('Role already covered; no real gap to fill.'), extra)
  if (
    club.squad.length >= pers.squadTarget &&
    (fills.length === 0 || club.squad.length >= pers.squadTarget + 2)
  )
    return result(
      'skip',
      why(`Squad is at the planned ${pers.squadTarget}; no need for more.`),
      extra,
    )
  if (maxBid < base) return result('skip', why('Not worth his base price to this squad.'), extra)
  // Patience: wait for the price to develop when there are options; go early for a scarce need.
  const wait = edge >= 6 || alternatives <= 2 || stage === 'completion' ? 0 : pers.patience
  const entryAt = Math.max(base, Math.floor((base + (maxBid - base) * wait) / 5) * 5)
  const decision: Decision = entryAt > base ? 'wait' : 'bid'
  const reason =
    decision === 'wait'
      ? why(`Interested, but will let the price develop first.`)
      : fills.length
        ? why(`Fills a real gap${scarcity > 1 ? ' with few like him left' : ''}.`)
        : why('Clear upgrade on the current options.')
  return result(decision, reason, { ...extra, maxBid, entryAt })
}
