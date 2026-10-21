import { teams } from '../data'
import {
  clampScore,
  judgeSeason,
  objectiveForRank,
  SACK_BELOW,
  type Finish,
  type Objective,
} from './board'
import { nextDay, SEASON, today, type PlayoffStage } from './calendar'
import { agePlayer, newCareer, restDay, type Career, type CareerPlayer } from './career'
import {
  addMatchStats,
  computeStandings,
  finalists,
  leagueFixtures,
  playoffFixture,
  seasonAwards,
  toResult,
  walkover,
  type Fixture,
  type StandingRow,
} from './league'
import {
  aiSignings,
  askingSalary,
  expireContracts,
  freeAgents,
  retirementChance,
  squadOf,
  strengthRanking,
} from './market'
import { simMatch, type Match } from './match/engine'
import { applyPostMatch } from './match/postMatch'
import { autoTeamSheet, isAvailable, type Selectable } from './match/selection'
import { setupMatch } from './match/setup'
import type { MatchState, TeamSheet } from './match/types'
import { createRng, deriveSeed } from './rng'

/*
 * The season loop: what is on today, playing it, moving on, the season review and the
 * turn of the year. Pure functions over `Career`.
 */

export const TEAM_IDS = teams.map((t) => t.id)

export function objectiveFor(career: Career): Objective {
  const rank = strengthRanking(career, TEAM_IDS).indexOf(career.manager.teamId) + 1
  return objectiveForRank(rank)
}

export function startCareer(opts: { seed: number; managerName: string; teamId: string }): Career {
  const draft = newCareer({ ...opts, objective: { targetPosition: 6, text: '' } })
  return { ...draft, season: { ...draft.season, objective: objectiveFor(draft) } }
}

// --- Fixtures ---------------------------------------------------------------------

export const schedule = (career: Career) =>
  leagueFixtures(career.seed, career.calendar.year, TEAM_IDS)
export const standings = (career: Career): StandingRow[] =>
  computeStandings(career.season.results, TEAM_IDS)
export const isPlayed = (career: Career, f: Fixture) =>
  career.season.results.some((r) => r.fixtureId === f.id)
const involves = (f: Fixture, teamId: string) => f.homeId === teamId || f.awayId === teamId

/** Every fixture on today's date (played or not). */
export function fixturesToday(career: Career): Fixture[] {
  const ev = today(career.calendar).event
  if (!ev) return []
  if (ev.type === 'league') return schedule(career).filter((f) => f.round === ev.round)
  if (ev.type === 'playoff') {
    const f = playoffFixture(
      ev.stage,
      career.calendar.year,
      standings(career),
      career.season.results,
    )
    return f ? [f] : []
  }
  return []
}

export const pendingFixtures = (career: Career) =>
  fixturesToday(career).filter((f) => !isPlayed(career, f))
export const userFixtureToday = (career: Career) =>
  pendingFixtures(career).find((f) => involves(f, career.manager.teamId)) ?? null

/** The manager's next league fixture from today on (playoff opponents aren't known yet). */
export function nextUserFixture(career: Career): Fixture | null {
  const ev = today(career.calendar).event
  const fromRound =
    ev?.type === 'league'
      ? ev.round
      : SEASON.slice(0, career.calendar.day).filter((d) => d.event?.type === 'league').length + 1
  return (
    schedule(career)
      .filter(
        (f) =>
          (f.round ?? 0) >= fromRound && involves(f, career.manager.teamId) && !isPlayed(career, f),
      )
      .sort((a, b) => (a.round ?? 0) - (b.round ?? 0))[0] ?? null
  )
}

// --- Playing ------------------------------------------------------------------------

function squadsOf(career: Career, ids: string[]): Record<string, Selectable[]> {
  return Object.fromEntries(ids.map((id) => [id, squadOf(career.players, id)]))
}

/**
 * Emergency signings so a club can field eleven fit players: the cheapest free agents,
 * whatever the cap (the league insists the match goes ahead).
 */
export function ensureEleven(career: Career, teamId: string): Career {
  let players = career.players
  while (squadOf(players, teamId).filter(isAvailable).length < 11) {
    const p = freeAgents(players).sort((a, b) => askingSalary(a) - askingSalary(b))[0]
    if (!p) break
    players = players.map((x) =>
      x.id === p.id ? { ...x, teamId, contract: { salary: askingSalary(x), years: 1 } } : x,
    )
  }
  return players === career.players ? career : { ...career, players }
}

export const fixtureSeed = (career: Career, f: Fixture) => deriveSeed(career.seed, 'fixture', f.id)

/**
 * A ready-to-play match for a fixture. The manager's side is human-controlled (its
 * sheet, or the auto sheet); everyone else is AI.
 */
export function setupFixture(career: Career, f: Fixture, userSheet?: TeamSheet): Match {
  const me = career.manager.teamId
  const sheets: Partial<Record<string, TeamSheet>> = {}
  if (involves(f, me))
    sheets[me] = userSheet ?? autoTeamSheet(me, squadOf(career.players, me), false)
  return setupMatch({
    seed: fixtureSeed(career, f),
    homeId: f.homeId,
    awayId: f.awayId,
    squads: squadsOf(career, [f.homeId, f.awayId]),
    sheets,
  })
}

/** Store a finished match: post-match step for both squads, result, season stats. */
export function recordFixture(career: Career, f: Fixture, state: MatchState): Career {
  const { players } = applyPostMatch(career.players, state, deriveSeed(career.seed, 'post', f.id))
  return {
    ...career,
    players,
    season: {
      ...career.season,
      results: [...career.season.results, toResult(f, state)],
      stats: addMatchStats(career.season.stats, state),
    },
  }
}

