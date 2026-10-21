import type { Trait } from '../../data/types'
import type { DismissalKind, MatchPlayer, Phase, Pitch } from './types'

/**
 * Tunable constants of the ball model. Base rates come from real IPL data
 * (src/sim/calibration/targets.json); the rest is tuned with the calibration harness
 * (`npm run calibrate`). Change these only together with a harness run.
 */
export const MODEL = {
  /** Legal-ball rates per phase for an average matchup at balanced intent. */
  base: {
    powerplay: { wicket: 0.042, dot: 0.375, four: 0.186, six: 0.064 },
    middle: { wicket: 0.046, dot: 0.268, four: 0.105, six: 0.06 },
    death: { wicket: 0.056, dot: 0.212, four: 0.143, six: 0.098 },
  } satisfies Record<Phase, { wicket: number; dot: number; four: number; six: number }>,
  /** Skill = (batting − bowling − center) / 10. Center = the average matchup. */
  skillCenter: -3,
  /** Exponential sensitivity of each outcome to skill (per 10 rating points). */
  skill: { wicket: 0.22, boundary: 0.14, dot: 0.08 },
  /** Exponential sensitivity to intent (per step from balanced, −2…+2). */
  intent: { wicket: 0.24, boundary: 0.2, six: 0.12, dot: -0.14 },
  /** Of the non-boundary runs: share of twos and threes (rest are singles). */
  twoShare: 0.134,
  threeShare: 0.004,
  /** Per delivery. */
  wide: 0.046,
  noball: 0.0041,
  /** Share of would-be dots that become leg-byes / byes. */
  legbyeOfDot: 0.058,
  byeOfDot: 0.016,
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
}

const has = (p: MatchPlayer, t: Trait) => p.traits.includes(t)

/** Probabilities of each outcome of a legal delivery. Sums to 1. */
export function ballOdds({ batter, bowler, phase, pitch, intent }: BallContext): Odds {
  const base = MODEL.base[phase]
  const s = (batter.batting - bowler.bowling - MODEL.skillCenter) / 10

  let w = base.wicket * Math.exp(-MODEL.skill.wicket * s + MODEL.intent.wicket * intent)
  let b =
    (base.four + base.six) * Math.exp(MODEL.skill.boundary * s + MODEL.intent.boundary * intent)
  let sixShare = (base.six / (base.four + base.six)) * Math.exp(MODEL.intent.six * intent)
  let d = base.dot * Math.exp(-MODEL.skill.dot * s + MODEL.intent.dot * intent)

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

  // Pitch.
  b *= 1 + 0.1 * pitch.flat
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
