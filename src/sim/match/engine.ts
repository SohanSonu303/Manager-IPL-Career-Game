import { createRng, deriveSeed, pickWeighted, type Rng } from '../rng'
import { ballOdds, dismissalWeights, MODEL, type Odds } from './model'
import { batterIntent, chooseBowler } from './tactics'
import {
  AGGRESSION,
  phaseOf,
  type BallEvent,
  type DismissalKind,
  type InningsState,
  type MatchPlayer,
  type MatchResult,
  type MatchState,
  type Pitch,
  type TeamSheet,
} from './types'

/*
 * Ball-by-ball engine. State is a plain object mutated in place by `simBall` (fast enough
 * for 10,000-match calibration runs); everything else is built on `simBall`. The same
 * seed and the same inputs always produce the same match.
 */

const MAX_SUPER_OVERS = 10

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

export function createMatch(setup: MatchSetup): Match {
  const tossRng = createRng(deriveSeed(setup.seed, 'toss'))
  const [home, away] = setup.sheets
  const winner = tossRng() < 0.5 ? home : away
  const loser = winner === home ? away : home
  // Chasing wins slightly more often in modern T20, so captains usually field.
  const decision: 'bat' | 'field' = tossRng() < 0.7 ? 'field' : 'bat'
  const order: [string, string] =
    decision === 'bat' ? [winner.teamId, loser.teamId] : [loser.teamId, winner.teamId]
  const state: MatchState = {
    seed: setup.seed,
    pitch: setup.pitch,
    players: Object.fromEntries(setup.players.map((p) => [p.id, p])),
    sheets: { [home.teamId]: home, [away.teamId]: away },
    order,
    toss: { winnerId: winner.teamId, decision },
    innings: [],
    result: null,
  }
  startInnings(state, order[0], order[1], 20, 10, null)
  return { state, rng: createRng(deriveSeed(setup.seed, 'balls')) }
}

function sheetOf(state: MatchState, teamId: string): TeamSheet {
  const s = state.sheets[teamId]
  if (!s) throw new Error(`No team sheet for ${teamId}`)
  return s
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
  })
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
    startInnings(state, state.order[1], state.order[0], 20, 10, last.runs + 1)
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

/** Shot direction and distance for the commentary and the field view. */
function makeShot(rng: Rng, runs: number, boundaryDist: number, pitch: Pitch): BallEvent['shot'] {
  // Leg side (180–360) is favoured for big hits, as in real T20.
  const legBias = runs === 6 ? 0.6 : 0.5
  const leg = rng() < legBias
  const angle = leg ? 200 + rng() * 160 : rng() * 160
  const r = rng()
  switch (runs) {
    case 0:
      return r < 0.45 ? null : { angle, distance: 3 + r * 15, aerial: false }
    case 1:
      return { angle, distance: 12 + r * 23, aerial: false }
    case 2:
      return { angle, distance: 35 + r * 25, aerial: r < 0.1 }
    case 3:
      return { angle, distance: Math.min(boundaryDist - 3, 55 + r * 12), aerial: false }
    case 4:
      return { angle, distance: pitch.boundary, aerial: r < 0.2 }
    default:
      return { angle, distance: boundaryDist + 3 + r * 22, aerial: true }
  }
}

function commentaryKey(
  runs: number,
  shot: BallEvent['shot'],
  wicket: DismissalKind | null,
): string {
  if (wicket) return `wicket.${wicket}`
  if (runs === 6) return shot && shot.angle > 200 && shot.angle < 300 ? 'six.pull' : 'six.lofted'
  if (runs === 4) {
    if (!shot) return 'four.edge'
    if (shot.angle > 120 && shot.angle < 240) return 'four.fine'
    return shot.angle >= 240 ? 'four.leg' : 'four.off'
  }
  if (runs === 0) return shot ? 'dot.defended' : 'dot.beaten'
  return `run.${runs}`
}

/**
 * Bowl one delivery. Starts the next innings or super over first if the current one has
 * finished. Mutates `state` and returns the event.
 */
