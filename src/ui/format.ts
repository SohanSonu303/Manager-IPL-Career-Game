import { teamById, type Role } from '@/data'
import { today } from '@/sim/calendar'
import type { Career } from '@/sim/career'
import { standings } from '@/sim/game'

/** 1310 lakh -> "₹13.1 cr". */
export const crore = (lakh: number) => `₹${(lakh / 100).toFixed(lakh % 100 === 0 ? 0 : 1)} cr`

export function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

export const teamName = (id: string) => teamById.get(id)?.name ?? id
export const teamShort = (id: string) => teamById.get(id)?.short ?? id

const ROLE_LABEL: Record<Role, string> = {
  batter: 'Batter',
  wicketkeeper: 'Wicketkeeper',
  allrounder: 'All-rounder',
  bowler: 'Bowler',
}

export function roleLabel(p: { role: Role; bowlingType: 'pace' | 'spin' | null }): string {
  const type =
    p.bowlingType && (p.role === 'bowler' || p.role === 'allrounder')
      ? ` · ${p.bowlingType === 'pace' ? 'Pace' : 'Spin'}`
      : ''
  return ROLE_LABEL[p.role] + type
}

export const TRAIT_LABEL: Record<string, string> = {
  anchor: 'Anchor',
  'big-hitter': 'Big Hitter',
  finisher: 'Finisher',
  'poor-vs-spin': 'Weak vs Spin',
  'powerplay-specialist': 'Powerplay',
  'death-bowler': 'Death Bowler',
}

/** One line for the news ticker, most important first. */
export function newsLine(career: Career): string {
  const me = career.manager.teamId
  const review = career.season.review
  if (review) return `${teamName(review.championId)} are the ${review.year} champions!`
  const day = today(career.calendar)
  const last = [...career.season.results].reverse().find((r) => r.teams.includes(me))
  if (last && day.phase !== 'preseason') {
    const opp = teamName(last.teams.find((t) => t !== me) ?? '')
    if (!last.winnerId) return `No result against ${opp}.`
    const pos = standings(career).findIndex((r) => r.teamId === me) + 1
    return last.winnerId === me
      ? `Win! ${teamShort(me)} beat ${opp} — ${ordinal(pos)} in the table.`
      : `${opp} ${last.margin}. ${teamShort(me)} are ${ordinal(pos)}.`
  }
  return `Welcome to the start of the ${career.calendar.year} season!`
}
