import { isMegaYear } from './auction'
import { agePlayer, type Career, type CareerPlayer } from './career'
import { autoPickXI } from './match/selection'
import { overallRating } from './player'
import {
  agentOf,
  askingPrice,
  makeOffer,
  preferredYears,
  retirementChance,
  retires,
  safetyNet,
  setLetGo,
  SQUAD_MIN,
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

// --- The PA's renewals --------------------------------------------------------------

export interface RenewalPlanRow {
  p: CareerPlayer
  keep: boolean
  /** Why, in a few words. */
  reason: string
  years: number
  /** His ask for that length. */
  ask: number
}

/**
 * What the PA would do with every undecided final-year player: keep the XI regulars,
 * young players with room to grow, cover for thin roles and solid squad players; let
 * the rest go, but never below the squad minimum.
 */
export function renewalPlan(career: Career, teamIds: string[]): RenewalPlanRow[] {
  const o = contractOutlook(career, teamIds)
  const open = o.expiring.filter((r) => r.status === 'open')
  if (!open.length) return []
  const me = career.manager.teamId
  const squad = squadOf(career.players, me)
  const xi = new Set(autoPickXI(squad).map((p) => p.id))
  const openIds = new Set(open.map((r) => r.p.id))
  // Everyone else who stays next season, to see which roles would run thin.
  const staying = squad.filter((p) => !o.leaving.includes(p) && !openIds.has(p.id))
  const median = [...squad.map((p) => overallRating(p))].sort((a, b) => a - b)[
    Math.floor(squad.length / 2)
  ] as number
  const rows: RenewalPlanRow[] = open.map((r) => {
    const { p } = r
    const overall = overallRating(p)
    const base = { p, years: r.years, ask: r.ask }
    if (xi.has(p.id)) return { ...base, keep: true, reason: 'A regular in your XI' }
    if (p.age <= 25 && p.potential - overall >= 6)
      return { ...base, keep: true, reason: 'Young, with room to grow' }
    const sameRole = staying.filter((q) => q.role === p.role).length
    const minimum = { wicketkeeper: 2, bowler: 5, allrounder: 3, batter: 4 }[p.role]
    if (sameRole < minimum)
      return { ...base, keep: true, reason: `You'd be short of ${p.role}s without him` }
    if (overall >= median && p.age <= 32)
      return { ...base, keep: true, reason: 'A solid squad player' }
    return {
      ...base,
      keep: false,
      reason:
        p.age >= 33 ? 'Getting on, and not in your XI' : 'Not in your plans, and easy to replace',
    }
  })
  // Keep the squad at the minimum: the best of those let go stay on after all.
  let size = o.squadAfter + rows.filter((r) => r.keep).length
  for (const r of [...rows]
    .filter((r) => !r.keep)
    .sort((a, b) => overallRating(b.p) - overallRating(a.p))) {
    if (size >= SQUAD_MIN) break
    r.keep = true
    r.reason = `Needed to keep the squad at ${SQUAD_MIN}`
    size++
  }
  return rows.sort((a, b) => Number(b.keep) - Number(a.keep) || b.ask - a.ask)
}

/**
 * Carry out the PA's plan: she opens at about 90% of each ask and takes a fair counter;
 * those she doesn't keep are let go. Returns her report, one line per player.
 */
export function autoRenew(career: Career, teamIds: string[]): { career: Career; lines: string[] } {
  let c = career
  const lines: string[] = []
  for (const r of renewalPlan(career, teamIds)) {
    const { p } = r
    if (!r.keep) {
      c = setLetGo(c, p.id, true)
      lines.push(`Letting ${p.name} go: ${r.reason.toLowerCase()}.`)
      continue
    }
    const ask = askingPrice(c, p, r.years, teamIds)
    const opening = Math.max(20, Math.round((ask * 0.9) / 5) * 5)
    let out = makeOffer(c, p.id, { salary: opening, years: r.years }, teamIds)
    let paid = opening
    if (out.answer.kind === 'counter') {
      paid = out.answer.salary
      out = makeOffer(out.career, p.id, { salary: paid, years: r.years }, teamIds)
    }
    if (out.answer.kind === 'accept') {
      c = out.career
      const saved = ask - paid
      lines.push(
        `Renewed ${p.name}: ${money(paid)} × ${r.years} season${r.years > 1 ? 's' : ''}${
          saved > 0 ? ` (he asked ${money(ask)})` : ''
        }.`,
      )
    } else {
      lines.push(`Couldn't renew ${p.name}: ${out.answer.message}`)
    }
  }
  return { career: c, lines }
}

const money = (lakh: number) =>
  lakh >= 100 ? `₹${+(lakh / 100).toFixed(2)} cr` : `₹${Math.round(lakh)} L`
