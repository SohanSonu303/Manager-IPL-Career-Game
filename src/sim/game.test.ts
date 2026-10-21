import { describe, expect, it } from 'vitest'
import { judgeSeason, objectiveForRank } from './board'
import { daysToNextEvent, LEAGUE_ROUNDS, nextDay, SEASON, today } from './calendar'
import { agePlayer, type Career } from './career'
import { addNews } from './news'
import {
  advanceDay,
  talkToPlayer,
  continueBlocker,
  continueCareer,
  fixturesToday,
  quickSim,
  schedule,
  standings,
  startCareer,
  TEAM_IDS,
  userFixtureToday,
} from './game'
import { computeStandings, leagueFixtures, playoffFixture, type FixtureResult } from './league'
import {
  askingSalary,
  capRoom,
  evaluateTrade,
  executeTrade,
  freeAgents,
  makeOffer,
  agentOf,
  answerTradeOffer,
  offerBlocker,
  releasePlayer,
  requiredSalary,
  SALARY_CAP,
  salaryFor,
  squadOf,
  tradeValue,
} from './market'
import { overallRating } from './player'

const start = (seed = 42, teamId = 'hyd') => startCareer({ seed, managerName: 'Test', teamId })

/** Play on (quick-simming the manager's matches) until the given year starts. */
function playUntilYear(c: Career, year: number): Career {
  let guard = 0
  while (c.calendar.year < year && c.status === 'active' && guard++ < 500) {
    const mine = userFixtureToday(c)
    c = mine ? quickSim(c, mine) : continueCareer(c)
  }
  return c
}

/** Play to the season-end day of the current year (review done, before rollover). */
function playToSeasonEnd(c: Career): Career {
  let guard = 0
  while (today(c.calendar).event?.type !== 'seasonEnd' && guard++ < 500) {
    const mine = userFixtureToday(c)
    c = mine ? quickSim(c, mine) : continueCareer(c)
  }
  return c
}

describe('calendar', () => {
  it('has every league round, four playoff stages and a season end, in order', () => {
    const events = SEASON.flatMap((d) => (d.event ? [d.event] : []))
    expect(events.filter((e) => e.type === 'league')).toHaveLength(LEAGUE_ROUNDS)
    expect(
      events.filter((e) => e.type === 'playoff').map((e) => e.type === 'playoff' && e.stage),
    ).toEqual(['qualifier1', 'eliminator', 'qualifier2', 'final'])
    expect(events.at(-1)).toEqual({ type: 'seasonEnd' })
  })

  it('rolls over after the last day and finds the next event', () => {
    const last = { year: 2026, day: SEASON.length - 1 }
    expect(nextDay(last)).toEqual({ calendar: { year: 2027, day: 0 }, rolledOver: true })
    const d0 = { year: 2026, day: 0 }
    expect(today({ ...d0, day: daysToNextEvent(d0) }).event).toEqual({ type: 'league', round: 1 })
  })
})

describe('fixtures (14-match format)', () => {
  const fx = leagueFixtures(1, 2026, TEAM_IDS)

  it('70 matches, 14 per team, every team once per round', () => {
    expect(fx).toHaveLength(70)
    for (const id of TEAM_IDS)
      expect(fx.filter((f) => f.homeId === id || f.awayId === id)).toHaveLength(14)
    for (let r = 1; r <= LEAGUE_ROUNDS; r++) {
      const teams = fx.filter((f) => f.round === r).flatMap((f) => [f.homeId, f.awayId])
      expect(new Set(teams).size).toBe(10)
    }
  })

  it('every pair meets once or twice; each team meets five opponents twice; fair home split', () => {
    for (const id of TEAM_IDS) {
      const opp = new Map<string, number>()
      for (const f of fx) {
        if (f.homeId === id) opp.set(f.awayId, (opp.get(f.awayId) ?? 0) + 1)
        if (f.awayId === id) opp.set(f.homeId, (opp.get(f.homeId) ?? 0) + 1)
      }
      expect(opp.size).toBe(9)
      expect([...opp.values()].filter((n) => n === 2)).toHaveLength(5)
      const home = fx.filter((f) => f.homeId === id).length
      expect(home).toBeGreaterThanOrEqual(5)
      expect(home).toBeLessThanOrEqual(9)
    }
  })

  it('no pair meets in consecutive rounds', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const f = leagueFixtures(seed, 2026, TEAM_IDS)
      for (let r = 2; r <= LEAGUE_ROUNDS; r++) {
        const prev = new Set(
          f.filter((x) => x.round === r - 1).map((x) => [x.homeId, x.awayId].sort().join()),
        )
        for (const x of f.filter((y) => y.round === r))
          expect(prev.has([x.homeId, x.awayId].sort().join())).toBe(false)
      }
    }
  })

  it('is deterministic per seed and year, and changes between years', () => {
    expect(leagueFixtures(1, 2026, TEAM_IDS)).toEqual(fx)
    expect(leagueFixtures(1, 2027, TEAM_IDS)).not.toEqual(fx)
  })
})

