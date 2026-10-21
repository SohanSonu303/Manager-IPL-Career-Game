import type { Trait } from '../../data/types'
import { pickWeighted, type Rng } from '../rng'
import type { BowlPlan, BowlingDelivery, MatchPlayer, Phase } from './types'

/*
 * The delivery model. Each ball the bowler *means* to bowl a length (from the plan),
 * then *executes* it or misses: a missed yorker is a full toss, a missed bouncer a long
 * hop. The ball's odds then depend on what was actually bowled, so a good death bowler
 * is worth his place because his yorkers land, not because of a flat multiplier.
 */

/** Multipliers on wicket, boundary, six share and dot rates for each delivery bowled. */
export const DELIVERY_EFFECT: Record<
  BowlingDelivery,
  { wicket: number; boundary: number; six: number; dot: number }
> = {
  yorker: { wicket: 1.25, boundary: 0.5, six: 0.7, dot: 1.25 },
  full: { wicket: 0.95, boundary: 1.25, six: 1.05, dot: 0.85 },
  good: { wicket: 1.05, boundary: 0.85, six: 0.9, dot: 1.1 },
  short: { wicket: 1, boundary: 1, six: 1.15, dot: 1 },
  bouncer: { wicket: 1.25, boundary: 0.85, six: 1.35, dot: 1.2 },
  slower: { wicket: 1.2, boundary: 0.95, six: 1, dot: 1.05 },
  wideline: { wicket: 0.9, boundary: 0.75, six: 0.6, dot: 1.15 },
  fulltoss: { wicket: 0.7, boundary: 1.8, six: 1.2, dot: 0.6 },
  longhop: { wicket: 0.75, boundary: 1.7, six: 1.15, dot: 0.65 },
}

type Mix = readonly (readonly [BowlingDelivery, number])[]

const STOCK_PACE: Mix = [
  ['good', 0.45],
  ['full', 0.22],
  ['short', 0.2],
  ['yorker', 0.06],
  ['bouncer', 0.07],
]
const STOCK_SPIN: Mix = [
  ['good', 0.55],
  ['full', 0.3],
  ['short', 0.1],
  ['slower', 0.05],
]

/** What the bowler means to bowl under this plan. Pace plans only apply to pace bowlers. */
export function intendedMix(plan: BowlPlan, bowler: Pick<MatchPlayer, 'bowlingType'>): Mix {
  const pace = bowler.bowlingType === 'pace'
  switch (plan) {
    case 'yorkers':
      return pace
        ? [
            ['yorker', 0.65],
            ['good', 0.15],
            ['full', 0.1],
            ['slower', 0.1],
          ]
        : STOCK_SPIN
    case 'bouncers':
      return pace
        ? [
            ['bouncer', 0.45],
            ['short', 0.3],
            ['good', 0.2],
            ['yorker', 0.05],
          ]
        : STOCK_SPIN
    case 'wide':
      return [
        ['wideline', 0.6],
        ['good', 0.2],
        ['yorker', 0.1],
        ['full', 0.1],
      ]
    case 'variations':
      return pace
        ? [
            ['slower', 0.4],
            ['good', 0.3],
            ['yorker', 0.1],
            ['full', 0.2],
          ]
        : [
            ['slower', 0.45],
            ['good', 0.35],
            ['full', 0.2],
          ]
    default:
      return pace ? STOCK_PACE : STOCK_SPIN
  }
}

const BASE_EXECUTION: Record<BowlingDelivery, number> = {
  good: 0.85,
  full: 0.8,
  short: 0.8,
  yorker: 0.55,
  bouncer: 0.7,
  slower: 0.65,
  wideline: 0.7,
  fulltoss: 1,
  longhop: 1,
}

export interface ExecutionContext {
  bowler: Pick<MatchPlayer, 'bowling' | 'bowlingType' | 'traits'>
  phase: Phase
  /** Rating points lost to fatigue or a bad over. */
  penalty?: number
  /** 0…1 dew on the ball (second innings only). */
  dew?: number
}

