import type { Player } from '../data/types'

/**
 * Role-weighted overall rating, 1–99. First version for data generation and the UI;
 * Phase 3 refines it (form, fitness, traits).
 */
export function overallRating(p: Pick<Player, 'role' | 'ratings'>): number {
  const { batting, bowling, fielding } = p.ratings
  let v: number
  switch (p.role) {
    case 'batter':
      v = 0.88 * batting + 0.12 * fielding
      break
    case 'wicketkeeper':
      v = 0.8 * batting + 0.2 * fielding
      break
    case 'bowler':
      v = 0.88 * bowling + 0.12 * fielding
      break
    case 'allrounder':
      // Rewards being good at both, without beating a specialist at their own skill.
      v = 0.45 * Math.max(batting, bowling) + 0.4 * Math.min(batting, bowling) + 0.15 * fielding + 4
      break
  }
  return Math.max(1, Math.min(99, Math.round(v)))
}
