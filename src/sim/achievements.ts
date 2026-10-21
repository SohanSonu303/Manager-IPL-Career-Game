import type { Career } from './career'
import type { Fixture } from './league'
import type { InningsState, MatchState } from './match/types'
import { winProbabilityTrail } from './match/winProb'
import { addNews } from './news'

/*
 * Achievements: long-term goals across a career. Match achievements are checked when
 * the manager's own match is recorded; career ones whenever the career changes. Once
 * unlocked they stay (stored in the save with the season and day).
 */

export interface Achievement {
  id: string
  title: string
  /** How to earn it. */
  text: string
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first-win', title: 'Off the mark', text: 'Win your first match.' },
  { id: 'streak-5', title: 'On a roll', text: 'Win five matches in a row in a season.' },
  { id: 'ten-wins', title: 'Double figures', text: 'Win ten league matches in one season.' },
  { id: 'big-chase', title: 'Chase master', text: 'Chase down a target of 200 or more.' },
  { id: 'defend-small', title: 'Hold the line', text: 'Defend a total of 150 or less.' },
  { id: 'thrashing', title: 'Thrashing', text: 'Win by 60 runs or more, or by 9 wickets or more.' },
  { id: 'last-ball', title: 'Last-ball thriller', text: 'Win a chase off the very last ball.' },
  { id: 'comeback', title: 'Great escape', text: 'Win after your chance fell below 10%.' },
  { id: 'super-over', title: 'Nerves of steel', text: 'Win a super over.' },
  { id: 'century', title: 'Centurion', text: 'One of your batters scores a hundred.' },
  {
    id: 'six-hitter',
    title: 'Six machine',
    text: 'One of your batters hits eight sixes in a match.',
  },
  { id: 'five-for', title: 'Five-for', text: 'One of your bowlers takes five wickets.' },
  { id: 'hat-trick', title: 'Hat-trick', text: 'One of your bowlers takes three in three.' },
  { id: 'miser', title: 'Miser', text: 'A bowler of yours goes for 16 or less in four overs.' },
  { id: 'drs-hero', title: 'Upstairs', text: 'Win a DRS review.' },
  {
    id: 'impact',
    title: 'Impact made',
    text: 'Your Impact Player scores 30 or takes two wickets.',
  },
  { id: 'playoffs', title: 'Into the playoffs', text: 'Reach the playoffs.' },
  { id: 'top-of-table', title: 'Table toppers', text: 'Finish the league stage top.' },
  { id: 'champion', title: 'Champions', text: 'Win the title.' },
  { id: 'back-to-back', title: 'Dynasty', text: 'Win the title two seasons running.' },
  { id: 'objective', title: 'Board pleased', text: "Meet the board's objective for a season." },
  { id: 'big-signing', title: 'Marquee signing', text: 'Sign a player for ₹15 crore or more.' },
  { id: 'trader', title: 'Deal maker', text: 'Complete a trade with another club.' },
  { id: 'seasons-3', title: 'Settled in', text: 'Manage three full seasons.' },
  { id: 'seasons-5', title: 'Long-serving', text: 'Manage five full seasons.' },
  { id: 'seasons-10', title: 'Legend', text: 'Manage ten full seasons.' },
]

export const achievementById = new Map(ACHIEVEMENTS.map((a) => [a.id, a]))

export type Unlocked = Record<string, { year: number; day: number }>

/** Three wickets in three consecutive legal deliveries by one bowler (run-outs excluded). */
export function hasHatTrick(inn: InningsState, bowlerIds: Set<string>): boolean {
  const run = new Map<string, number>()
  for (const e of inn.events) {
    if (!bowlerIds.has(e.bowlerId) || e.extra?.kind === 'wide' || e.extra?.kind === 'noball')
      continue
    const n = e.wicket && e.wicket.kind !== 'runOut' ? (run.get(e.bowlerId) ?? 0) + 1 : 0
    if (n >= 3) return true
    run.set(e.bowlerId, n)
  }
  return false
}