describe('standings and playoffs', () => {
  const res = (
    id: string,
    a: [string, number, number, number],
    b: [string, number, number, number],
    winnerId: string | null,
  ): FixtureResult => ({
    fixtureId: id,
    stage: 'league',
    seed: 0,
    teams: [a[0], b[0]],
    innings: [
      { teamId: a[0], runs: a[1], wickets: a[2], legalBalls: a[3] },
      { teamId: b[0], runs: b[1], wickets: b[2], legalBalls: b[3] },
    ],
    winnerId,
    margin: '',
  })

  it('points and net run rate (all out counts as 20 overs)', () => {
    const rows = computeStandings(
      [
        res('1', ['A', 180, 5, 120], ['B', 150, 10, 100], 'A'),
        res('2', ['C', 160, 6, 120], ['A', 161, 2, 90], 'A'),
      ],
      ['A', 'B', 'C', 'D'],
    )
    const a = rows[0]
    expect(a?.teamId).toBe('A')
    expect(a?.points).toBe(4)
    // A: 341 runs in 210 balls; conceded 310 in 240 balls (B all out → 120).
    expect(a?.nrr).toBeCloseTo((341 / 210) * 6 - (310 / 240) * 6, 6)
    expect(rows.find((r) => r.teamId === 'B')?.ballsFor).toBe(120)
  })

  it('playoff bracket follows the table and the results', () => {
    const table = computeStandings([], ['A', 'B', 'C', 'D', 'E'])
    const order = ['A', 'B', 'C', 'D', 'E'].map((teamId) => ({
      ...table.find((r) => r.teamId === teamId)!,
    }))
    const q1 = playoffFixture('qualifier1', 2026, order, [])
    expect([q1?.homeId, q1?.awayId]).toEqual(['A', 'B'])
    expect(playoffFixture('qualifier2', 2026, order, [])).toBeNull()
    const results = [
      { ...res('q1', ['A', 150, 5, 120], ['B', 151, 3, 110], 'B'), stage: 'qualifier1' as const },
      { ...res('el', ['C', 170, 5, 120], ['D', 120, 10, 100], 'C'), stage: 'eliminator' as const },
    ]
    const q2 = playoffFixture('qualifier2', 2026, order, results)
    expect([q2?.homeId, q2?.awayId]).toEqual(['A', 'C'])
  })
})

