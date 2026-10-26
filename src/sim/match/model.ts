import type { Trait } from '../../data/types'
import { deliveryEffect, DELIVERY_EFFECT, expectedEffect } from './delivery'
import type {
  BowlingDelivery,
  BowlPlan,
  DismissalKind,
  FieldSetting,
  MatchPlayer,
  Phase,
  Pitch,
} from './types'

/**
 * Tunable constants of the ball model. Base rates come from real IPL data
 * (src/sim/calibration/targets.json); the rest is tuned with the calibration harness
 * (`npm run calibrate`). Change these only together with a harness run.
 */
export const MODEL = {
  /** Legal-ball rates per phase for an average matchup at balanced intent. */
  base: {
    powerplay: { wicket: 0.0355, dot: 0.372, four: 0.198, six: 0.063 },
    middle: { wicket: 0.0478, dot: 0.262, four: 0.113, six: 0.06 },
    death: { wicket: 0.0645, dot: 0.2, four: 0.16, six: 0.117 },
  } satisfies Record<Phase, { wicket: number; dot: number; four: number; six: number }>,
  /** Skill = (batting − bowling − center) / 10. Center = the average matchup. */
  skillCenter: -3,
  /** Exponential sensitivity of each outcome to skill (per 10 rating points). */
  skill: { wicket: 0.22, boundary: 0.14, dot: 0.08 },
  /** Exponential sensitivity to intent (per step from balanced, −2…+2). */
  intent: { wicket: 0.24, boundary: 0.2, six: 0.12, dot: -0.14 },
  /** Of the non-boundary runs: share of twos and threes (rest are singles). */
  twoShare: 0.124,
  threeShare: 0.004,
  /** Per delivery. */
  wide: 0.0425,
  noball: 0.0041,
  /** Share of would-be dots that become leg-byes / byes. */
  legbyeOfDot: 0.058,
  byeOfDot: 0.016,
  /**
   * Getting set: a new batter is likelier to get out and finds the boundary less often.
   * Multiplier = set + (new − set) · e^(−balls / settle). Mean-centred by the base rates.
   */
  settle: 8,
  newWicket: 1.28,
  setWicket: 0.86,
  newBoundary: 0.82,
  setBoundary: 1.08,
  /** Pressure from a run of dot balls: extra false-shot risk at six dots in a row. */
  pressureWicket: 0.22,
  /** Rating points a bowler loses per over past two in a spell. */
  fatigue: 3,
  /** Rattled bowler: rating points lost and extra wide risk per boundary past one this over. */
  rattledRating: 3,
  rattledWide: 0.2,
  /** Dew: extra wides, and the wet ball skids on to the bat (spinners lose grip). */
  dewWide: 0.06,
  dewBoundary: 0,
  dewSpinBoundary: 0.14,
  /** In the zone: a set batter (25+ off 20+ balls) hits more freely and safely. */
  zoneBoundary: 1.07,
  zoneWicket: 0.93,
  /** A big innings (60+): tiredness and risk creep back in. */
  longInningsWicket: 1.08,
  /** A stand of 30+ settles the batting side; a new pair is fragile for a few balls. */
  standWicket: 0.94,
  newPairWicket: 1.1,
  /** Rating points a bowler gains per wicket in the innings (up to two). */
  confidence: 1.5,
  /** Rating points lost after his previous over went for 15 or more. */
  hangover: 2,
  /** Chase pressure: extra wicket risk per run of required rate above 9 (capped). */
  chaseWicket: 0.02,
  chaseWicketMax: 0.16,
  /** Sixes per metre of boundary shorter than 69 m (and fewer on big grounds). */
  groundSix: 0.03,
  /** Tail-enders (batting under 35) against a real bowler: extra risk per point. */
  tailWicket: 0.015,
  /** Dropped catches: share of chances put down by a 60-rated fielder (keepers drop fewer). */
  drop: 0.15,
  /** Share of singles that become two through a misfield (60-rated fielder). */
  misfield: 0.02,
  /** Dismissal mix (given a wicket), from real IPL data; adjusted by bowler type. */
  dismissals: {
    // Raised and lowered from the real mix: some catches go down, and DRS adds lbws.
    caught: 0.79,
    bowled: 0.141,
    lbw: 0.032,
    runOut: 0.049,
    stumped: 0.017,
    hitWicket: 0.003,
  } satisfies Record<DismissalKind, number>,
}

export interface Odds {
  wicket: number
  dot: number
  one: number
  two: number
  three: number
  four: number
  six: number
}

