import type { Trait } from '../../data/types'
import type { BowlPlan, DismissalKind, FieldSetting, MatchPlayer, Phase, Pitch } from './types'

/**
 * Tunable constants of the ball model. Base rates come from real IPL data
 * (src/sim/calibration/targets.json); the rest is tuned with the calibration harness
 * (`npm run calibrate`). Change these only together with a harness run.
 */
export const MODEL = {
  /** Legal-ball rates per phase for an average matchup at balanced intent. */
  base: {
    powerplay: { wicket: 0.0372, dot: 0.375, four: 0.188, six: 0.066 },
    middle: { wicket: 0.0482, dot: 0.262, four: 0.11, six: 0.065 },
    death: { wicket: 0.0635, dot: 0.2, four: 0.17, six: 0.122 },
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
  wide: 0.0435,
  noball: 0.0041,
  /** Share of would-be dots that become leg-byes / byes. */
  legbyeOfDot: 0.058,
  byeOfDot: 0.016,
  /**
   * Getting set: a new batter is likelier to get out and finds the boundary less often.
   * Multiplier = set + (new − set) · e^(−balls / settle). Mean-centred by the base rates.
   */
  settle: 8,
  newWicket: 1.3,
  setWicket: 0.86,
  newBoundary: 0.82,
  setBoundary: 1.08,
  /** Pressure from a run of dot balls: extra false-shot risk at six dots in a row. */
  pressureWicket: 0.25,
  /** Rating points a bowler loses per over past two in a spell. */
  fatigue: 3,
  /** Rattled bowler: rating points lost and extra wide risk per boundary past one this over. */
  rattledRating: 3,
  rattledWide: 0.2,
  /** Dropped catches: share of chances put down by a 60-rated fielder (keepers drop fewer). */
  drop: 0.15,
  /** Share of singles that become two through a misfield (60-rated fielder). */
  misfield: 0.02,
  /** Dismissal mix (given a wicket), from real IPL data; adjusted by bowler type. */
  dismissals: {
    caught: 0.739,
    bowled: 0.141,
    lbw: 0.051,
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
}

/** Extra wide risk from the bowling plan, intent and a rattled bowler. */
export function wideFactor({ plan, bowlIntent = 0, hitThisOver = 0 }: BallContext): number {
  return (
    (plan === 'wide' ? 1.6 : 1) *
    (bowlIntent > 0 ? 1.15 : 1) *
    (1 + MODEL.rattledWide * Math.max(0, hitThisOver - 1))
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
export function bowlerPenalty({ spell = 1, hitThisOver = 0 }: BallContext): number {
  return MODEL.fatigue * Math.max(0, spell - 2) + MODEL.rattledRating * Math.max(0, hitThisOver - 1)
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
  } = ctx
  const base = MODEL.base[phase]
  const s = (batter.batting - (bowler.bowling - bowlerPenalty(ctx)) - MODEL.skillCenter) / 10

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
  // Line and length plan. Pace plans only bite for pace bowlers.
  const pace = bowler.bowlingType === 'pace'
  if (plan === 'yorkers' && pace) {
    if (has(bowler, 'yorker-specialist')) {
      b *= 0.85
      w *= 1.1
    } else if (bowler.bowling >= 60) {
      b *= 0.92
      w *= 1.04
    } else b *= 1.05 // missed yorkers become full tosses
    sixShare *= 0.9
  } else if (plan === 'bouncers' && pace) {
    if (has(bowler, 'bouncer-specialist')) w *= 1.15
    else {
      w *= 1.08
      b *= 1.06
    }
    sixShare *= 1.15
  } else if (plan === 'wide') {
    b *= 0.88
    w *= 0.9
    d *= 1.04
  } else if (plan === 'variations') {
    w *= has(bowler, 'mystery-spinner') ? 1.12 : 1.06
    b *= has(batter, 'big-hitter') ? 0.92 : 0.96
  }

  // Pitch.
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
