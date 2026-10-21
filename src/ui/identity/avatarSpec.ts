import type { Nationality } from '@/data/types'
import { createRng, hashString, pickWeighted } from '@/sim/rng'

/** Each tone: base, shadow, highlight. */
export const SKIN_TONES = [
  ['#f6d7c3', '#e3b9a0', '#fde9dc'],
  ['#ecc0a0', '#d6a07e', '#f6d6bf'],
  ['#dca37f', '#c3875f', '#ebbd9c'],
  ['#c68863', '#aa6d49', '#d9a27f'],
  ['#a86d4a', '#8d5636', '#bd8662'],
  ['#8a5636', '#704227', '#a06c4a'],
  ['#6b3f26', '#55301b', '#82543a'],
  ['#4f2d1b', '#3d2113', '#654030'],
] as const

export const HAIR_COLORS = {
  black: '#1d1a19',
  darkBrown: '#3b2a20',
  brown: '#6a4a32',
  lightBrown: '#9a6f45',
  blonde: '#d2ab63',
  auburn: '#94482a',
  grey: '#a3a19d',
} as const
export type HairColor = keyof typeof HAIR_COLORS

export const HAIR_STYLES = [
  'buzz',
  'short',
  'sidepart',
  'quiff',
  'curly',
  'bald',
  'receding',
  'spiky',
  'long',
  'bun',
] as const
export type HairStyle = (typeof HAIR_STYLES)[number]

export const FACIAL_HAIR = ['none', 'stubble', 'moustache', 'goatee', 'short', 'full'] as const
export type FacialHair = (typeof FACIAL_HAIR)[number]

export const BROWS = ['straight', 'arched', 'thick'] as const
export type Brows = (typeof BROWS)[number]

/** Head ellipse radii. */
export const HEAD_SHAPES = {
  round: [21, 23],
  oval: [20, 24],
  long: [18.5, 25],
  wide: [22, 23],
} as const
export type HeadShape = keyof typeof HEAD_SHAPES

export interface AvatarSpec {
  head: HeadShape
  skin: number
  hair: HairStyle
  hairColor: HairColor
  facialHair: FacialHair
  brows: Brows
  smile: boolean
}

type Region = 'southAsia' | 'afghan' | 'anglo' | 'southAfrica' | 'caribbean'

const REGION: Record<Nationality, Region> = {
  IND: 'southAsia',
  SL: 'southAsia',
  BAN: 'southAsia',
  AFG: 'afghan',
  AUS: 'anglo',
  ENG: 'anglo',
  NZ: 'anglo',
  RSA: 'southAfrica',
  WI: 'caribbean',
}

/** Loose regional weighting so squads look plausible; every region keeps some variety. */
const SKIN_WEIGHTS: Record<Region, number[]> = {
  southAsia: [0, 0.5, 2, 4, 4, 3, 1.5, 0.5],
  afghan: [0.5, 2, 4, 3, 1, 0, 0, 0],
  anglo: [4, 4, 2, 1, 0.5, 0.5, 0.5, 0.5],
  southAfrica: [3, 2, 1, 1, 1, 2, 2, 1],
  caribbean: [0, 0, 0, 1, 2, 3, 3, 3],
}

const HAIR_COLOR_WEIGHTS: Record<Region, [HairColor, number][]> = {
  southAsia: [
    ['black', 7],
    ['darkBrown', 3],
  ],
  afghan: [
    ['black', 6],
    ['darkBrown', 4],
  ],
  caribbean: [
    ['black', 8],
    ['darkBrown', 2],
  ],
  anglo: [
    ['black', 1],
    ['darkBrown', 3],
    ['brown', 3],
    ['lightBrown', 2],
    ['blonde', 2],
    ['auburn', 1],
  ],
  southAfrica: [
    ['black', 4],
    ['darkBrown', 3],
    ['brown', 2],
    ['lightBrown', 1],
    ['blonde', 1],
  ],
}

/** Stable avatar for a player: same seed, same face. */
export function avatarSpec(seed: string, nationality: Nationality, age = 26): AvatarSpec {
  const rng = createRng(hashString(`avatar:${seed}`))
  const region = REGION[nationality]
  const skin = pickWeighted(
    rng,
    SKIN_WEIGHTS[region].map((w, i) => [i, w] as const),
  )
  let hairColor = pickWeighted(rng, HAIR_COLOR_WEIGHTS[region])
  if (age >= 36 && rng() < 0.45) hairColor = 'grey'
  const hair = pickWeighted<HairStyle>(rng, [
    ['buzz', 2],
    ['short', 3],
    ['sidepart', 2],
    ['quiff', 2],
    ['curly', region === 'caribbean' || region === 'southAfrica' ? 3 : 1],
    ['bald', age >= 32 ? 1 : 0.2],
    ['receding', age >= 30 ? 1.5 : 0.3],
    ['spiky', 1],
    ['long', 0.6],
    ['bun', 0.5],
  ])
  const facialHair = pickWeighted<FacialHair>(rng, [
    ['none', age < 20 ? 6 : 3],
    ['stubble', 2],
    ['moustache', 0.8],
    ['goatee', 1],
    ['short', age < 20 ? 0.3 : 2],
    ['full', age < 20 ? 0 : region === 'afghan' ? 4 : 1.2],
  ])
  const heads = Object.keys(HEAD_SHAPES) as HeadShape[]
  return {
    head: heads[Math.floor(rng() * heads.length)] as HeadShape,
    skin,
    hair,
    hairColor,
    facialHair,
    brows: BROWS[Math.floor(rng() * BROWS.length)] as Brows,
    smile: rng() < 0.6,
  }
}

export type RingStatus = 'good' | 'ok' | 'poor'

/** Map a 0–100 form or fitness value to a ring color band. */
export function ringStatus(value: number): RingStatus {
  if (value >= 70) return 'good'
  if (value >= 40) return 'ok'
  return 'poor'
}