export interface BallContext {
  batter: MatchPlayer
  bowler: MatchPlayer
  phase: Phase
  pitch: Pitch
  /** −2…+2 (already includes free-hit and situation adjustments). */
  intent: number
  /** Bowling side's tactics (defaults: balanced, 0, stock). */
  field?: FieldSetting
  /** −1 (contain) … +1 (attack). */
  bowlIntent?: number
  plan?: BowlPlan
  /** Balls the batter has faced this innings (getting set). */
  ballsFaced?: number
  /** 0…1: built up by a run of dot balls. */
  pressure?: number
  /** Consecutive overs in the bowler's current spell, this one included. */
  spell?: number
  /** Boundaries the bowler has conceded in this over. */
  hitThisOver?: number
  /** What was actually bowled. Missing: the plan's average over its deliveries. */
  delivery?: BowlingDelivery
  /** 0…1 dew on the ball (second innings). */
  dew?: number
  /** Rating points of refocus after a strategic timeout, per side. */
  boost?: { bat: number; bowl: number }
  /** The batter's runs so far this innings. */
  runs?: number
  /** The current partnership: runs, and legal balls since the last wicket. */
  stand?: { runs: number; balls: number }
  /** Wickets down in the innings. */
  wicketsDown?: number
  /** The bowler's wickets this innings. */
  bowlerWickets?: number
  /** His previous over went for 15 or more. */
  expensive?: boolean
  /** When chasing: required run rate (per over). */
  requiredRate?: number
}

/** Extra wide risk from the bowling plan, intent and a rattled bowler. */
export function wideFactor({
  plan,
  bowlIntent = 0,
  hitThisOver = 0,
  dew = 0,
}: BallContext): number {
  return (
    (plan === 'wide' ? 1.6 : 1) *
    (bowlIntent > 0 ? 1.15 : 1) *
    (1 + MODEL.rattledWide * Math.max(0, hitThisOver - 1)) *
    (1 + MODEL.dewWide * dew)
  )
}

/** Wicket and boundary multipliers for a batter who has faced `balls` balls. */
export function settleFactor(balls: number): { wicket: number; boundary: number } {
  const k = Math.exp(-balls / MODEL.settle)
  return {
    wicket: MODEL.setWicket + (MODEL.newWicket - MODEL.setWicket) * k,
    boundary: MODEL.setBoundary + (MODEL.newBoundary - MODEL.setBoundary) * k,
  }
}

/** Rating points the bowler is down today from a long spell or a bad over. */
export function bowlerPenalty({
  spell = 1,
  hitThisOver = 0,
  bowlerWickets = 0,
  expensive = false,
}: BallContext): number {
  return (
    MODEL.fatigue * Math.max(0, spell - 2) +
    MODEL.rattledRating * Math.max(0, hitThisOver - 1) +
    (expensive ? MODEL.hangover : 0) -
    MODEL.confidence * Math.min(2, bowlerWickets)
  )
}

/** Wicket and boundary multipliers from the state of the innings (form of the batter, the
 * partnership, the chase). */
export function situationFactor(ctx: BallContext): { wicket: number; boundary: number } {
  const { runs = 0, ballsFaced = 0, stand, wicketsDown = 0, requiredRate, batter, bowler } = ctx
  let wicket = 1
  let boundary = 1
  if (runs >= 25 && ballsFaced >= 20) {
    boundary *= MODEL.zoneBoundary
    wicket *= MODEL.zoneWicket
  }
  if (runs >= 60) wicket *= MODEL.longInningsWicket
  if (stand && stand.runs >= 30) wicket *= MODEL.standWicket
  else if (stand && wicketsDown > 0 && stand.balls < 6) wicket *= MODEL.newPairWicket
  if (requiredRate !== undefined && requiredRate > 9)
    wicket *= 1 + Math.min(MODEL.chaseWicketMax, MODEL.chaseWicket * (requiredRate - 9))
  if (batter.batting < 35 && bowler.bowling >= 60)
    wicket *= 1 + MODEL.tailWicket * (35 - batter.batting)
  return { wicket, boundary }
}

/** Chance a catch goes down, by the fielder's rating. */
export function dropChance(fielding: number, keeper: boolean): number {
  const p = MODEL.drop * Math.exp((60 - fielding) / 15) * (keeper ? 0.6 : 1)
  return Math.min(0.3, Math.max(0.05, p))
}

/** Chance a single becomes two through a misfield. */
export function misfieldChance(fielding: number): number {
  return Math.min(0.06, Math.max(0.005, MODEL.misfield * Math.exp((60 - fielding) / 15)))
}

const has = (p: MatchPlayer, t: Trait) => p.traits.includes(t)

