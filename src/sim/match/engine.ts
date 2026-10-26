import { createRng, deriveSeed, pickWeighted, type Rng } from '../rng'
import { pickDelivery, type Delivery } from './delivery'
import {
  ballOdds,
  bowlerPenalty,
  dismissalWeights,
  dropChance,
  misfieldChance,
  MODEL,
  wideFactor,
  type BallContext,
  type Odds,
} from './model'
import {
  aiBowlingTactics,
  batterIntent,
  chooseBowler,
  MAX_OVERS_PER_BOWLER,
  spellLength,
} from './tactics'
import {
  AGGRESSION,
  bowlIntentValue,
  phaseOf,
  type BallEvent,
  type BowlingDelivery,
  type DismissalKind,
  type InningsState,
  type MatchPlayer,
  type MatchResult,
  type MatchState,
  type PendingReview,
  type ReviewFeel,
  type Pitch,
  type ShotKind,
  type TeamSheet,
} from './types'

/*
 * Ball-by-ball engine. State is a plain object mutated in place by `simBall` (fast enough
 * for 10,000-match calibration runs); everything else is built on `simBall`. The same
 * seed and the same inputs always produce the same match.
 *
 * A ball is decided, then applied. In between, a manager who is watching may review the
 * umpire's call (DRS): the ball waits in `state.pendingReview` until `resolveReview`.
 */

const MAX_SUPER_OVERS = 10
/** DRS reviews per side per innings (IPL: two; one in a super over). */
export const REVIEWS_PER_INNINGS = 2
/** Rating points of refocus after a strategic timeout, and for how many legal balls. */
export const TIMEOUT_BOOST = 2
export const TIMEOUT_BALLS = 12
/** Strategic timeout windows (0-based over about to start): bowling side 6–9, batting 13–16. */
export const TIMEOUT_WINDOWS = { bowling: [5, 8], batting: [12, 15] } as const

export interface MatchSetup {
  seed: number
  players: MatchPlayer[]
  /** Home side first. */
  sheets: [TeamSheet, TeamSheet]
  pitch: Pitch
}

export interface Match {
  state: MatchState
  rng: Rng
}

/** The captain's call at the toss: dew favours chasing, so most sides field. */
export function aiTossDecision(dew: number, r: number): 'bat' | 'field' {
  return r < 0.55 + 0.45 * dew ? 'field' : 'bat'
}

export function createMatch(setup: MatchSetup): Match {
  const tossRng = createRng(deriveSeed(setup.seed, 'toss'))
  const [home, away] = setup.sheets
  const winner = tossRng() < 0.5 ? home : away
  // Night matches: about half bring heavy dew in the second innings.
  const dew = tossRng() < 0.5 ? 0.5 + 0.5 * tossRng() : 0.35 * tossRng()
  const decision = aiTossDecision(dew, tossRng())
  const state: MatchState = {
    seed: setup.seed,
    pitch: setup.pitch,
    players: Object.fromEntries(setup.players.map((p) => [p.id, p])),
    sheets: { [home.teamId]: home, [away.teamId]: away },
    order: [home.teamId, away.teamId],
    toss: { winnerId: winner.teamId, decision, pending: !winner.ai },
    innings: [],
    result: null,
    conditions: { dew: Number(dew.toFixed(2)) },
    pendingReview: null,
    timeouts: {},
  }
  applyToss(state, decision, !state.toss.pending)
  return { state, rng: createRng(deriveSeed(setup.seed, 'balls')) }
}

/**
 * Set the batting order from the toss. `final`: the call is made, so AI captains name
 * their XI for it (as IPL sides do after the toss).
 */
function applyToss(state: MatchState, decision: 'bat' | 'field', final: boolean) {
  const winner = state.toss.winnerId
  const loser = Object.keys(state.sheets).find((id) => id !== winner) as string
  state.toss.decision = decision
  state.order = decision === 'bat' ? [winner, loser] : [loser, winner]
  if (final) for (const id of state.order) if (sheetOf(state, id).ai) selectAfterToss(state, id)
  state.innings = []
  startInnings(state, state.order[0], state.order[1], 20, allOutAt(state, state.order[0]), null)
}

/**
 * An AI captain's XI for the toss: batting first, an extra batter in for the weakest
 * batter (a bowler comes back as the Impact Player at the break); bowling first, an
 * extra bowler in for the weakest bowler (a batter comes on for the chase). The player
 * left out joins the substitutes.
 */
function selectAfterToss(state: MatchState, teamId: string) {
  const sheet = sheetOf(state, teamId)
  const impact = sheet.impact
  if (!impact?.subs.length) return
  const skill = teamId === state.order[0] ? 'batting' : 'bowling'
  const rating = (id: string) => state.players[id]?.[skill] ?? 0
  const overseas = (id: string) => state.players[id]?.overseas ?? false
  const inId = [...impact.subs].sort((a, b) => rating(b) - rating(a))[0]
  const outId = sheet.battingOrder
    .filter((id) => id !== sheet.keeperId)
    .sort((a, b) => rating(a) - rating(b))[0]
  if (!inId || !outId || rating(inId) < rating(outId) + 8) return
  const count = sheet.battingOrder.filter((id) => id !== outId && overseas(id)).length
  if (overseas(inId) && count >= 4) return
  const order = sheet.battingOrder.filter((id) => id !== outId)
  const bat = (id: string) => state.players[id]?.batting ?? 0
  let at = order.findIndex((id, i) => i >= 2 && bat(id) < bat(inId))
  if (at < 0) at = order.length
  order.splice(at, 0, inId)
  sheet.battingOrder = order
  sheet.impact = { ...impact, subs: impact.subs.map((id) => (id === inId ? outId : id)) }
}