/** Chance the bowler lands what he meant to bowl. */
export function executionChance(intended: BowlingDelivery, c: ExecutionContext): number {
  const has = (t: Trait) => c.bowler.traits.includes(t)
  let p = BASE_EXECUTION[intended] + (c.bowler.bowling - 60) * 0.006 - (c.penalty ?? 0) * 0.01
  if (intended === 'yorker' && has('yorker-specialist')) p += 0.25
  if (intended === 'yorker' && has('death-bowler')) p += 0.08
  if (intended === 'bouncer' && has('bouncer-specialist')) p += 0.2
  if (intended === 'slower' && has('mystery-spinner')) p += 0.15
  if (has('economical')) p += 0.05
  const dew = c.dew ?? 0
  p -= dew * (c.bowler.bowlingType === 'spin' ? 0.05 : 0.02)
  return Math.min(0.97, Math.max(0.2, p))
}

/** What a missed delivery turns into. */
export const MISSED_AS: Record<BowlingDelivery, Mix> = {
  yorker: [
    ['fulltoss', 0.6],
    ['full', 0.4],
  ],
  full: [
    ['fulltoss', 0.5],
    ['good', 0.5],
  ],
  good: [
    ['full', 0.6],
    ['short', 0.4],
  ],
  short: [
    ['longhop', 0.7],
    ['good', 0.3],
  ],
  bouncer: [
    ['longhop', 0.7],
    ['short', 0.3],
  ],
  slower: [
    ['fulltoss', 0.4],
    ['longhop', 0.3],
    ['full', 0.3],
  ],
  wideline: [
    ['full', 0.6],
    ['longhop', 0.4],
  ],
  fulltoss: [['fulltoss', 1]],
  longhop: [['longhop', 1]],
}

export interface Delivery {
  intended: BowlingDelivery
  actual: BowlingDelivery
}

export function pickDelivery(rng: Rng, plan: BowlPlan, c: ExecutionContext): Delivery {
  const intended = pickWeighted(rng, intendedMix(plan, c.bowler))
  const actual =
    rng() < executionChance(intended, c) ? intended : pickWeighted(rng, MISSED_AS[intended])
  return { intended, actual }
}

type Effect = (typeof DELIVERY_EFFECT)[BowlingDelivery]

/** Average effect of a plan over what is meant and what actually lands. */
export function expectedEffect(plan: BowlPlan, c: ExecutionContext): Effect {
  const out = { wicket: 0, boundary: 0, six: 0, dot: 0 }
  const add = (d: BowlingDelivery, w: number) => {
    const e = DELIVERY_EFFECT[d]
    out.wicket += e.wicket * w
    out.boundary += e.boundary * w
    out.six += e.six * w
    out.dot += e.dot * w
  }
  for (const [d, w] of intendedMix(plan, c.bowler)) {
    const p = executionChance(d, c)
    add(d, w * p)
    for (const [m, mw] of MISSED_AS[d]) add(m, w * (1 - p) * mw)
  }
  return out
}

/** Stock bowling by an average bowler: the effects are scaled so this comes out at 1. */
const norm = (bowlingType: 'pace' | 'spin') =>
  expectedEffect('stock', { bowler: { bowling: 60, bowlingType, traits: [] }, phase: 'middle' })
export const STOCK_NORM = { pace: norm('pace'), spin: norm('spin') }

/** Effect of one delivery (or a plan's average), relative to average stock bowling. */
export function deliveryEffect(
  bowlingType: 'pace' | 'spin' | null,
  e: Effect,
): { wicket: number; boundary: number; six: number; dot: number } {
  const n = STOCK_NORM[bowlingType === 'spin' ? 'spin' : 'pace']
  return {
    wicket: e.wicket / n.wicket,
    boundary: e.boundary / n.boundary,
    six: e.six / n.six,
    dot: e.dot / n.dot,
  }
}