/** Play a fixture without watching it (AI picks and bats for both sides). */
export function quickSim(career: Career, f: Fixture): Career {
  let c = ensureEleven(ensureEleven(career, f.homeId), f.awayId)
  const conceded = walkoverLoser(c, f)
  if (conceded) {
    const winner = conceded === f.homeId ? f.awayId : f.homeId
    return {
      ...c,
      season: {
        ...c.season,
        results: [...c.season.results, walkover(f, winner, fixtureSeed(c, f))],
      },
    }
  }
  const { state, rng } = setupMatch({
    seed: fixtureSeed(c, f),
    homeId: f.homeId,
    awayId: f.awayId,
    squads: squadsOf(c, [f.homeId, f.awayId]),
  })
  simMatch(state, rng)
  c = recordFixture(c, f, state)
  return c
}

/** The side that cannot field two fit players (home side first), or null. */
export function walkoverLoser(career: Career, f: Fixture): string | null {
  for (const id of [f.homeId, f.awayId]) {
    if (squadOf(career.players, id).filter(isAvailable).length < 2) return id
  }
  return null
}

/** Play everything still pending today; the manager's match too unless already recorded. */
export function playToday(career: Career): Career {
  let c = career
  for (const f of pendingFixtures(career)) c = quickSim(c, f)
  return c
}

// --- Moving on ----------------------------------------------------------------------

export function continueBlocker(career: Career): string | null {
  if (career.status === 'sacked') return 'You have been sacked.'
  if (userFixtureToday(career)) return 'Play or sim your match first.'
  return null
}

/** Move one day; at the end of the season roll over into the next year. */
export function advanceDay(career: Career): Career {
  const { calendar, rolledOver } = nextDay(career.calendar)
  const rested: Career = { ...career, calendar, players: career.players.map(restDay) }
  return rolledOver ? rollover(rested, career.calendar.year) : rested
}

/**
 * Continue: settle today's other matches, then move to the next day with something on
 * (a match day, the season end, or the start of the new season's preseason).
 */
export function continueCareer(career: Career): Career {
  if (continueBlocker(career)) return career
  let c = playToday(career)
  do {
    const year = c.calendar.year
    c = advanceDay(c)
    if (c.calendar.year !== year) return c
  } while (!SEASON[c.calendar.day]?.event)
  if (today(c.calendar).event?.type === 'seasonEnd' && !c.season.review) c = finishSeason(c)
  return c
}

// --- Season end and the new year ------------------------------------------------------

function finishOf(teamId: string, table: StandingRow[], career: Career): Finish {
  const f = finalists(table, career.season.results)
  if (f?.champion === teamId) return 'champion'
  if (f?.runnerUp === teamId) return 'runnerUp'
  return table.findIndex((r) => r.teamId === teamId) < 4 ? 'playoffs' : 'league'
}

/** Season review on the last day: table, awards, the board's verdict, maybe the sack. */
export function finishSeason(career: Career): Career {
  const table = standings(career)
  const me = career.manager.teamId
  const position = table.findIndex((r) => r.teamId === me) + 1
  const finish = finishOf(me, table, career)
  const final = finalists(table, career.season.results)
  const verdict = judgeSeason(position, finish, career.season.objective)
  const reputation = clampScore(career.manager.reputation + verdict.reputationChange)
  const confidence = clampScore(career.manager.boardConfidence + verdict.confidenceChange)
  const sacked = confidence < SACK_BELOW
  const ages = Object.fromEntries(career.players.map((p) => [p.id, p.age]))
  return {
    ...career,
    manager: { ...career.manager, reputation, boardConfidence: confidence },
    status: sacked ? 'sacked' : 'active',
    season: {
      ...career.season,
      review: {
        year: career.calendar.year,
        championId: final?.champion ?? table[0]?.teamId ?? '',
        runnerUpId: final?.runnerUp ?? table[1]?.teamId ?? '',
        table: table.map(({ teamId, points, nrr }) => ({ teamId, points, nrr })),
        position,
        finish,
        objective: career.season.objective,
        objectiveMet: verdict.objectiveMet,
        awards: seasonAwards(career.season.stats, ages),
        message: sacked ? `${verdict.message} You have been sacked.` : verdict.message,
        reputationAfter: reputation,
        confidenceAfter: confidence,
        retired: [],
      },
    },
  }
}

/**
 * The turn of the year: players age and develop, some retire, contracts run down and
 * expire, AI clubs restock, and the board sets a new objective.
 */
export function rollover(career: Career, endedYear: number): Career {
  const aged = career.players.map((p) => agePlayer(p, career.seed, endedYear))
  const retired: CareerPlayer[] = []
  const staying = aged.filter((p) => {
    const rng = createRng(deriveSeed(career.seed, 'retire', endedYear, p.id))
    if (rng() < retirementChance(p)) {
      retired.push(p)
      return false
    }
    return true
  })
  let c: Career = { ...career, players: staying }
  c = expireContracts(c, createRng(deriveSeed(career.seed, 'expire', endedYear)))
  c = aiSignings(c, TEAM_IDS, createRng(deriveSeed(career.seed, 'ai-sign', endedYear)))
  for (const id of TEAM_IDS) c = ensureEleven(c, id)
  const review = career.season.review
  return {
    ...c,
    history: review
      ? [...c.history, { ...review, retired: retired.map((p) => p.name) }]
      : c.history,
    season: { results: [], stats: {}, objective: objectiveFor(c), review: null },
    market: { ...c.market, talks: {} },
  }
}

/** Day label helper for the UI. */
export function stageName(stage: PlayoffStage | 'league'): string {
  return {
    league: 'League',
    qualifier1: 'Qualifier 1',
    eliminator: 'Eliminator',
    qualifier2: 'Qualifier 2',
    final: 'Final',
  }[stage]
}