/** The manager's call after winning the toss (before the first ball only). */
export function decideToss(state: MatchState, decision: 'bat' | 'field'): boolean {
  const first = state.innings[0]
  if (!state.toss.pending || !first || first.events.length > 0) return false
  state.toss.pending = false
  applyToss(state, decision, true)
  return true
}

/** Between overs: no ball of the next over has been bowled yet (wides included). */
export function atOverBreak(inn: InningsState): boolean {
  const over = Math.floor(inn.legalBalls / 6)
  return !inn.complete && inn.legalBalls % 6 === 0 && inn.events.at(-1)?.over !== over
}

function sheetOf(state: MatchState, teamId: string): TeamSheet {
  const s = state.sheets[teamId]
  if (!s) throw new Error(`No team sheet for ${teamId}`)
  return s
}

/** True when the AI makes this side's calls (an AI side, or nobody is watching). */
export function aiDecides(state: MatchState, teamId: string): boolean {
  return sheetOf(state, teamId).ai || !state.interactive
}

function startInnings(
  state: MatchState,
  battingTeamId: string,
  bowlingTeamId: string,
  maxOvers: number,
  maxWickets: number,
  target: number | null,
  order?: string[],
) {
  const batters = order ?? sheetOf(state, battingTeamId).battingOrder
  const [striker, nonStriker, ...toCome] = batters
  if (!striker || !nonStriker) throw new Error('Need at least two batters')
  const reviews = maxOvers === 1 ? 1 : REVIEWS_PER_INNINGS
  state.innings.push({
    index: state.innings.length,
    battingTeamId,
    bowlingTeamId,
    maxOvers,
    maxWickets,
    target,
    runs: 0,
    wickets: 0,
    legalBalls: 0,
    extras: 0,
    strikerId: striker,
    nonStrikerId: nonStriker,
    toCome,
    bowlerId: null,
    lastOverBowlerId: null,
    freeHitNext: false,
    batting: {},
    bowling: {},
    battedOrder: [striker, nonStriker],
    events: [],
    complete: false,
    reviews: { [battingTeamId]: reviews, [bowlingTeamId]: reviews },
  })
}

/** All out at 10 wickets, or one fewer than the number of batters in a short side. */
function allOutAt(state: MatchState, teamId: string): number {
  return Math.max(1, Math.min(10, sheetOf(state, teamId).battingOrder.length - 1))
}

export function currentInnings(state: MatchState): InningsState {
  const inn = state.innings[state.innings.length - 1]
  if (!inn) throw new Error('Match has no innings')
  return inn
}

const isOver = (state: MatchState) => state.result !== null

/** Start the next innings (or super over), or settle the result. */
function nextStage(state: MatchState) {
  const n = state.innings.length
  const last = currentInnings(state)
  if (n === 1) {
    // The innings break is when most sides bring on their Impact Player.
    for (const id of state.order) if (aiDecides(state, id)) applySuggestedImpact(state, id)
    startInnings(
      state,
      state.order[1],
      state.order[0],
      20,
      allOutAt(state, state.order[1]),
      last.runs + 1,
    )
    return
  }
  if (n % 2 === 0) {
    const first = state.innings[n - 2] as InningsState
    const second = last
    if (second.runs > first.runs) {
      const left = second.maxWickets - second.wickets
      state.result =
        n === 2
          ? {
              winnerId: second.battingTeamId,
              kind: 'wickets',
              margin: `won by ${left} wicket${left === 1 ? '' : 's'}`,
            }
          : { winnerId: second.battingTeamId, kind: 'superOver', margin: 'won the super over' }
      return
    }
    if (second.runs < first.runs) {
      const by = first.runs - second.runs
      state.result =
        n === 2
          ? {
              winnerId: first.battingTeamId,
              kind: 'runs',
              margin: `won by ${by} run${by === 1 ? '' : 's'}`,
            }
          : { winnerId: first.battingTeamId, kind: 'superOver', margin: 'won the super over' }
      return
    }
    // Tie: super over. The side that batted second in the tied stage bats first.
    if ((n - 2) / 2 >= MAX_SUPER_OVERS) {
      state.result = { winnerId: null, kind: 'tie', margin: 'match tied' }
      return
    }
    const bat = second.battingTeamId
    const bowl = second.bowlingTeamId
    startInnings(state, bat, bowl, 1, 2, null, superOverBatters(state, bat))
    return
  }
  // First half of a super over is done: the other side chases.
  startInnings(
    state,
    last.bowlingTeamId,
    last.battingTeamId,
    1,
    2,
    last.runs + 1,
    superOverBatters(state, last.bowlingTeamId),
  )
}

/** Three best batters by rating for a super over. */
function superOverBatters(state: MatchState, teamId: string): string[] {
  return [...sheetOf(state, teamId).battingOrder]
    .sort((a, b) => (state.players[b]?.batting ?? 0) - (state.players[a]?.batting ?? 0))
    .slice(0, 3)
}

// --- Impact Player -------------------------------------------------------------------

/**
 * Why `inId` cannot replace `outId` right now, or null if he can. The swap happens at an
 * over break or the innings break, once per match, and the keeper and the batters at the
 * crease cannot go off. The XI may still hold at most four overseas players.
 */
