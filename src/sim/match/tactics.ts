import {
  aggressionValue,
  phaseOf,
  type InningsState,
  type MatchPlayer,
  type MatchState,
  type Phase,
} from './types'

export const MAX_OVERS_PER_BOWLER = 4

const oversBy = (inn: InningsState, id: string) =>
  Math.floor((inn.bowling[id]?.legalBalls ?? 0) / 6)

function phaseFit(p: MatchPlayer, phase: Phase): number {
  const pace = p.bowlingType === 'pace'
  const spin = p.bowlingType === 'spin'
  switch (phase) {
    case 'powerplay':
      return (pace ? 3 : 0) + (p.traits.includes('powerplay-specialist') ? 6 : 0)
    case 'middle':
      return spin ? 5 : 0
    case 'death':
      return (pace ? 4 : 0) + (spin ? -4 : 0) + (p.traits.includes('death-bowler') ? 8 : 0)
  }
}

/**
 * Can the remaining overs still be bowled with these quotas if `last` bowled the
 * previous over? (No bowler may bowl two overs in a row.)
 */
function feasible(quotas: Map<string, number>, remaining: number, last: string): boolean {
  let total = 0
  for (const [id, q] of quotas) {
    total += q
    if (q > Math.ceil(remaining / 2)) return false
    if (id === last && q > Math.floor(remaining / 2)) return false
  }
  return total >= remaining
}

/**
 * Pick the bowler for the next over. Uses the side's plan when it is valid; otherwise
 * the AI: best five bowlers by rating, matched to the phase, keeping two overs of the
 * best death options for the end, and never painting itself into a corner.
 */
export function chooseBowler(state: MatchState, inn: InningsState): string {
  const sheet = state.sheets[inn.bowlingTeamId]
  if (!sheet) throw new Error(`No team sheet for ${inn.bowlingTeamId}`)
  const over = Math.floor(inn.legalBalls / 6)
  const maxPer = inn.maxOvers === 1 ? 1 : MAX_OVERS_PER_BOWLER
  const player = (id: string) => state.players[id] as MatchPlayer
  const eligible = (id: string) =>
    id !== sheet.keeperId && id !== inn.lastOverBowlerId && oversBy(inn, id) < maxPer

  const planned = sheet.bowlingPlan?.[over]
  if (planned && sheet.battingOrder.includes(planned) && eligible(planned)) return planned

  const options = sheet.battingOrder
    .filter((id) => id !== sheet.keeperId)
    .sort((a, b) => player(b).bowling - player(a).bowling)

  if (inn.maxOvers === 1) {
    const best = options.find(eligible)
    if (!best) throw new Error('No bowler available for the super over')
    return best
  }

  // Bowling unit: top five, plus anyone who has already bowled, plus more if short.
  const remaining = inn.maxOvers - over
  const unit = new Set(options.slice(0, 5).concat(options.filter((id) => oversBy(inn, id) > 0)))
  const quota = (id: string) => maxPer - oversBy(inn, id)
  for (const id of options) {
    const total = [...unit].reduce((s, u) => s + quota(u), 0)
    if (total >= remaining) break
    unit.add(id)
  }

  const phase = phaseOf(over)
  const deathOptions = [...unit]
    .sort(
      (a, b) =>
        player(b).bowling +
        phaseFit(player(b), 'death') -
        (player(a).bowling + phaseFit(player(a), 'death')),
    )
    .slice(0, 2)

  const scored = [...unit]
    .filter(eligible)
    .map((id) => {
      const p = player(id)
      let score = p.bowling + phaseFit(p, phase)
      if (phase !== 'death' && deathOptions.includes(id) && quota(id) <= 2) score -= 15
      return { id, score }
    })
    .sort((a, b) => b.score - a.score)

  for (const { id } of scored) {
    const quotas = new Map([...unit].map((u) => [u, quota(u) - (u === id ? 1 : 0)]))
    if (feasible(quotas, remaining - 1, id)) return id
  }
  // A short side may run out of legal options: relax the over limit, then the
  // no-consecutive rule, rather than abandon the match.
  const fallback =
    scored[0]?.id ??
    options.find(eligible) ??
    options.find((id) => id !== sheet.keeperId && id !== inn.lastOverBowlerId) ??
    options[0]
  if (!fallback) throw new Error('No bowler at all')
  return fallback
}

/**
 * Batting intent (−2…+2) for this ball. A human side uses its settings; the AI reads the
 * situation: phase, wickets in hand and, when chasing, the required rate.
 */
export function batterIntent(state: MatchState, inn: InningsState, batterId: string): number {
  const sheet = state.sheets[inn.battingTeamId]
  if (!sheet) throw new Error(`No team sheet for ${inn.battingTeamId}`)
  let a: number
  if (!sheet.ai) {
    a = aggressionValue(sheet.intent[batterId] ?? sheet.aggression)
  } else {
    // 0 = how a typical side bats in this phase (the base rates already include that);
    // the AI only leans either way when the situation calls for it.
    const over = Math.floor(inn.legalBalls / 6)
    const phase = inn.maxOvers === 1 ? 'death' : phaseOf(over)
    const w = inn.wickets
    a = 0
    if (phase === 'death' && w <= 4) a = 1
    if (phase === 'middle' && over >= 12 && w <= 3) a = 1
    if (inn.maxOvers === 1) a = 2
    if (inn.target !== null) {
      const ballsLeft = inn.maxOvers * 6 - inn.legalBalls
      const rrr = ((inn.target - inn.runs) / Math.max(1, ballsLeft)) * 6
      if (rrr > 14) a = 2
      else if (rrr > 11.5) a = Math.max(a, 1)
      else if (rrr < 6) a = -1
      else if (rrr < 8) a = Math.min(a, 0)
    }
    if (w >= 7 && phase !== 'death') a -= 1
    if (state.players[batterId]?.traits.includes('anchor')) a -= 1
  }
  if (inn.freeHitNext) a += 1
  return Math.max(-2, Math.min(2, a))
}
