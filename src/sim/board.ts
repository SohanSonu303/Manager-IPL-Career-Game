/*
 * Career layer: what the board expects, how the manager is judged, and the sack.
 */

export const START_REPUTATION = 35
export const START_CONFIDENCE = 60
/** Board confidence below this after a season review means the sack. */
export const SACK_BELOW = 25

export interface Objective {
  /** Finish in this league position or better. */
  targetPosition: number
  text: string
}

/**
 * The board's target follows how strong the squad looks against the league. T20 is
 * volatile (in testing, the third-strongest squad averaged about 5th, ranging 1st–10th),
 * so targets leave room for a bad bounce.
 */
export function objectiveForRank(strengthRank: number): Objective {
  if (strengthRank <= 2) return { targetPosition: 4, text: 'Reach the playoffs (top four)' }
  if (strengthRank <= 5) return { targetPosition: 6, text: 'Finish in the top six' }
  return { targetPosition: 8, text: 'Finish in the top eight' }
}

/** How far the season went: league only, playoffs, final, or title. */
export type Finish = 'league' | 'playoffs' | 'runnerUp' | 'champion'

export interface Verdict {
  objectiveMet: boolean
  reputationChange: number
  confidenceChange: number
  /** One line from the board. */
  message: string
}

/**
 * Season review. Missing the target costs board confidence; trophies and exceeding the
 * target build reputation, which makes players keener to join.
 */
export function judgeSeason(position: number, finish: Finish, objective: Objective): Verdict {
  const margin = objective.targetPosition - position
  const objectiveMet = margin >= 0
  let confidence = objectiveMet ? 15 + (margin >= 2 ? 10 : 0) : margin >= -2 ? -20 : -35
  let reputation = { champion: 15, runnerUp: 10, playoffs: 6, league: position <= 6 ? 2 : -3 }[
    finish
  ]
  reputation += objectiveMet ? 5 : -5
  if (finish === 'champion') confidence += 20
  const message = objectiveMet
    ? finish === 'champion'
      ? 'Champions! The board is delighted.'
      : 'The board is pleased: you met the objective.'
    : margin >= -2
      ? 'The board is disappointed: you missed the objective.'
      : 'The board is unhappy: you fell well short of the objective.'
  return { objectiveMet, reputationChange: reputation, confidenceChange: confidence, message }
}

export const clampScore = (v: number) => Math.max(0, Math.min(100, v))