/** Achievements earned in this match by the manager's side. */
export function matchAchievements(state: MatchState, me: string): string[] {
  const got: string[] = []
  const won = state.result?.winnerId === me
  const main = state.innings.slice(0, 2)
  const [first, second] = main
  const mine = new Set(state.sheets[me]?.battingOrder ?? [])
  const out = state.sheets[me]?.impact?.used?.outId
  if (out) mine.add(out)
  const batInns = main.filter((i) => i.battingTeamId === me)
  const bowlInns = main.filter((i) => i.bowlingTeamId === me)

  if (won) {
    got.push('first-win')
    if (second?.battingTeamId === me && second.target !== null && second.target > 200)
      got.push('big-chase')
    if (first?.battingTeamId === me && first.runs <= 150 && state.innings.length === 2)
      got.push('defend-small')
    const margin = Number(/won by (\d+)/.exec(state.result?.margin ?? '')?.[1] ?? 0)
    if (
      (state.result?.kind === 'runs' && margin >= 60) ||
      (state.result?.kind === 'wickets' && margin >= 9)
    )
      got.push('thrashing')
    if (
      state.result?.kind === 'wickets' &&
      second?.battingTeamId === me &&
      second.legalBalls === second.maxOvers * 6 &&
      second.events.at(-1)?.legal
    )
      got.push('last-ball')
    if (state.result?.kind === 'superOver') got.push('super-over')
    if (state.innings.length === 2 && Math.min(...winProbabilityTrail(state, me)) < 0.1)
      got.push('comeback')
  }
  for (const inn of batInns)
    for (const l of Object.values(inn.batting)) {
      if (l.runs >= 100) got.push('century')
      if (l.sixes >= 8) got.push('six-hitter')
    }
  for (const inn of bowlInns) {
    for (const b of Object.values(inn.bowling)) {
      if (b.wickets >= 5) got.push('five-for')
      if (b.legalBalls >= 24 && b.runs <= 16) got.push('miser')
    }
    if (hasHatTrick(inn, mine)) got.push('hat-trick')
  }
  for (const inn of main)
    if (inn.events.some((e) => e.review?.teamId === me && e.review.overturned)) got.push('drs-hero')
  const sub = state.sheets[me]?.impact?.used?.inId
  if (sub) {
    const runs = batInns.reduce((n, i) => n + (i.batting[sub]?.runs ?? 0), 0)
    const wkts = bowlInns.reduce((n, i) => n + (i.bowling[sub]?.wickets ?? 0), 0)
    if (runs >= 30 || wkts >= 2) got.push('impact')
  }
  return [...new Set(got)]
}

/** Achievements the career as it stands has earned. */
export function careerAchievements(career: Career): string[] {
  const me = career.manager.teamId
  const got: string[] = []
  const mine = career.season.results.filter((r) => r.teams.includes(me))
  let run = 0
  for (const r of mine) {
    run = r.winnerId === me ? run + 1 : 0
    if (run >= 5) got.push('streak-5')
  }
  const leagueWins = mine.filter((r) => r.stage === 'league' && r.winnerId === me).length
  if (leagueWins >= 10) got.push('ten-wins')
  if (mine.some((r) => r.stage !== 'league')) got.push('playoffs')
  const reviews = [...career.history]
  if (career.season.review && !reviews.some((r) => r.year === career.season.review?.year))
    reviews.push(career.season.review)
  reviews.sort((a, b) => a.year - b.year)
  reviews.forEach((r, i) => {
    if (r.championId === me) {
      got.push('champion')
      if (reviews[i - 1]?.championId === me && reviews[i - 1]?.year === r.year - 1)
        got.push('back-to-back')
    }
    if (r.table[0]?.teamId === me) got.push('top-of-table')
    if (r.objectiveMet) got.push('objective')
    if (r.finish !== 'league') got.push('playoffs')
  })
  if (reviews.length >= 3) got.push('seasons-3')
  if (reviews.length >= 5) got.push('seasons-5')
  if (reviews.length >= 10) got.push('seasons-10')
  for (const l of career.market.log) {
    if (l.teamId !== me) continue
    if (l.kind === 'signed' && l.salary >= 1500) got.push('big-signing')
    if (l.kind === 'traded') got.push('trader')
  }
  return [...new Set(got)]
}

/** Unlock any of `ids` not yet unlocked, with a news item for each. */
export function unlock(career: Career, ids: string[]): Career {
  const have = career.achievements ?? {}
  const fresh = ids.filter((id) => !have[id] && achievementById.has(id))
  if (!fresh.length) return career
  const { year, day } = career.calendar
  const achievements = { ...have }
  for (const id of fresh) achievements[id] = { year, day }
  return addNews(
    { ...career, achievements },
    ...fresh.map((id) => ({
      kind: 'milestone' as const,
      teamIds: [career.manager.teamId],
      text: `Achievement unlocked: ${achievementById.get(id)?.title}. ${achievementById.get(id)?.text}`,
    })),
  )
}

/** Fixture helper for the game loop: is this the manager's match? */
export const isManagersFixture = (career: Career, f: Fixture) =>
  f.homeId === career.manager.teamId || f.awayId === career.manager.teamId
