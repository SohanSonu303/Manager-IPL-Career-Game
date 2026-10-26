import { isMegaYear } from './auction'
import { agePlayer, type Career, type CareerPlayer } from './career'
import {
  agentOf,
  askingPrice,
  preferredYears,
  retirementChance,
  retires,
  safetyNet,
  squadOf,
  talksWith,
  type Agent,
} from './market'

/*
 * What happens to the manager's squad when the season ends, worked out in advance from
 * the same seeded rolls the rollover uses, so the "Before next season" screen is never
 * wrong about who leaves.
 */

/**
 * Will he retire after this season? Exact once the season is over ('retiring'); during
 * the season the roll can still change with his form, so it is a likelihood.
 */
export type RetireOutlook = 'retiring' | 'likely' | 'possible' | null

export function retirementOutlook(career: Career, p: CareerPlayer): RetireOutlook {
  const year = career.calendar.year
  const aged = agePlayer(p, career.seed, year)
  if (retirementChance(aged) <= 0) return null
  const yes = retires(career.seed, year, aged)
  if (career.season.review) return yes ? 'retiring' : null
  return yes ? 'likely' : 'possible'
}

export type ContractStatus = 'open' | 'letGo' | 'walkedAway' | 'retiring'

export interface ExpiringRow {
  p: CareerPlayer
  status: ContractStatus
  /** His ask for his preferred length. */
  ask: number
  years: number
  agent: Agent
  /** Kept for one season by the squad-minimum safety net. */
  rescued: boolean
}

export interface ContractOutlook {
  /** The season ends in a mega auction: only retentions stay. */
  megaYear: boolean
  /** Players in their final year (renew or lose them). */
  expiring: ExpiringRow[]
  /** Players who may retire (with how sure that is). */
  retiring: { p: CareerPlayer; outlook: Exclude<RetireOutlook, null> }[]
  /** Renewed this season. */
  renewed: CareerPlayer[]
  /** Who goes when the season turns over, as things stand. */
  leaving: CareerPlayer[]
  /** Final-year players nobody has decided about yet. */
  undecided: CareerPlayer[]
  squadNow: number
  squadAfter: number
  keepersAfter: number
}

export function contractOutlook(career: Career, teamIds: string[]): ContractOutlook {
  const me = career.manager.teamId
  const year = career.calendar.year
  const squad = squadOf(career.players, me)
  const outlook = new Map(squad.map((p) => [p.id, retirementOutlook(career, p)]))
  const certain = (p: CareerPlayer) => {
    const o = outlook.get(p.id)
    return o === 'retiring' || o === 'likely'
  }
  // The squad as the rollover will see it: a year used, retirees gone.
  const next = squad
    .filter((p) => !certain(p))
    .map((p) => ({ ...p, contract: p.contract && { ...p.contract, years: p.contract.years - 1 } }))
  const rescue = safetyNet(next)
  const expiring: ExpiringRow[] = squad
    .filter((p) => (p.contract?.years ?? 0) <= 1)
    .map((p) => {
      const t = talksWith(career, p.id)
      const years = preferredYears(p.age)
      return {
        p,
        status: certain(p) ? 'retiring' : t.walkedAway ? 'walkedAway' : t.letGo ? 'letGo' : 'open',
        ask: askingPrice(career, p, years, teamIds),
        years,
        agent: agentOf(career, p),
        rescued: rescue.has(p.id),
      }
    })
  const renewedIds = new Set(
    career.market.log
      .filter((e) => e.year === year && e.kind === 'renewed' && e.teamId === me)
      .map((e) => e.playerId),
  )
  const leaving = [
    ...squad.filter(certain),
    ...expiring.filter((r) => r.status !== 'retiring' && !r.rescued).map((r) => r.p),
  ]
  const after = squad.filter((p) => !leaving.includes(p))
  return {
    megaYear: isMegaYear(year),
    expiring,
    retiring: squad.flatMap((p) => {
      const o = outlook.get(p.id)
      return o ? [{ p, outlook: o }] : []
    }),
    renewed: squad.filter((p) => renewedIds.has(p.id)),
    leaving,
    undecided: expiring.filter((r) => r.status === 'open').map((r) => r.p),
    squadNow: squad.length,
    squadAfter: after.length,
    keepersAfter: after.filter((p) => p.role === 'wicketkeeper').length,
  }
}
