import type { BowlingType, Role, Trait } from '../../data/types'

/** Batting intent, from blocking it out to swinging at everything. */
export const AGGRESSION = ['defend', 'rotate', 'balanced', 'attack', 'allout'] as const
export type Aggression = (typeof AGGRESSION)[number]
/** Numeric intent: defend = -2 … allout = +2. */
export const aggressionValue = (a: Aggression): number => AGGRESSION.indexOf(a) - 2

export type Phase = 'powerplay' | 'middle' | 'death'
export const phaseOf = (over: number): Phase =>
  over < 6 ? 'powerplay' : over < 15 ? 'middle' : 'death'

export type DismissalKind = 'bowled' | 'caught' | 'lbw' | 'runOut' | 'stumped' | 'hitWicket'
export type ExtraKind = 'wide' | 'noball' | 'bye' | 'legbye'

/** Everything the sim needs about a player for one match (ability already adjusted). */
export interface MatchPlayer {
  id: string
  name: string
  role: Role
  bowlingType: BowlingType | null
  traits: Trait[]
  overseas: boolean
  /** Effective ratings for today (form and fitness applied). */
  batting: number
  bowling: number
  fielding: number
}

/** Match inputs for one side (Phase 5). */
export interface TeamSheet {
  teamId: string
  /** 11 player ids in batting order. */
  battingOrder: string[]
  keeperId: string
  /** The captain (shown on the sheet; lifts the XI's morale a little). */
  captainId?: string
  /** Default intent for every batter; overridden per batter by `intent`. */
  aggression: Aggression
  intent: Record<string, Aggression>
  /** Optional planned bowler per over (20 entries); null or missing = AI choice. */
  bowlingPlan?: (string | null)[]
  /** Bowling tactics in force (set live by the manager, or per over by the AI). */
  field: FieldSetting
  bowlIntent: BowlIntent
  bowlPlan: BowlPlan
  /** True if the AI sets this side's intent and bowling. */
  ai: boolean
  /** Impact Player substitutes (missing = none named). */
  impact?: ImpactState
}

/** Field placement: more catchers in the ring, or more boundary riders. */
export const FIELD_SETTINGS = ['attacking', 'balanced', 'defensive'] as const
export type FieldSetting = (typeof FIELD_SETTINGS)[number]

/** How hard the bowler tries to take wickets versus keeping it tight. */
export const BOWL_INTENTS = ['contain', 'balanced', 'attack'] as const
export type BowlIntent = (typeof BOWL_INTENTS)[number]
export const bowlIntentValue = (b: BowlIntent): number => BOWL_INTENTS.indexOf(b) - 1

/** What a ball actually was: a planned length, or what a missed one became. */
export const BOWLING_DELIVERIES = [
  'yorker',
  'full',
  'good',
  'short',
  'bouncer',
  'slower',
  'wideline',
  'fulltoss',
  'longhop',
] as const
export type BowlingDelivery = (typeof BOWLING_DELIVERIES)[number]

/** The batter's stroke, for commentary and the wagon wheel. */
export const SHOT_KINDS = [
  'defend',
  'drive',
  'loft',
  'cut',
  'pull',
  'hook',
  'sweep',
  'flick',
  'glance',
  'edge',
  'scoop',
  'slog',
  'push',
] as const
export type ShotKind = (typeof SHOT_KINDS)[number]

/** Impact Player: named substitutes, one of whom may replace a player once. */
export interface ImpactState {
  subs: string[]
  used: { outId: string; inId: string; innings: number; over: number } | null
}

/** Line and length plan for the over. */
export const BOWL_PLANS = ['stock', 'yorkers', 'bouncers', 'wide', 'variations'] as const
export type BowlPlan = (typeof BOWL_PLANS)[number]

export interface Pitch {
  /** -1..1: helps pace bowlers. */
  pace: number
  /** -1..1: helps spinners. */
  spin: number
  /** -1..1: easy batting, more boundaries. */
  flat: number
  /** Boundary distance in metres. */
  boundary: number
}