export function impactBlocker(
  state: MatchState,
  teamId: string,
  outId: string,
  inId: string,
): string | null {
  const sheet = sheetOf(state, teamId)
  const impact = sheet.impact
  if (isOver(state)) return 'The match is over.'
  if (!impact) return 'No substitutes named.'
  if (impact.used) return 'Impact Player already used.'
  if (!impact.subs.includes(inId)) return 'Not one of the named substitutes.'
  if (!sheet.battingOrder.includes(outId)) return 'That player is not in the XI.'
  if (outId === sheet.keeperId) return 'The keeper cannot be replaced.'
  const inn = currentInnings(state)
  if (inn.maxOvers === 1) return 'Not in a super over.'
  if (state.pendingReview || (!inn.complete && !atOverBreak(inn))) return 'Only between overs.'
  const batting = !inn.complete && inn.battingTeamId === teamId
  if (batting && (outId === inn.strikerId || outId === inn.nonStrikerId))
    return 'Batters at the crease cannot go off.'
  const overseas = (id: string) => state.players[id]?.overseas ?? false
  const count = sheet.battingOrder.filter((id) => id !== outId && overseas(id)).length
  if (overseas(inId) && count >= 4) return 'Only four overseas players in the XI.'
  return null
}

/** Bring on the Impact Player. Returns an error, or null when done. */
export function makeImpactSub(
  state: MatchState,
  teamId: string,
  outId: string,
  inId: string,
): string | null {
  const blocked = impactBlocker(state, teamId, outId, inId)
  if (blocked) return blocked
  const sheet = sheetOf(state, teamId)
  const inn = currentInnings(state)
  sheet.battingOrder = sheet.battingOrder.map((id) => (id === outId ? inId : id))
  // At the break, a batter coming in for the chase bats where his rating puts him (not
  // above the openers).
  if (inn.complete && inn.index === 0 && teamId === state.order[1]) {
    const bat = (id: string) => state.players[id]?.batting ?? 0
    const order = sheet.battingOrder.filter((id) => id !== inId)
    let at = order.findIndex((id, i) => i >= 2 && bat(id) < bat(inId))
    if (at < 0) at = order.length
    order.splice(at, 0, inId)
    sheet.battingOrder = order
  }
  // Still to bat in this innings: the substitute takes his place in the order.
  if (!inn.complete && inn.battingTeamId === teamId)
    inn.toCome = inn.toCome.map((id) => (id === outId ? inId : id))
  sheet.impact = {
    subs: sheet.impact?.subs ?? [],
    used: {
      outId,
      inId,
      innings: inn.complete ? inn.index + 1 : inn.index,
      over: inn.legalBalls / 6,
    },
  }
  return null
}

/**
 * The captain's Impact Player call at the innings break: the side about to bowl swaps a
 * batter for a bowler, the side about to chase swaps a bowler for a batter, when the
 * substitute is clearly better at the job. Null when there is no worthwhile swap.
 */
export function suggestImpact(
  state: MatchState,
  teamId: string,
): { outId: string; inId: string } | null {
  const sheet = sheetOf(state, teamId)
  if (!sheet.impact || sheet.impact.used || !sheet.impact.subs.length) return null
  const skill = teamId === state.order[0] ? 'bowling' : 'batting'
  const rating = (id: string) => state.players[id]?.[skill] ?? 0
  const out = sheet.battingOrder
    .filter((id) => id !== sheet.keeperId)
    .sort((a, b) => rating(a) - rating(b))
  const subs = [...sheet.impact.subs].sort((a, b) => rating(b) - rating(a))
  for (const inId of subs) {
    const outId = out.find((id) => !impactBlocker(state, teamId, id, inId))
    if (outId && rating(inId) >= rating(outId) + 5) return { outId, inId }
  }
  return null
}

/** Bring on the suggested Impact Player. */
export function applySuggestedImpact(state: MatchState, teamId: string): boolean {
  const s = suggestImpact(state, teamId)
  return !!s && makeImpactSub(state, teamId, s.outId, s.inId) === null
}

// --- Strategic timeouts ----------------------------------------------------------------

/** Can `teamId` call its strategic timeout before the next over? */
export function canCallTimeout(state: MatchState, teamId: string): boolean {
  if (isOver(state) || state.pendingReview) return false
  const inn = currentInnings(state)
  if (inn.maxOvers !== 20 || !atOverBreak(inn)) return false
  if (state.timeouts?.[teamId]?.innings === inn.index) return false
  const over = inn.legalBalls / 6
  const [from, to] =
    inn.bowlingTeamId === teamId ? TIMEOUT_WINDOWS.bowling : TIMEOUT_WINDOWS.batting
  return (
    (inn.bowlingTeamId === teamId || inn.battingTeamId === teamId) && over >= from && over <= to
  )
}

/** Take the strategic timeout: the side refocuses for the next two overs. */
export function callTimeout(state: MatchState, teamId: string): boolean {
  if (!canCallTimeout(state, teamId)) return false
  const inn = currentInnings(state)
  state.timeouts = {
    ...state.timeouts,
    [teamId]: { innings: inn.index, over: inn.legalBalls / 6, boostBalls: TIMEOUT_BALLS },
  }
  if (inn.battingTeamId === teamId) inn.dotRun = 0
  return true
}

