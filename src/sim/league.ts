import type { PlayoffStage } from './calendar'
import { gradeMatch } from './match/postMatch'
import { summarizeMatch, type MatchSummary } from './match/scorecard'
import type { MatchState } from './match/types'
import { createRng, deriveSeed, shuffle } from './rng'

/*
 * League: fixtures, points table, playoffs, season stats and awards.
 * Format (open decision in TODO.md): 14 league matches per team — every pair meets once
 * (9 rounds) and five of those rounds are replayed with home and away swapped.
 */

export type Stage = 'league' | PlayoffStage

export interface Fixture {
  id: string
  stage: Stage
  /** League round (1-based), null for playoffs. */
  round: number | null
  homeId: string
  awayId: string
}

export interface FixtureResult extends MatchSummary {
  fixtureId: string
  stage: Stage
}

const REPLAYED_ROUNDS = 5

/** All league fixtures of a season. Deterministic for (seed, year). */
export function leagueFixtures(seed: number, year: number, teamIds: string[]): Fixture[] {
  const rng = createRng(deriveSeed(seed, 'fixtures', year))
  const t = shuffle(rng, teamIds)
  const n = t.length
  if (n % 2 !== 0) throw new Error('Need an even number of teams')
  // Circle method: team 0 fixed, the rest rotate. n−1 rounds, each pair meets once.
  const base: [string, string][][] = []
  const ring = t.slice(1)
  for (let r = 0; r < n - 1; r++) {
    const round: [string, string][] = []
    const lineup = [t[0] as string, ...ring]
    for (let i = 0; i < n / 2; i++) {
      const a = lineup[i] as string
      const b = lineup[n - 1 - i] as string
      // Alternate home and away so every team gets a fair split.
      round.push((r + i) % 2 === 0 ? [a, b] : [b, a])
    }
    base.push(round)
    ring.unshift(ring.pop() as string)
  }
  const replays = shuffle(rng, base)
    .slice(0, REPLAYED_ROUNDS)
    .map((round) => round.map(([h, a]) => [a, h] as [string, string]))
  // Order the rounds so no pair meets in consecutive rounds (seeded retries).
  const pairKey = ([h, a]: [string, string]) => [h, a].sort().join('|')
  const backToBack = (rs: [string, string][][]) =>
    rs.some(
      (round, i) => i > 0 && round.some((m) => rs[i - 1]?.some((p) => pairKey(p) === pairKey(m))),
    )
  let rounds = shuffle(rng, [...base, ...replays])
  for (let tries = 0; tries < 500 && backToBack(rounds); tries++)
    rounds = shuffle(rng, [...base, ...replays])
  return rounds.flatMap((round, i) =>
    round.map(([homeId, awayId]) => ({
      id: `${year}-L${i + 1}-${homeId}-${awayId}`,
      stage: 'league' as const,
      round: i + 1,
      homeId,
      awayId,
    })),
  )
}

// --- Standings -------------------------------------------------------------------

export interface StandingRow {
  teamId: string
  played: number
  won: number
  lost: number
  /** Tied with no super-over winner, or no result. */
  noResult: number
  points: number
  runsFor: number
  ballsFor: number
  runsAgainst: number
  ballsAgainst: number
  /** Net run rate. */
  nrr: number
}

/** Points table from league results: 2 for a win, 1 each for no result; ties on NRR. */
export function computeStandings(results: FixtureResult[], teamIds: string[]): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    teamIds.map((id) => [
      id,
      {
        teamId: id,
        played: 0,
        won: 0,
        lost: 0,
        noResult: 0,
        points: 0,
        runsFor: 0,
        ballsFor: 0,
        runsAgainst: 0,
        ballsAgainst: 0,
        nrr: 0,
      },
    ]),
  )
  for (const r of results) {
    if (r.stage !== 'league') continue
    const [first, second] = r.innings
    if (!first || !second) {
      // Walkover: points only, no effect on net run rate.
      for (const id of r.teams) {
        const row = rows.get(id)
        if (!row) continue
        row.played++
        if (r.winnerId === id) {
          row.won++
          row.points += 2
        } else row.lost++
      }
      continue
    }
    // An all-out side is charged the full 20 overs for NRR.
    const balls = (i: typeof first) => (i.wickets >= 10 ? 120 : i.legalBalls)
    for (const [bat, bowl] of [
      [first, second],
      [second, first],
    ] as const) {
      const row = rows.get(bat.teamId)
      if (!row) continue
      row.played++
      row.runsFor += bat.runs
      row.ballsFor += balls(bat)
      row.runsAgainst += bowl.runs
      row.ballsAgainst += balls(bowl)
      if (r.winnerId === null) {
        row.noResult++
        row.points += 1
      } else if (r.winnerId === bat.teamId) {
        row.won++
        row.points += 2
      } else row.lost++
    }
  }
  for (const row of rows.values()) {
    const rf = row.ballsFor ? (row.runsFor / row.ballsFor) * 6 : 0
    const ra = row.ballsAgainst ? (row.runsAgainst / row.ballsAgainst) * 6 : 0
    row.nrr = rf - ra
  }
  return [...rows.values()].sort(
    (a, b) =>
      b.points - a.points || b.nrr - a.nrr || b.won - a.won || a.teamId.localeCompare(b.teamId),
  )
}

// --- Playoffs --------------------------------------------------------------------

const resultOf = (results: FixtureResult[], stage: Stage) => results.find((r) => r.stage === stage)
const loserOf = (r: FixtureResult) => (r.teams[0] === r.winnerId ? r.teams[1] : r.teams[0])

/**
 * The playoff fixture for a stage, once its teams are known: Qualifier 1 (1st v 2nd),
 * Eliminator (3rd v 4th), Qualifier 2 (loser Q1 v winner Eliminator), Final.
 * A tied playoff with no super-over winner goes to the higher seed.
 */