/** One delivery. The scoreboard, commentary and field view all read these. */
export interface BallEvent {
  /** 0 = first innings, 1 = second, 2+ = super overs. */
  innings: number
  /** 0-based over. */
  over: number
  /** Legal ball number in the over (1–6); for a wide or no-ball, the ball it precedes. */
  ball: number
  batterId: string
  nonStrikerId: string
  bowlerId: string
  /** Runs off the bat. */
  runs: number
  extra: { kind: ExtraKind; runs: number } | null
  /** All runs from this delivery. */
  total: number
  legal: boolean
  freeHit: boolean
  wicket: { kind: DismissalKind; playerOutId: string; fielderId: string | null } | null
  /**
   * Where the ball went. `angle` is degrees clockwise from straight down the ground
   * (0 = straight, 90 = square on the off side, 180 = behind the keeper, 270 = square
   * leg). `distance` in metres from the batter. Null when the ball was missed.
   */
  shot: { angle: number; distance: number; aerial: boolean; kind?: ShotKind } | null
  /** What the bowler meant to bowl and what he actually bowled (legal balls). */
  delivery?: { intended: BowlingDelivery; actual: BowlingDelivery } | null
  /** A DRS review on this ball: who asked, the umpire's call, and whether it was overturned. */
  review?: {
    teamId: string
    call: 'out' | 'notout'
    overturned: boolean
    /** Upheld on umpire's call: the side keeps its review. */
    umpiresCall?: boolean
  } | null
  boundary: 4 | 6 | null
  /** A dropped catch or a misfield on this ball. */
  fumble?: { kind: 'drop' | 'misfield'; fielderId: string } | null
  /** Key for commentary templates, e.g. "six.pull", "four.drive", "wicket.bowled", "wide". */
  commentary: string
  /** Score after this delivery. */
  score: { runs: number; wickets: number; legalBalls: number }
}

export interface BatterLine {
  runs: number
  balls: number
  fours: number
  sixes: number
  out: BallEvent['wicket']
}

export interface BowlerLine {
  legalBalls: number
  runs: number
  wickets: number
  dots: number
  wides: number
  noballs: number
}

export interface InningsState {
  index: number
  battingTeamId: string
  bowlingTeamId: string
  /** Legal overs allowed (20, or 1 in a super over). */
  maxOvers: number
  /** Wickets that end the innings (10, or 2 in a super over). */
  maxWickets: number
  /** Runs needed to win, when chasing. */
  target: number | null
  runs: number
  wickets: number
  legalBalls: number
  extras: number
  strikerId: string
  nonStrikerId: string
  /** Batters still to come, in order. */
  toCome: string[]
  bowlerId: string | null
  lastOverBowlerId: string | null
  freeHitNext: boolean
  batting: Record<string, BatterLine>
  bowling: Record<string, BowlerLine>
  /** Batters in the order they came in. */
  battedOrder: string[]
  events: BallEvent[]
  complete: boolean
  /** Legal dot balls in a row (pressure). */
  dotRun?: number
  /** Consecutive overs in the current bowler's spell, this over included. */
  spell?: number
  /** Boundaries conceded in the current over. */
  overBoundaries?: number
  /** DRS reviews left per side this innings. */
  reviews?: Record<string, number>
  /** The current partnership: runs and legal balls since the last wicket. */
  stand?: { runs: number; balls: number }
  /** Runs conceded in the current over. */
  overRuns?: number
  /** Bowlers whose last over went for 15 or more. */
  expensive?: Record<string, boolean>
}

export interface MatchResult {
  winnerId: string | null
  /** e.g. "won by 23 runs", "won by 6 wickets", "won the super over". */
  margin: string
  kind: 'runs' | 'wickets' | 'superOver' | 'tie'
}

export interface MatchState {
  seed: number
  pitch: Pitch
  players: Record<string, MatchPlayer>
  sheets: Record<string, TeamSheet>
  /** Team ids in batting order for the first innings. */
  order: [string, string]
  /** `pending`: a manager won the toss and has not chosen yet (the AI's call stands if he sims on). */
  toss: { winnerId: string; decision: 'bat' | 'field'; pending?: boolean }
  innings: InningsState[]
  result: MatchResult | null
  /** Match conditions: 0…1 dew expected in the second innings. */
  conditions?: { dew: number }
  /** A manager is watching: reviews wait for his call (see `pendingReview`). */
  interactive?: boolean
  /** A decision the manager may review before the ball is settled. */
  pendingReview?: PendingReview | null
  /** Strategic timeouts taken, per side: the over taken and legal balls of refocus left. */
  timeouts?: Record<string, { innings: number; over: number; boostBalls: number }>
}

/** How a call looks to the side that may review it. */
export type ReviewFeel = 'confident' | 'unsure' | 'doubtful'

/** A ball bowled but not yet settled, waiting for a DRS call. */
export interface PendingReview {
  /** The side that may review. */
  teamId: string
  /** The umpire's call. */
  call: 'out' | 'notout'
  kind: 'lbw' | 'caught'
  batterId: string
  bowlerId: string
  /** The truth the ball-tracker would show. */
  truthOut: boolean
  /**
   * What the players' reactions say (all a reviewing side can go on). A wrong decision
   * usually looks it; a right one only sometimes does.
   */
  feel: ReviewFeel
  /** Marginal on the ball-tracker: if reviewed, the decision stands but the review is kept. */
  umpiresCall: boolean
  /** The AI's dice for its review decision (drawn either way, so watched and simmed agree). */
  roll: number
  /** The ball as it stands if not reviewed (internal to the engine). */
  draft: unknown
}