/** The AI's timeout: early if the over is going badly for it, at the end of the window otherwise. */
function aiTimeouts(state: MatchState, inn: InningsState) {
  const over = inn.legalBalls / 6
  const rate = inn.legalBalls ? (inn.runs / inn.legalBalls) * 6 : 0
  for (const id of [inn.bowlingTeamId, inn.battingTeamId]) {
    if (!aiDecides(state, id) || !canCallTimeout(state, id)) continue
    const bowling = id === inn.bowlingTeamId
    const last = bowling ? TIMEOUT_WINDOWS.bowling[1] : TIMEOUT_WINDOWS.batting[1]
    const urgent = bowling ? rate > 9.5 || inn.wickets <= 1 : (inn.dotRun ?? 0) >= 4
    if (urgent || over >= last) callTimeout(state, id)
  }
}

const boostFor = (state: MatchState, teamId: string, inn: InningsState) => {
  const t = state.timeouts?.[teamId]
  return t && t.innings === inn.index && t.boostBalls > 0 ? TIMEOUT_BOOST : 0
}

// --- One ball --------------------------------------------------------------------------

function rollOutcome(rng: Rng, o: Odds): keyof Odds {
  return pickWeighted(rng, [
    ['wicket', o.wicket],
    ['dot', o.dot],
    ['one', o.one],
    ['two', o.two],
    ['three', o.three],
    ['four', o.four],
    ['six', o.six],
  ])
}

/** Pick a fielder for a catch or run-out, weighted by fielding rating. */
function pickFielder(state: MatchState, inn: InningsState, rng: Rng, exclude: string): string {
  const sheet = sheetOf(state, inn.bowlingTeamId)
  const pool = sheet.battingOrder.filter((id) => id !== exclude)
  return pickWeighted(
    rng,
    pool.map((id) => [id, (state.players[id]?.fielding ?? 50) ** 2] as const),
  )
}

/** Stroke for a scoring ball, from what was bowled. Angles: 0 straight, 90 off, 270 leg. */
function shotKind(
  rng: Rng,
  runs: number,
  d: BowlingDelivery | null,
  spin: boolean,
): { kind: ShotKind; angle: number } {
  const range = (a: number, b: number) => a + rng() * (b - a)
  const short = d === 'short' || d === 'bouncer' || d === 'longhop'
  const full = d === 'full' || d === 'fulltoss' || d === 'yorker'
  const r = rng()
  if (runs === 6) {
    if (short)
      return r < 0.7
        ? { kind: 'pull', angle: range(240, 300) }
        : { kind: 'hook', angle: range(200, 240) }
    if (spin && r < 0.35) return { kind: 'sweep', angle: range(260, 300) }
    if (d === 'yorker' && r < 0.2) return { kind: 'scoop', angle: range(165, 200) }
    return r < 0.55
      ? { kind: 'loft', angle: range(330, 390) % 360 }
      : { kind: 'slog', angle: range(285, 335) }
  }
  if (runs === 4) {
    if (short)
      return r < 0.5
        ? { kind: 'cut', angle: range(70, 115) }
        : { kind: 'pull', angle: range(235, 290) }
    if (full)
      return r < 0.6
        ? { kind: 'drive', angle: range(15, 75) }
        : { kind: 'flick', angle: range(285, 330) }
    if (spin && r < 0.3) return { kind: 'sweep', angle: range(250, 290) }
    if (r < 0.2) return { kind: 'edge', angle: range(125, 160) }
    if (r < 0.45) return { kind: 'glance', angle: range(195, 230) }
    return { kind: 'drive', angle: range(340, 420) % 360 }
  }
  if (runs === 0) return { kind: 'defend', angle: range(0, 360) }
  if (short)
    return r < 0.5
      ? { kind: 'pull', angle: range(230, 300) }
      : { kind: 'cut', angle: range(70, 120) }
  if (r < 0.3) return { kind: 'push', angle: range(10, 60) }
  if (r < 0.55) return { kind: 'flick', angle: range(270, 330) }
  if (r < 0.7) return { kind: 'glance', angle: range(190, 230) }
  return { kind: 'push', angle: range(0, 360) }
}

/** Shot direction and distance for the commentary and the field view. */
function makeShot(
  rng: Rng,
  runs: number,
  boundaryDist: number,
  pitch: Pitch,
  d: BowlingDelivery | null,
  spin: boolean,
): BallEvent['shot'] {
  const { kind, angle } = shotKind(rng, runs, d, spin)
  const r = rng()
  switch (runs) {
    case 0:
      return r < 0.45 ? null : { angle, distance: 3 + r * 15, aerial: false, kind }
    case 1:
      return { angle, distance: 12 + r * 23, aerial: false, kind }
    case 2:
      return { angle, distance: 35 + r * 25, aerial: r < 0.1, kind }
    case 3:
      return { angle, distance: Math.min(boundaryDist - 3, 55 + r * 12), aerial: false, kind }
    case 4:
      return { angle, distance: pitch.boundary, aerial: r < 0.2, kind }
    default:
      return { angle, distance: boundaryDist + 3 + r * 22, aerial: true, kind }
  }
}

function commentaryKey(
  runs: number,
  shot: BallEvent['shot'],
  wicket: DismissalKind | null,
): string {
  if (wicket) return `wicket.${wicket}`
  if (runs === 6) return `six.${shot?.kind ?? 'loft'}`
  if (runs === 4) return `four.${shot?.kind ?? 'edge'}`
  if (runs === 0) return shot ? 'dot.defended' : 'dot.beaten'
  return `run.${runs}`
}

