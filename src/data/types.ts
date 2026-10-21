/** Data schemas shared by the sim, the UI and the data generator. Types only, no DOM. */

export const ROLES = ['batter', 'wicketkeeper', 'allrounder', 'bowler'] as const
export type Role = (typeof ROLES)[number]

export const BOWLING_TYPES = ['pace', 'spin'] as const
export type BowlingType = (typeof BOWLING_TYPES)[number]

export const TRAITS = [
  'anchor',
  'big-hitter',
  'finisher',
  'poor-vs-spin',
  'powerplay-specialist',
  'death-bowler',
] as const
export type Trait = (typeof TRAITS)[number]

export const NATIONALITIES = ['IND', 'AUS', 'ENG', 'RSA', 'NZ', 'WI', 'AFG', 'SL', 'BAN'] as const
export type Nationality = (typeof NATIONALITIES)[number]

/** All ratings are 1–99. */
export interface Ratings {
  batting: number
  bowling: number
  fielding: number
}

export interface Contract {
  /** Yearly salary in lakhs. */
  salary: number
  /** Seasons left, including the current one. */
  years: number
}

export interface Player {
  /** Short stable id (hash of the name). */
  id: string
  /** Real player name. */
  name: string
  nationality: Nationality
  age: number
  role: Role
  bowlingType: BowlingType | null
  ratings: Ratings
  /** Ceiling for the overall rating; growth stops here. 1–99. */
  potential: number
  traits: Trait[]
  overseas: boolean
  /** Null for free agents. */
  teamId: string | null
  /** Null for free agents. */
  contract: Contract | null
}

export const CREST_SHAPES = ['shield', 'circle', 'hexagon', 'diamond', 'pennant'] as const
export type CrestShape = (typeof CREST_SHAPES)[number]

export const CREST_GLYPHS = [
  'star',
  'bolt',
  'wave',
  'peak',
  'wing',
  'sun',
  'flame',
  'leaf',
] as const
export type CrestGlyph = (typeof CREST_GLYPHS)[number]

export interface CrestSpec {
  shape: CrestShape
  glyph: CrestGlyph
  /** Diagonal band in the secondary color behind the glyph. */
  band: boolean
}

export interface Team {
  id: string
  /** Home city (venue). */
  city: string
  /** Full display name, e.g. "Sunrisers Falcons". */
  name: string
  /** Three-letter code for scorebugs. */
  short: string
  colors: { primary: string; secondary: string }
  ground: string
  crest: CrestSpec
}