export function simBall(state: MatchState, rng: Rng): BallEvent {
  if (isOver(state)) throw new Error('Match is over')
  if (currentInnings(state).complete) nextStage(state)
  if (isOver(state)) throw new Error('Match is over')
  const inn = currentInnings(state)

  if (inn.bowlerId === null) inn.bowlerId = chooseBowler(state, inn)
  const bowlerId = inn.bowlerId
  const bowler = state.players[bowlerId] as MatchPlayer
  const batterId = inn.strikerId
  const nonStrikerId = inn.nonStrikerId
  const batter = state.players[batterId] as MatchPlayer
  const freeHit = inn.freeHitNext
  const over = Math.floor(inn.legalBalls / 6)
  const phase = inn.maxOvers === 1 ? 'death' : phaseOf(over)
  const intent = batterIntent(state, inn, batterId)

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

  let runs = 0
  let extra: BallEvent['extra'] = null
  let legal = true
  let wicket: BallEvent['wicket'] = null
  let shot: BallEvent['shot'] = null
  let boundary: BallEvent['boundary'] = null
  let key: string

  const r = rng()
  if (r < MODEL.wide) {
    legal = false
    const fiveWides = rng() < 0.03
    extra = { kind: 'wide', runs: fiveWides ? 5 : 1 }
    bowl.wides++
    key = 'wide'
  } else {
    const noBall = r < MODEL.wide + MODEL.noball
    if (noBall) {
      legal = false
      extra = { kind: 'noball', runs: 1 }
      bowl.noballs++
    }
    const odds = ballOdds({ batter, bowler, phase, pitch: state.pitch, intent })
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
    if (kind) {
      const runsCompleted = kind === 'runOut' && rng() < 0.5 ? 1 : 0
      runs = runsCompleted
      const outId = kind === 'runOut' && rng() < 0.4 ? inn.nonStrikerId : batterId
      const fielder =
        kind === 'caught'
          ? rng() < 0.03
            ? bowlerId
            : rng() < 0.13 && bowler.bowlingType === 'pace'
              ? sheetOf(state, inn.bowlingTeamId).keeperId
              : pickFielder(state, inn, rng, bowlerId)
          : kind === 'stumped'
            ? sheetOf(state, inn.bowlingTeamId).keeperId
            : kind === 'runOut'
              ? pickFielder(state, inn, rng, '')
              : null
      wicket = { kind, playerOutId: outId, fielderId: fielder }
      shot =
        kind === 'caught'
          ? { angle: rng() * 360, distance: 15 + rng() * (state.pitch.boundary - 17), aerial: true }
          : kind === 'runOut'
            ? { angle: rng() * 360, distance: 10 + rng() * 20, aerial: false }
            : null
      key = commentaryKey(0, shot, kind)
    } else {
      runs = { dot: 0, one: 1, two: 2, three: 3, four: 4, six: 6, wicket: 0 }[outcome]
      shot = makeShot(rng, runs, state.pitch.boundary, state.pitch)
      if (runs === 4 || runs === 6) boundary = runs
      key = commentaryKey(runs, shot, null)
      // Some would-be dots become leg-byes or byes (legal balls only).
      if (runs === 0 && !noBall) {
        const lb = rng()
        if (lb < MODEL.legbyeOfDot) {
          extra = { kind: 'legbye', runs: 1 }
          key = 'legbye'
        } else if (lb < MODEL.legbyeOfDot + MODEL.byeOfDot) {
          extra = { kind: 'bye', runs: 1 }
          key = 'bye'
        }
      }
    }
    if (noBall) key = `noball.${key}`
  }

  // --- Apply the delivery -----------------------------------------------------
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
  }
  inn.freeHitNext =
    extra?.kind === 'noball' ? true : extra?.kind === 'wide' ? inn.freeHitNext : false

  if (wicket) {
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
  const event: BallEvent = {
    innings: inn.index,
    over,
    ball: legal ? ((inn.legalBalls - 1) % 6) + 1 : (inn.legalBalls % 6) + 1,
    batterId,
    nonStrikerId,
    bowlerId,
    runs,
    extra,
    total,
    legal,
    freeHit,
    wicket,
    shot,
    boundary,
    commentary: key,
    score: { runs: inn.runs, wickets: inn.wickets, legalBalls: inn.legalBalls },
  }
  inn.events.push(event)

  if (overDone) {
    swapStrike(inn)
    inn.lastOverBowlerId = bowlerId
    inn.bowlerId = null
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

/** Bowl until the current over ends (or the innings/match ends). */
export function simOver(state: MatchState, rng: Rng): BallEvent[] {
  const events = [simBall(state, rng)]
  const idx = events[0]?.innings
  while (!isOver(state)) {
    const inn = currentInnings(state)
    if (inn.index !== idx || inn.complete || inn.bowlerId === null) break
    events.push(simBall(state, rng))
  }
  return events
}

export function simOvers(state: MatchState, rng: Rng, n: number): BallEvent[] {
  const events: BallEvent[] = []
  for (let i = 0; i < n && !isOver(state); i++) {
    const over = simOver(state, rng)
    events.push(...over)
    if (currentInnings(state).complete || currentInnings(state).index !== over[0]?.innings) break
  }
  return events
}

/** Bowl until the current innings ends (starting the next one first if needed). */
export function simInnings(state: MatchState, rng: Rng): BallEvent[] {
  const events = [simBall(state, rng)]
  const idx = events[0]?.innings
  while (!isOver(state)) {
    const inn = currentInnings(state)
    if (inn.index !== idx || inn.complete) break
    events.push(simBall(state, rng))
  }
  return events
}

/** Play the whole match (including any super overs) and return the result. */
export function simMatch(state: MatchState, rng: Rng): MatchResult {
  while (!isOver(state)) simBall(state, rng)
  return state.result as MatchResult
}