/** A ball decided but not yet applied to the score. */
interface Draft {
  batterId: string
  nonStrikerId: string
  bowlerId: string
  over: number
  runs: number
  extra: BallEvent['extra']
  legal: boolean
  freeHit: boolean
  wicket: BallEvent['wicket']
  shot: BallEvent['shot']
  boundary: BallEvent['boundary']
  fumble: BallEvent['fumble']
  delivery: Delivery | null
  review: BallEvent['review']
  key: string
}

/** Chance the umpire's call is wrong, and how often a big appeal is turned down. */
export const DRS = {
  wrongLbw: 0.18,
  wrongCaughtBehind: 0.12,
  /** Share of beaten dot balls with a big lbw appeal turned down. */
  appeal: 0.08,
  /** Share of those turned-down appeals that were actually out. */
  appealOut: 0.25,
  /** Share of correct lbw calls that are marginal (umpire's call if reviewed). */
  umpiresCall: 0.25,
}

/**
 * How a call looks to the side that may review: a wrong decision looks wrong (the batter
 * is adamant, the bowler unsure) three times in four; a right one looks wrong one time in
 * five. Reviewing only the confident calls wins roughly 45% of reviews.
 */
export function reviewFeel(wrong: boolean, r: number): ReviewFeel {
  if (wrong) return r < 0.75 ? 'confident' : 'unsure'
  return r < 0.2 ? 'confident' : r < 0.55 ? 'unsure' : 'doubtful'
}

/** Does an AI side review this call? It goes on the same feel the manager sees. */
export function aiReview(feel: ReviewFeel, r: number): boolean {
  return r < { confident: 0.85, unsure: 0.2, doubtful: 0.03 }[feel]
}

/** Settle a call on review: out or not, overturned, umpire's call. */
function drsCall(
  rng: Rng,
  call: 'out' | 'notout',
  kind: 'lbw' | 'caught',
  truthOut: boolean,
): Pick<PendingReview, 'feel' | 'umpiresCall' | 'roll'> {
  const wrong = (call === 'out') !== truthOut
  const feel = reviewFeel(wrong, rng())
  const marginal = rng() < DRS.umpiresCall
  return { feel, umpiresCall: !wrong && kind === 'lbw' && marginal, roll: rng() }
}

/**
 * Bowl one delivery. Starts the next innings or super over first if the current one has
 * finished. Mutates `state` and returns the event. A ball waiting on a manager's review
 * comes back unsettled (not yet in the innings): see `resolveReview`.
 */
