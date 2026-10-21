import { createMatch, type Match } from './engine'
import { autoTeamSheet, impactSubs, pitchFor, toMatchPlayer, type Selectable } from './selection'
import type { TeamSheet } from './types'

export interface FixtureInput {
  seed: number
  homeId: string
  awayId: string
  squads: Record<string, Selectable[]>
  /** Sheets chosen by a manager; any side without one gets an AI sheet. */
  sheets?: Partial<Record<string, TeamSheet>>
}

/** Build a ready-to-play match from two squads: sheets, today's ratings and the home pitch. */
export function setupMatch({ seed, homeId, awayId, squads, sheets = {} }: FixtureInput): Match {
  // Every side names its Impact Player substitutes from the rest of the squad.
  const sheetFor = (id: string): TeamSheet => {
    const sheet = sheets[id] ?? autoTeamSheet(id, squads[id] ?? [], true)
    if (sheet.impact) return { ...sheet, impact: { ...sheet.impact, used: null } }
    return {
      ...sheet,
      impact: { subs: impactSubs(squads[id] ?? [], sheet.battingOrder), used: null },
    }
  }
  const home = sheetFor(homeId)
  const away = sheetFor(awayId)
  const all = [...(squads[homeId] ?? []), ...(squads[awayId] ?? [])]
  const picked = new Set([
    ...home.battingOrder,
    ...away.battingOrder,
    ...(home.impact?.subs ?? []),
    ...(away.impact?.subs ?? []),
  ])
  return createMatch({
    seed,
    players: all.filter((p) => picked.has(p.id)).map(toMatchPlayer),
    sheets: [home, away],
    pitch: pitchFor(homeId),
  })
}