export function playoffFixture(
  stage: PlayoffStage,
  year: number,
  standings: StandingRow[],
  results: FixtureResult[],
): Fixture | null {
  const seed = (i: number) => standings[i]?.teamId
  const winner = (s: Stage) => {
    const r = resultOf(results, s)
    if (!r) return undefined
    return r.winnerId ?? higherSeed(standings, r.teams)
  }
  const loser = (s: Stage) => {
    const r = resultOf(results, s)
    if (!r) return undefined
    const w = winner(s)
    return r.teams.find((t) => t !== w) ?? loserOf(r)
  }
  let home: string | undefined
  let away: string | undefined
  switch (stage) {
    case 'qualifier1':
      ;[home, away] = [seed(0), seed(1)]
      break
    case 'eliminator':
      ;[home, away] = [seed(2), seed(3)]
      break
    case 'qualifier2':
      ;[home, away] = [loser('qualifier1'), winner('eliminator')]
      break
    case 'final':
      ;[home, away] = [winner('qualifier1'), winner('qualifier2')]
      break
  }
  if (!home || !away) return null
  return { id: `${year}-${stage}`, stage, round: null, homeId: home, awayId: away }
}

export function higherSeed(standings: StandingRow[], teams: readonly string[]): string {
  const pos = (id: string) => standings.findIndex((r) => r.teamId === id)
  return [...teams].sort((a, b) => pos(a) - pos(b))[0] as string
}

/** Champion and runner-up once the final is played. */
export function finalists(standings: StandingRow[], results: FixtureResult[]) {
  const f = resultOf(results, 'final')
  if (!f) return null
  const champion = f.winnerId ?? higherSeed(standings, f.teams)
  return { champion, runnerUp: f.teams.find((t) => t !== champion) as string }
}

export function toResult(fixture: Fixture, state: MatchState): FixtureResult {
  return { ...summarizeMatch(state), fixtureId: fixture.id, stage: fixture.stage }
}

/** A side that cannot field two fit players concedes the match. */
export function walkover(fixture: Fixture, winnerId: string, seed: number): FixtureResult {
  return {
    fixtureId: fixture.id,
    stage: fixture.stage,
    seed,
    teams: [fixture.homeId, fixture.awayId],
    innings: [],
    winnerId,
    margin: 'won by walkover',
  }
}

// --- Season stats and awards ---------------------------------------------------------

export interface SeasonStat {
  teamId: string
  matches: number
  runs: number
  balls: number
  outs: number
  fours: number
  sixes: number
  highScore: number
  wickets: number
  ballsBowled: number
  runsConceded: number
  /** Sum of match grades, for MVP. */
  gradeSum: number
}

const emptyStat = (teamId: string): SeasonStat => ({
  teamId,
  matches: 0,
  runs: 0,
  balls: 0,
  outs: 0,
  fours: 0,
  sixes: 0,
  highScore: 0,
  wickets: 0,
  ballsBowled: 0,
  runsConceded: 0,
  gradeSum: 0,
})

/** Add one match (first two innings) to the season stats. */
export function addMatchStats(
  stats: Record<string, SeasonStat>,
  state: MatchState,
): Record<string, SeasonStat> {
  const next = { ...stats }
  for (const g of gradeMatch(state)) {
    const s = { ...(next[g.id] ?? emptyStat(g.teamId)), teamId: g.teamId }
    s.matches++
    s.gradeSum += g.grade
    if (g.batting) {
      s.runs += g.batting.runs
      s.balls += g.batting.balls
      s.fours += g.batting.fours
      s.sixes += g.batting.sixes
      if (g.batting.out) s.outs++
      s.highScore = Math.max(s.highScore, g.batting.runs)
    }
    if (g.bowling) {
      s.wickets += g.bowling.wickets
      s.ballsBowled += g.bowling.legalBalls
      s.runsConceded += g.bowling.runs
    }
    next[g.id] = s
  }
  return next
}

export interface Award {
  playerId: string
  value: string
}

export interface Awards {
  /** Most runs. */
  orangeCap: Award | null
  /** Most wickets. */
  purpleCap: Award | null
  /** Highest total match grades. */
  mvp: Award | null
  /** Best average grade, aged 23 or under, at least 5 matches. */
  emerging: Award | null
}

export function seasonAwards(
  stats: Record<string, SeasonStat>,
  ages: Record<string, number>,
): Awards {
  const entries = Object.entries(stats)
  const best = (
    list: [string, SeasonStat][],
    score: (s: SeasonStat) => number,
    label: (s: SeasonStat) => string,
  ): Award | null => {
    const top = [...list].sort((a, b) => score(b[1]) - score(a[1]))[0]
    return top && score(top[1]) > 0 ? { playerId: top[0], value: label(top[1]) } : null
  }
  return {
    orangeCap: best(
      entries,
      (s) => s.runs + s.runs / Math.max(1, s.balls) / 1000,
      (s) => `${s.runs} runs`,
    ),
    purpleCap: best(
      entries,
      (s) => s.wickets - (s.ballsBowled ? s.runsConceded / s.ballsBowled : 0) / 1000,
      (s) => `${s.wickets} wickets`,
    ),
    mvp: best(
      entries,
      (s) => s.gradeSum,
      (s) => `${s.matches} matches, avg grade ${Math.round(s.gradeSum / Math.max(1, s.matches))}`,
    ),
    emerging: best(
      entries.filter(([id, s]) => (ages[id] ?? 99) <= 23 && s.matches >= 5),
      (s) => s.gradeSum / s.matches,
      (s) => `avg grade ${Math.round(s.gradeSum / s.matches)}`,
    ),
  }
}