export function simBall(state: MatchState, rng: Rng): BallEvent {
  if (isOver(state)) throw new Error('Match is over')
  if (state.pendingReview) return resolveReview(state, false)
  // A manager who sims on without calling the toss gets the captain's call.
  if (state.toss.pending) {
    state.toss.pending = false
    if (state.innings.length === 1 && !state.innings[0]?.events.length)
      applyToss(state, state.toss.decision, true)
  }
  if (currentInnings(state).complete) nextStage(state)
  if (isOver(state)) throw new Error('Match is over')
  const inn = currentInnings(state)

  if (atOverBreak(inn)) aiTimeouts(state, inn)
  if (inn.bowlerId === null) {
    inn.bowlerId = chooseBowler(state, inn)
    const bowling = sheetOf(state, inn.bowlingTeamId)
    if (bowling.ai) Object.assign(bowling, aiBowlingTactics(state, inn, inn.bowlerId))
  }
  if (inn.spell === undefined) inn.spell = spellLength(inn, inn.bowlerId) + 1
  const bowlerId = inn.bowlerId
  const bowler = state.players[bowlerId] as MatchPlayer
  const batterId = inn.strikerId
  const batter = state.players[batterId] as MatchPlayer
  const freeHit = inn.freeHitNext
  const over = Math.floor(inn.legalBalls / 6)
  const phase = inn.maxOvers === 1 ? 'death' : phaseOf(over)
  const intent = batterIntent(state, inn, batterId)
  const tactics = sheetOf(state, inn.bowlingTeamId)
  const dew = inn.index >= 1 ? (state.conditions?.dew ?? 0) : 0
  const ctx: BallContext = {
    batter,
    bowler,
    phase,
    pitch: state.pitch,
    intent,
    field: tactics.field,
    bowlIntent: bowlIntentValue(tactics.bowlIntent),
    plan: tactics.bowlPlan,
    ballsFaced: inn.batting[batterId]?.balls ?? 0,
    pressure: Math.min(1, (inn.dotRun ?? 0) / 6),
    spell: inn.spell,
    hitThisOver: inn.overBoundaries ?? 0,
    dew,
    boost: {
      bat: boostFor(state, inn.battingTeamId, inn),
      bowl: boostFor(state, inn.bowlingTeamId, inn),
    },
    runs: inn.batting[batterId]?.runs ?? 0,
    stand: inn.stand ?? { runs: 0, balls: 0 },
    wicketsDown: inn.wickets,
    bowlerWickets: inn.bowling[bowlerId]?.wickets ?? 0,
    expensive: !!inn.expensive?.[bowlerId],
    requiredRate:
      inn.target !== null && inn.maxOvers > 1
        ? ((inn.target - inn.runs) * 6) / Math.max(1, inn.maxOvers * 6 - inn.legalBalls)
        : undefined,
  }

  const draft: Draft = {
    batterId,
    nonStrikerId: inn.nonStrikerId,
    bowlerId,
    over,
    runs: 0,
    extra: null,
    legal: true,
    freeHit,
    wicket: null,
    shot: null,
    boundary: null,
    fumble: null,
    delivery: null,
    review: null,
    key: '',
  }

  const r = rng()
  const wide = MODEL.wide * wideFactor(ctx)
  if (r < wide) {
    draft.legal = false
    const fiveWides = rng() < 0.03
    draft.extra = { kind: 'wide', runs: fiveWides ? 5 : 1 }
    draft.key = 'wide'
    return applyBall(state, inn, draft)
  }
  const noBall = r < wide + MODEL.noball
  if (noBall) {
    draft.legal = false
    draft.extra = { kind: 'noball', runs: 1 }
  }
  const delivery = pickDelivery(rng, tactics.bowlPlan, {
    bowler,
    phase,
    penalty: bowlerPenalty(ctx),
    dew,
  })
  draft.delivery = delivery
  const odds = ballOdds({ ...ctx, delivery: delivery.actual })
  let outcome = rollOutcome(rng, odds)
  let kind: DismissalKind | null = null
  if (outcome === 'wicket') {
    kind = pickWeighted(rng, dismissalWeights(bowler))
    // Off a no-ball or free hit, only a run-out counts.
    if ((noBall || freeHit) && kind !== 'runOut') {
      kind = null
      outcome = 'dot'
    }
  }
  const keeperId = sheetOf(state, inn.bowlingTeamId).keeperId
  // The catch may go down.
  if (kind === 'caught') {
    const keeperChance = rng() < 0.13 && bowler.bowlingType === 'pace'
    const catcher =
      rng() < 0.03 ? bowlerId : keeperChance ? keeperId : pickFielder(state, inn, rng, bowlerId)
    const f = state.players[catcher]?.fielding ?? 50
    if (rng() < dropChance(f, catcher === keeperId)) {
      draft.fumble = { kind: 'drop', fielderId: catcher }
      kind = null
      outcome = rng() < 0.6 ? 'dot' : 'one'
    } else {
      draft.wicket = { kind, playerOutId: batterId, fielderId: catcher }
    }
  }
  const spin = bowler.bowlingType === 'spin'
  if (draft.wicket) {
    draft.shot = {
      angle: rng() * 360,
      distance: 15 + rng() * (state.pitch.boundary - 17),
      aerial: true,
      kind: 'edge',
    }
    if (draft.wicket.fielderId === keeperId) draft.shot = null
    draft.key = commentaryKey(0, draft.shot, 'caught')
  } else if (kind) {
    draft.runs = kind === 'runOut' && rng() < 0.5 ? 1 : 0
    const outId = kind === 'runOut' && rng() < 0.4 ? inn.nonStrikerId : batterId
    const fielder =
      kind === 'stumped' ? keeperId : kind === 'runOut' ? pickFielder(state, inn, rng, '') : null
    draft.wicket = { kind, playerOutId: outId, fielderId: fielder }
    draft.shot =
      kind === 'runOut'
        ? { angle: rng() * 360, distance: 10 + rng() * 20, aerial: false, kind: 'push' }
        : null
    draft.key = commentaryKey(0, draft.shot, kind)
  } else {
    let runs = { dot: 0, one: 1, two: 2, three: 3, four: 4, six: 6, wicket: 0 }[outcome]
    // A single can become two through a misfield.
    if (runs === 1 && !draft.fumble) {
      const fielder = pickFielder(state, inn, rng, bowlerId)
      if (rng() < misfieldChance(state.players[fielder]?.fielding ?? 50)) {
        draft.fumble = { kind: 'misfield', fielderId: fielder }
        runs = 2
      }
    }
    draft.runs = runs
    draft.shot =
      draft.fumble?.kind === 'drop'
        ? {
            angle: rng() * 360,
            distance: 15 + rng() * (state.pitch.boundary - 17),
            aerial: true,
            kind: 'loft',
          }
        : makeShot(rng, runs, state.pitch.boundary, state.pitch, delivery.actual, spin)
    if (runs === 4 || runs === 6) draft.boundary = runs
    draft.key = draft.fumble ? draft.fumble.kind : commentaryKey(runs, draft.shot, null)
    // Some would-be dots become leg-byes or byes (legal balls only).
    if (runs === 0 && !noBall) {
      const lb = rng()
      if (lb < MODEL.legbyeOfDot) {
        draft.extra = { kind: 'legbye', runs: 1 }
        draft.key = 'legbye'
      } else if (lb < MODEL.legbyeOfDot + MODEL.byeOfDot) {
        draft.extra = { kind: 'bye', runs: 1 }
        draft.key = 'bye'
      }
    }
  }
  if (noBall) draft.key = `noball.${draft.key}`

  // DRS: an lbw or caught-behind given out, or a big lbw shout turned down.
  const w = draft.wicket
  let pending: PendingReview | null = null
  if (w && (w.kind === 'lbw' || (w.kind === 'caught' && w.fielderId === keeperId))) {
    const wrong = w.kind === 'lbw' ? DRS.wrongLbw : DRS.wrongCaughtBehind
    const truthOut = rng() >= wrong
    pending = {
      teamId: inn.battingTeamId,
      call: 'out',
      kind: w.kind,
      batterId,
      bowlerId,
      truthOut,
      ...drsCall(rng, 'out', w.kind, truthOut),
      draft,
    }
  } else if (
    !w &&
    draft.legal &&
    !draft.extra &&
    !freeHit &&
    draft.runs === 0 &&
    !draft.shot &&
    rng() < DRS.appeal
  ) {
    const truthOut = rng() < DRS.appealOut
    pending = {
      teamId: inn.bowlingTeamId,
      call: 'notout',
      kind: 'lbw',
      batterId,
      bowlerId,
      truthOut,
      ...drsCall(rng, 'notout', 'lbw', truthOut),
      draft,
    }
    draft.key = 'appeal'
  }
  if (pending && (inn.reviews?.[pending.teamId] ?? 0) > 0) {
    if (!aiDecides(state, pending.teamId)) {
      state.pendingReview = pending
      return provisionalEvent(inn, draft)
    }
    state.pendingReview = pending
    return resolveReview(state, aiReview(pending.feel, pending.roll))
  }
  return applyBall(state, inn, draft)
}