describe('a full season', () => {
  const c0 = start()
  const end = playToSeasonEnd(c0)

  it('plays every league match and the playoffs', () => {
    const league = end.season.results.filter((r) => r.stage === 'league')
    expect(league).toHaveLength(70)
    expect(end.season.results.filter((r) => r.stage !== 'league').map((r) => r.stage)).toEqual([
      'qualifier1',
      'eliminator',
      'qualifier2',
      'final',
    ])
    const table = standings(end)
    expect(table.every((r) => r.played === 14)).toBe(true)
    expect(table.reduce((s, r) => s + r.points, 0)).toBe(140)
  })

  it('reviews the season: champion, awards, board verdict', () => {
    const r = end.season.review
    expect(r).not.toBeNull()
    expect(TEAM_IDS).toContain(r?.championId)
    expect(r?.awards.orangeCap?.value).toMatch(/runs/)
    expect(r?.awards.purpleCap?.value).toMatch(/wickets/)
    expect(r?.position).toBeGreaterThanOrEqual(1)
    expect(end.manager.reputation).not.toBe(c0.manager.reputation)
  })

  it('cannot skip the manager’s own match', () => {
    let c = continueCareer(c0)
    expect(userFixtureToday(c)).not.toBeNull()
    expect(continueBlocker(c)).toMatch(/Play or sim/)
    expect(continueCareer(c)).toBe(c)
    c = quickSim(c, userFixtureToday(c)!)
    c = continueCareer(c)
    expect(c.season.results.filter((r) => r.stage === 'league')).toHaveLength(5)
  })

  it('rolls into the next season: history, ages, fresh table, preseason stop', () => {
    const next = continueCareer(end)
    expect(next.calendar).toEqual({ year: 2027, day: 0 })
    expect(next.history).toHaveLength(1)
    expect(next.season.results).toHaveLength(0)
    expect(next.season.review).toBeNull()
    const kohli = (c: Career) => c.players.find((p) => p.name === 'Virat Kohli')
    if (kohli(next)) expect(kohli(next)?.age).toBe((kohli(c0)?.age ?? 0) + 1)
    expect(Array.isArray(next.history[0]?.retired)).toBe(true)
  })

  it('is deterministic', () => {
    expect(playToSeasonEnd(start()).season.results).toEqual(end.season.results)
  })
})

describe('market', () => {
  const c = start()
  const me = c.manager.teamId
  const best = freeAgents(c.players).sort((a, b) => overallRating(b) - overallRating(a))[0]!

  it('salary and asking price follow ability', () => {
    expect(salaryFor(85)).toBeGreaterThan(salaryFor(70))
    expect(salaryFor(40)).toBe(20)
    expect(askingSalary(best)).toBeGreaterThanOrEqual(20)
  })

  it('is closed during the season', () => {
    const inSeason = continueCareer(c)
    expect(offerBlocker(inSeason, best.id, { salary: 100, years: 2 })).toMatch(/closed/)
  })

  it('blocks offers over the cap', () => {
    expect(offerBlocker(c, best.id, { salary: capRoom(c.players, me) + 5, years: 2 })).toMatch(
      /cap/,
    )
  })

  it('negotiates: lowball rejected, close offer met halfway, his counter signs', () => {
    const need = requiredSalary(c, best, 2, TEAM_IDS)
    const room = capRoom(c.players, me)
    expect(need).toBeLessThanOrEqual(room) // otherwise this test needs a cheaper target
    const low = makeOffer(
      c,
      best.id,
      { salary: Math.max(20, Math.floor(need * 0.5)), years: 2 },
      TEAM_IDS,
    )
    expect(low.answer.kind).toBe('reject')
    const offered = Math.floor(need * 0.82)
    const near = makeOffer(low.career, best.id, { salary: offered, years: 2 }, TEAM_IDS)
    if (near.answer.kind === 'accept') return // a very keen player may take it
    expect(near.answer.kind).toBe('counter')
    if (near.answer.kind !== 'counter') return
    // Halfway between his ask and the offer, never above the ask.
    expect(near.answer.salary).toBeLessThanOrEqual(need + 5)
    expect(near.answer.salary).toBeGreaterThan(offered)
    const deal = makeOffer(
      near.career,
      best.id,
      { salary: near.answer.salary, years: near.answer.years },
      TEAM_IDS,
    )
    expect(deal.answer.kind).toBe('accept')
    const signed = deal.career.players.find((p) => p.id === best.id)
    expect(signed?.teamId).toBe(me)
    expect(capRoom(deal.career.players, me)).toBe(room - near.answer.salary)
    expect(deal.career.news.at(-1)?.kind).toBe('transfer')
  })

  it('agents differ: some keen (take less than their demand), some tough', () => {
    const fas = freeAgents(c.players)
    const labels = new Set(fas.map((p) => agentOf(c, p).label))
    expect(labels.size).toBeGreaterThanOrEqual(2)
    const keen = fas.find(
      (p) =>
        agentOf(c, p).greed < -0.08 && requiredSalary(c, p, 2, TEAM_IDS) <= capRoom(c.players, me),
    )
    if (keen) {
      const need = requiredSalary(c, keen, 2, TEAM_IDS)
      expect(
        makeOffer(c, keen.id, { salary: Math.ceil((need * 0.95) / 5) * 5, years: 2 }, TEAM_IDS)
          .answer.kind,
      ).toBe('accept')
    }
  })

  it('walks away when his patience runs out', () => {
    let x = c
    const patience = agentOf(c, best).patience
    for (let i = 0; i < patience; i++)
      x = makeOffer(x, best.id, { salary: 20, years: 1 }, TEAM_IDS).career
    expect(x.market.talks[best.id]?.walkedAway).toBe(true)
    expect(offerBlocker(x, best.id, { salary: 20, years: 1 })).toMatch(/ended talks/)
  })

  it('release keeps the squad minimum', () => {
    const mine = squadOf(c.players, me)
    const worst = [...mine].sort((a, b) => overallRating(a) - overallRating(b))[0]!
    // Squads start at exactly 18, the minimum.
    expect(releasePlayer(c, worst.id)).toBe(c)
  })

  it('trades: fair value accepted and executed, a bad deal refused', () => {
    const mine = squadOf(c.players, me).sort((a, b) => tradeValue(b) - tradeValue(a))
    const theirs = squadOf(c.players, 'mum').sort((a, b) => tradeValue(a) - tradeValue(b))
    const star = mine[0]!
    // Find a cheaper player of the same overseas status the other club would give up.
    const target = theirs.find(
      (p) =>
        p.overseas === star.overseas &&
        p.role === star.role &&
        tradeValue(p) * 1.05 <= tradeValue(star),
    )
    if (target) {
      expect(evaluateTrade(c, [star.id], [target.id])).toEqual({ ok: true })
      const after = executeTrade(c, [star.id], [target.id])
      expect(after.players.find((p) => p.id === star.id)?.teamId).toBe('mum')
      expect(after.players.find((p) => p.id === target.id)?.teamId).toBe(me)
    }
    const theirBest = squadOf(c.players, 'mum').sort((a, b) => tradeValue(b) - tradeValue(a))[0]!
    const myWorst = mine.at(-1)!
    expect(evaluateTrade(c, [myWorst.id], [theirBest.id]).ok).toBe(false)
  })
})