/** Probabilities of each outcome of a legal delivery. Sums to 1. */
export function ballOdds(ctx: BallContext): Odds {
  const {
    batter,
    bowler,
    phase,
    pitch,
    intent,
    field = 'balanced',
    bowlIntent = 0,
    plan = 'stock',
    ballsFaced,
    pressure = 0,
    dew = 0,
    boost,
  } = ctx
  const base = MODEL.base[phase]
  const s =
    (batter.batting +
      (boost?.bat ?? 0) -
      (bowler.bowling + (boost?.bowl ?? 0) - bowlerPenalty(ctx)) -
      MODEL.skillCenter) /
    10

  let w = base.wicket * Math.exp(-MODEL.skill.wicket * s + MODEL.intent.wicket * intent)
  let b =
    (base.four + base.six) * Math.exp(MODEL.skill.boundary * s + MODEL.intent.boundary * intent)
  let sixShare = (base.six / (base.four + base.six)) * Math.exp(MODEL.intent.six * intent)
  let d = base.dot * Math.exp(-MODEL.skill.dot * s + MODEL.intent.dot * intent)

  // Getting set, and pressure from dot balls.
  if (ballsFaced !== undefined) {
    const f = settleFactor(ballsFaced)
    w *= f.wicket
    b *= f.boundary
  }
  w *= 1 + MODEL.pressureWicket * pressure
  const sit = situationFactor(ctx)
  w *= sit.wicket
  b *= sit.boundary

  // Batter traits.
  if (has(batter, 'big-hitter')) {
    sixShare *= 1.35
    b *= 1.06
    w *= 1.05
  }
  if (has(batter, 'anchor')) {
    w *= 0.85
    b *= 0.9
    d *= 0.95
  }
  if (has(batter, 'finisher') && phase === 'death') {
    b *= 1.15
    w *= 0.92
  }
  if (has(batter, 'poor-vs-spin') && bowler.bowlingType === 'spin') {
    w *= 1.25
    b *= 0.85
  }
  // Bowler traits and type.
  if (has(bowler, 'powerplay-specialist') && phase === 'powerplay') {
    w *= 1.15
    b *= 0.9
  }
  if (has(bowler, 'death-bowler') && phase === 'death') {
    w *= 1.1
    b *= 0.88
  }
  if (bowler.bowlingType === 'spin' && phase === 'death') b *= 1.08
  if (has(batter, 'spin-basher') && bowler.bowlingType === 'spin') {
    b *= 1.15
    w *= 0.9
  }
  if (has(batter, 'pace-hitter') && bowler.bowlingType === 'pace') b *= 1.1
  if (has(batter, 'powerplay-hitter') && phase === 'powerplay') {
    b *= 1.12
    w *= 1.04
  }
  if (has(bowler, 'yorker-specialist') && phase === 'death') b *= 0.9
  if (has(bowler, 'swing-bowler') && phase === 'powerplay') {
    w *= 1.15
    b *= 0.95
  }
  if (has(bowler, 'mystery-spinner')) {
    w *= 1.1
    d *= 1.04
  }
  if (has(bowler, 'economical')) {
    b *= 0.9
    w *= 0.96
  }

  // Field placement.
  if (field === 'attacking') {
    w *= 1.1
    b *= 1.12
  } else if (field === 'defensive') {
    w *= 0.9
    b *= 0.82
    d *= 0.92
  }
  // Bowler intent.
  if (bowlIntent > 0) {
    w *= 1.1
    b *= 1.08
  } else if (bowlIntent < 0) {
    w *= 0.9
    b *= 0.92
    d *= 1.04
  }
  // What was bowled: one delivery, or the plan's average when none is given.
  const e = deliveryEffect(
    bowler.bowlingType,
    ctx.delivery
      ? DELIVERY_EFFECT[ctx.delivery]
      : expectedEffect(plan, {
          bowler,
          phase,
          penalty: bowlerPenalty(ctx),
          dew: bowler.bowlingType ? dew : 0,
        }),
  )
  w *= e.wicket
  b *= e.boundary
  sixShare *= e.six
  d *= e.dot
  b *= 1 + MODEL.dewBoundary * dew
  if (bowler.bowlingType === 'spin') b *= 1 + MODEL.dewSpinBoundary * dew

  // Pitch and ground: short boundaries mean more sixes.
  sixShare *= Math.exp(MODEL.groundSix * (69 - pitch.boundary))
  b *= 1 + 0.16 * pitch.flat
  w *= 1 - 0.05 * pitch.flat
  if (bowler.bowlingType === 'pace') w *= 1 + 0.12 * pitch.pace
  if (bowler.bowlingType === 'spin') w *= 1 + 0.12 * pitch.spin

  // Keep room for running between the wickets.
  sixShare = Math.min(0.85, sixShare)
  const fixed = w + b + d
  if (fixed > 0.92) {
    const k = 0.92 / fixed
    w *= k
    b *= k
    d *= k
  }
  const running = 1 - w - b - d
  return {
    wicket: w,
    dot: d,
    one: running * (1 - MODEL.twoShare - MODEL.threeShare),
    two: running * MODEL.twoShare,
    three: running * MODEL.threeShare,
    four: b * (1 - sixShare),
    six: b * sixShare,
  }
}

/** Dismissal mix for this bowler: spinners get more stumpings and lbws. */
export function dismissalWeights(bowler: MatchPlayer): [DismissalKind, number][] {
  const m = MODEL.dismissals
  const spin = bowler.bowlingType === 'spin'
  return [
    ['caught', m.caught],
    ['bowled', m.bowled],
    ['lbw', m.lbw * (spin ? 1.3 : 0.9)],
    ['runOut', m.runOut],
    ['stumped', m.stumped * (spin ? 3 : 0.15)],
    ['hitWicket', m.hitWicket],
  ]
}