/** The ball as it stands while a review is pending (not part of the innings yet). */
function provisionalEvent(inn: InningsState, d: Draft): BallEvent {
  return toEvent(inn, d, {
    runs: inn.runs + d.runs + (d.extra?.runs ?? 0),
    wickets: inn.wickets + (d.wicket ? 1 : 0),
    legalBalls: inn.legalBalls + (d.legal ? 1 : 0),
  })
}

/**
 * Settle a ball waiting on a review: `review` true asks the third umpire. An overturned
 * call keeps the review, and so does one upheld on umpire's call; otherwise it is lost.
 */
export function resolveReview(state: MatchState, review: boolean): BallEvent {
  const p = state.pendingReview
  if (!p) throw new Error('No review pending')
  state.pendingReview = null
  const inn = currentInnings(state)
  const d = p.draft as Draft
  if (review) {
    const overturned = (p.call === 'out') !== p.truthOut
    if (!overturned && !p.umpiresCall && inn.reviews)
      inn.reviews[p.teamId] = (inn.reviews[p.teamId] ?? 1) - 1
    d.review = { teamId: p.teamId, call: p.call, overturned, umpiresCall: p.umpiresCall }
    if (overturned && p.call === 'out') {
      d.wicket = null
      d.shot = null
      d.key = 'review.notout'
    } else if (overturned) {
      d.wicket = { kind: 'lbw', playerOutId: d.batterId, fielderId: null }
      d.key = 'wicket.lbw'
    }
  }
  return applyBall(state, inn, d)
}

function toEvent(inn: InningsState, d: Draft, score: BallEvent['score']): BallEvent {
  const extraRuns = d.extra?.runs ?? 0
  return {
    innings: inn.index,
    over: d.over,
    ball: d.legal ? ((score.legalBalls - 1) % 6) + 1 : (score.legalBalls % 6) + 1,
    batterId: d.batterId,
    nonStrikerId: d.nonStrikerId,
    bowlerId: d.bowlerId,
    runs: d.runs,
    extra: d.extra,
    total: d.runs + extraRuns,
    legal: d.legal,
    freeHit: d.freeHit,
    wicket: d.wicket,
    shot: d.shot,
    boundary: d.boundary,
    fumble: d.fumble,
    delivery: d.delivery,
    review: d.review,
    commentary: d.key,
    score,
  }
}

/** Apply a decided ball to the innings and the match. */
function applyBall(state: MatchState, inn: InningsState, d: Draft): BallEvent {
  const { batterId, bowlerId, runs, extra, legal, wicket, boundary } = d
  const bat = (inn.batting[batterId] ??= { runs: 0, balls: 0, fours: 0, sixes: 0, out: null })
  inn.batting[inn.nonStrikerId] ??= { runs: 0, balls: 0, fours: 0, sixes: 0, out: null }
  const bowl = (inn.bowling[bowlerId] ??= {
    legalBalls: 0,
    runs: 0,
    wickets: 0,
    dots: 0,
    wides: 0,
    noballs: 0,
  })
  if (extra?.kind === 'wide') bowl.wides++
  if (extra?.kind === 'noball') bowl.noballs++

  const extraRuns = extra?.runs ?? 0
  const total = runs + extraRuns
  inn.runs += total
  inn.extras += extraRuns
  if (extra?.kind !== 'wide') bat.balls++
  bat.runs += runs
  if (boundary === 4) bat.fours++
  if (boundary === 6) bat.sixes++
  // Byes and leg-byes are not charged to the bowler.
  bowl.runs += runs + (extra && (extra.kind === 'wide' || extra.kind === 'noball') ? extraRuns : 0)
  if (legal) {
    inn.legalBalls++
    bowl.legalBalls++
    if (total === 0) bowl.dots++
    inn.dotRun = total === 0 && !wicket ? (inn.dotRun ?? 0) + 1 : 0
    for (const t of Object.values(state.timeouts ?? {}))
      if (t.innings === inn.index && t.boostBalls > 0) t.boostBalls--
  }
  if (boundary) inn.overBoundaries = (inn.overBoundaries ?? 0) + 1
  inn.overRuns = (inn.overRuns ?? 0) + total
  const stand = (inn.stand ??= { runs: 0, balls: 0 })
  stand.runs += total
  if (legal) stand.balls++
  inn.freeHitNext =
    extra?.kind === 'noball' ? true : extra?.kind === 'wide' ? inn.freeHitNext : false

  if (wicket) {
    inn.stand = { runs: 0, balls: 0 }
    inn.wickets++
    if (wicket.kind !== 'runOut') bowl.wickets++
    const outLine = inn.batting[wicket.playerOutId]
    if (outLine) outLine.out = wicket
  }

  // Strike: an odd number of runs actually run swaps ends (wides are not run).
  const ran =
    extra?.kind === 'wide'
      ? 0
      : extra?.kind === 'bye' || extra?.kind === 'legbye'
        ? extraRuns
        : runs
  if (ran % 2 === 1) swapStrike(inn)

  if (wicket) {
    const next = inn.toCome.shift()
    if (inn.wickets >= inn.maxWickets || !next) inn.complete = true
    else {
      if (wicket.playerOutId === inn.strikerId) inn.strikerId = next
      else inn.nonStrikerId = next
      inn.battedOrder.push(next)
      inn.batting[next] ??= { runs: 0, balls: 0, fours: 0, sixes: 0, out: null }
    }
  }

  const overDone = legal && inn.legalBalls % 6 === 0
  const event = toEvent(inn, d, {
    runs: inn.runs,
    wickets: inn.wickets,
    legalBalls: inn.legalBalls,
  })
  inn.events.push(event)

  if (overDone) {
    swapStrike(inn)
    inn.lastOverBowlerId = bowlerId
    inn.bowlerId = null
    inn.spell = undefined
    inn.overBoundaries = 0
    inn.expensive = { ...inn.expensive, [bowlerId]: (inn.overRuns ?? 0) >= 15 }
    inn.overRuns = 0
  }
  if (inn.legalBalls >= inn.maxOvers * 6) inn.complete = true
  if (inn.target !== null && inn.runs >= inn.target) inn.complete = true

  // Settle the match as soon as the deciding innings ends.
  if (inn.complete && state.innings.length % 2 === 0) nextStage(state)
  return event
}