describe('contracts, retirements and squads over several seasons', () => {
  const c = playUntilYear(start(7, 'mum'), 2029)

  it('keeps every club able to field a side, with AI squads restocked', () => {
    expect(c.calendar.year).toBe(2029)
    for (const id of TEAM_IDS) {
      const squad = squadOf(c.players, id)
      expect(squad.length).toBeGreaterThanOrEqual(11)
      expect(squad.filter((p) => p.overseas).length).toBeLessThanOrEqual(8)
    }
  })

  it('records three seasons of history with retirements', () => {
    expect(c.history.map((h) => h.year)).toEqual([2026, 2027, 2028])
    expect(c.history.flatMap((h) => h.retired).length).toBeGreaterThan(0)
  })

  it('every contracted player has years left; nobody is under contract to a missing club', () => {
    for (const p of c.players) {
      if (p.teamId) {
        expect(TEAM_IDS).toContain(p.teamId)
        expect(p.contract?.years ?? 0).toBeGreaterThan(0)
      } else expect(p.contract).toBeNull()
    }
  })

  it('AI clubs mostly stay under the cap', () => {
    const over = TEAM_IDS.filter(
      (id) =>
        id !== c.manager.teamId &&
        squadOf(c.players, id).reduce((s, p) => s + (p.contract?.salary ?? 0), 0) >
          SALARY_CAP * 1.1,
    )
    expect(over.length).toBeLessThanOrEqual(2)
  })
})

