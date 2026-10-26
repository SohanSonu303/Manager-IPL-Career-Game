import type { Career } from './career'

/*
 * Club funds: money a club earns (a bonus for every win, prize money for the playoffs)
 * and can spend as cash in trades. Separate from the salary cap, which still limits
 * wages. Amounts in lakh. Sized by Monte Carlo over 400 club-seasons: an average club
 * earns about ₹3 cr a season, a champion about ₹8 cr.
 */

export const START_FUNDS = 500
/** Per win (league or playoff); a loss earns nothing. */
export const WIN_BONUS = 25
/** Prize money by final standing. */
export const PRIZES = { champion: 500, runnerUp: 300, third: 150, fourth: 100 } as const

export interface LedgerEntry {
  year: number
  amount: number
  text: string
}

const LEDGER_MAX = 30

export const fundsOf = (career: Career, teamId: string) => career.funds?.[teamId] ?? START_FUNDS

/** Add (or, with a negative amount, take) money; the manager's club keeps a ledger. */
export function credit(career: Career, teamId: string, amount: number, text: string): Career {
  if (!amount) return career
  const funds = { ...career.funds, [teamId]: fundsOf(career, teamId) + amount }
  const ledger =
    teamId === career.manager.teamId
      ? [...(career.ledger ?? []), { year: career.calendar.year, amount, text }].slice(-LEDGER_MAX)
      : career.ledger
  return { ...career, funds, ledger }
}

export const startingFunds = (teamIds: string[]) =>
  Object.fromEntries(teamIds.map((id) => [id, START_FUNDS]))