function swapStrike(inn: InningsState) {
  const s = inn.strikerId
  inn.strikerId = inn.nonStrikerId
  inn.nonStrikerId = s
}

/**
 * Change a batter's intent during a live match (the manager's −/+ control). Applies
 * from the next ball.
 */
export function setLiveIntent(state: MatchState, teamId: string, batterId: string, step: number) {
  const sheet = sheetOf(state, teamId)
  const cur = AGGRESSION.indexOf(sheet.intent[batterId] ?? sheet.aggression)
  const next = AGGRESSION[Math.max(0, Math.min(AGGRESSION.length - 1, cur + step))] ?? 'balanced'
  sheet.intent = { ...sheet.intent, [batterId]: next }
}

/**
 * True between innings: the current innings is over but the match is not. The stepping
 * functions below stop here; call `startNextInnings` to go on (a hard stop, so "sim 5
 * overs" near the end of an innings never runs into the next one).
 */
export function atInningsBreak(state: MatchState): boolean {
  return !isOver(state) && currentInnings(state).complete
}

/** Start the next innings (or super over) after a break. No balls are bowled. */
export function startNextInnings(state: MatchState) {
  if (atInningsBreak(state)) nextStage(state)
}

/** Bowlers the bowling side may use for the next over (manager's choice). */
export function eligibleBowlers(state: MatchState): string[] {
  const inn = currentInnings(state)
  const sheet = sheetOf(state, inn.bowlingTeamId)
  const cap = inn.maxOvers === 1 ? 1 : MAX_OVERS_PER_BOWLER
  return sheet.battingOrder.filter(
    (id) =>
      id !== sheet.keeperId &&
      id !== inn.lastOverBowlerId &&
      Math.floor((inn.bowling[id]?.legalBalls ?? 0) / 6) < cap,
  )
}

/** The manager picks who bowls the next over (only between overs). */
export function setLiveBowler(state: MatchState, bowlerId: string): boolean {
  if (atInningsBreak(state) || isOver(state)) return false
  const inn = currentInnings(state)
  if (inn.bowlerId !== null || !eligibleBowlers(state).includes(bowlerId)) return false
  inn.bowlerId = bowlerId
  return true
}

/** The manager's live bowling tactics: field, bowler intent, plan. */
export function setLiveTactics(
  state: MatchState,
  teamId: string,
  t: Partial<Pick<TeamSheet, 'field' | 'bowlIntent' | 'bowlPlan'>>,
) {
  Object.assign(sheetOf(state, teamId), t)
}

const waiting = (state: MatchState) =>
  isOver(state) || atInningsBreak(state) || !!state.pendingReview

/** Bowl until the current over ends (or the innings/match ends). Stops at a break or a review. */
export function simOver(state: MatchState, rng: Rng): BallEvent[] {
  const events: BallEvent[] = []
  while (!waiting(state)) {
    events.push(simBall(state, rng))
    if (currentInnings(state).bowlerId === null) break
  }
  return events
}

export function simOvers(state: MatchState, rng: Rng, n: number): BallEvent[] {
  const events: BallEvent[] = []
  for (let i = 0; i < n && !waiting(state); i++) events.push(...simOver(state, rng))
  return events
}

/** Bowl until the current innings ends. Stops at a break or a review. */
export function simInnings(state: MatchState, rng: Rng): BallEvent[] {
  const events: BallEvent[] = []
  while (!waiting(state)) events.push(simBall(state, rng))
  return events
}

/**
 * Play the whole match (including any super overs) and return the result. Nobody is
 * watching any more, so the captains make every call from here.
 */
export function simMatch(state: MatchState, rng: Rng): MatchResult {
  if (state.interactive) state.interactive = false
  while (!isOver(state)) simBall(state, rng)
  return state.result as MatchResult
}