describe('board', () => {
  it('objectives follow squad strength', () => {
    expect(objectiveForRank(1).targetPosition).toBe(4)
    expect(objectiveForRank(10).targetPosition).toBe(8)
    expect(start().season.objective.text).not.toBe('')
  })

  it('judges seasons', () => {
    const goal = { targetPosition: 4, text: '' }
    expect(judgeSeason(1, 'champion', goal).confidenceChange).toBeGreaterThan(30)
    expect(judgeSeason(5, 'league', goal).confidenceChange).toBe(-20)
    expect(judgeSeason(9, 'league', goal).confidenceChange).toBe(-35)
  })

  it('a bad enough season gets the manager sacked and stops the game', () => {
    const shaky: Career = { ...start(), manager: { ...start().manager, boardConfidence: 10 } }
    // Make the objective impossible to meet.
    const doomed: Career = {
      ...shaky,
      season: { ...shaky.season, objective: { targetPosition: 0, text: 'Win every game' } },
    }
    const end = playToSeasonEnd(doomed)
    expect(end.status).toBe('sacked')
    expect(end.season.review?.message).toMatch(/sacked/)
    expect(continueBlocker(end)).toMatch(/sacked/)
    expect(continueCareer(end)).toBe(end)
  })
})

describe('day helpers', () => {
  it('fixturesToday lists the round on a league day', () => {
    const c = continueCareer(start())
    expect(fixturesToday(c)).toHaveLength(5)
    expect(schedule(c).filter((f) => f.round === 1)).toEqual(fixturesToday(c))
  })

  it('advanceDay rolls the year', () => {
    let c = start()
    while (c.calendar.year === 2026) c = advanceDay(c)
    expect(c.calendar.year).toBe(2027)
  })
})

describe('living league: AI trades, offers, morale, news', () => {
  const two = playUntilYear(start(5, 'del'), 2028)

  it('AI clubs trade with each other and the news reports it', () => {
    const aiTrades = two.news.filter(
      (n) => n.kind === 'trade' && !n.teamIds.includes(two.manager.teamId),
    )
    expect(aiTrades.length).toBeGreaterThan(0)
    for (const id of TEAM_IDS)
      expect(squadOf(two.players, id).filter((p) => p.overseas).length).toBeLessThanOrEqual(8)
  })

  it('news covers the manager\u2019s results and the league', () => {
    expect(two.news.some((n) => n.kind === 'result' && n.teamIds.includes('del'))).toBe(true)
    expect(two.news.length).toBeGreaterThan(20)
  })

  it('accepting a trade offer swaps the players', () => {
    let c = start(9, 'che')
    for (let y = 2027; y <= 2030 && !c.news.some((n) => n.offer?.status === 'pending'); y++)
      c = playUntilYear(c, y)
    const offer = c.news.find((n) => n.offer?.status === 'pending')
    if (!offer?.offer) return
    const { career: after, message } = answerTradeOffer(c, offer.id, true)
    expect(message).toBe('Trade done!')
    expect(after.players.find((p) => p.id === offer.offer?.give[0])?.teamId).toBe(
      offer.offer.fromTeamId,
    )
    expect(after.players.find((p) => p.id === offer.offer?.get[0])?.teamId).toBe('che')
  })

  it('a word with an unhappy player lifts his morale once', () => {
    const c = start()
    const p = c.players.find((x) => x.teamId === c.manager.teamId)!
    const withItem = addNews(
      { ...c, players: c.players.map((x) => (x.id === p.id ? { ...x, morale: 20 } : x)) },
      {
        kind: 'morale',
        teamIds: [c.manager.teamId],
        playerId: p.id,
        text: 'unhappy',
        talk: { playerId: p.id, done: false },
      },
    )
    const id = withItem.news.at(-1)!.id
    const talked = talkToPlayer(withItem, id)
    expect(talked.players.find((x) => x.id === p.id)?.morale).toBe(35)
    expect(talkToPlayer(talked, id)).toBe(talked)
  })

  it('career stats add up across seasons', () => {
    const kohli = two.players.find((p) => p.name === 'Virat Kohli')
    const stat = kohli && two.careerStats[kohli.id]
    if (stat) expect(stat.matches).toBeGreaterThan(14)
  })

  it('form carries half into the new season', () => {
    const p = { ...start().players[0]!, form: 80 }
    expect(agePlayer(p, 1, 2026).form).toBe(65)
  })
})
