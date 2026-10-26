import { describe, expect, it } from 'vitest'
import { today } from './calendar'
import type { Career } from './career'
import { autoRenew, contractOutlook, renewalPlan, retirementOutlook } from './contracts'
import { autoPickXI } from './match/selection'
import { continueCareer, quickSim, startCareer, TEAM_IDS, userFixtureToday } from './game'
import {
  aiTradeOffers,
  answerTradeOffer,
  CASH_PER_POINT,
  judgeTrade,
  proposeDeal,
  tradeRounds,
  tradeTally,
  type TradeDeal,
  askingPrice,
  capRoom,
  evaluateTrade,
  OFFER_MIN,
  declineCounter,
  formRaise,
  makeOffer,
  marketAgents,
  offerBlocker,
  preferredYears,
  releasePlayer,
  renewalAsk,
  setLetGo,
  setListed,
  squadOf,
  SQUAD_MIN,
  isProspect,
  TALKS_COOLDOWN,
  tradeValue,
} from './market'
import { fundsOf } from './finance'
import { addNews } from './news'
import { overallRating } from './player'
import { createRng } from './rng'
import { suggestPackage, transferNeeds } from './transfers'

const start = (seed = 42, teamId = 'hyd') => startCareer({ seed, managerName: 'Test', teamId })

/** Play to the season-end day of the current year (review done, before rollover). */
function playToSeasonEnd(c: Career): Career {
  let guard = 0
  while (today(c.calendar).event?.type !== 'seasonEnd' && guard++ < 500) {
    const mine = userFixtureToday(c)
    c = mine ? quickSim(c, mine) : continueCareer(c)
  }
  return c
}

const me = (c: Career) => c.manager.teamId
const expiring = (c: Career) =>
  squadOf(c.players, me(c)).filter((p) => (p.contract?.years ?? 0) <= 1)

describe('the season-end forecast', () => {
  // A late season: enough veterans around for retirements.
  const end = playToSeasonEnd(start(11, 'che'))

  it('retirements forecast at season end are exactly the ones that happen', () => {
    const forecast = end.players
      .filter((p) => retirementOutlook(end, p) === 'retiring')
      .map((p) => p.name)
      .sort()
    const next = continueCareer(end)
    expect(next.calendar.year).toBe(end.calendar.year + 1)
    expect([...(next.history.at(-1)?.retired ?? [])].sort()).toEqual(forecast)
  })

  it('the players the Contracts screen says will leave are the ones who leave', () => {
    const o = contractOutlook(end, TEAM_IDS)
    expect(o.megaYear).toBe(false)
    const leaving = new Set(o.leaving.map((p) => p.id))
    const staying = squadOf(end.players, me(end)).filter((p) => !leaving.has(p.id))
    const after = new Set(squadOf(continueCareer(end).players, me(end)).map((p) => p.id))
    for (const id of leaving) expect(after.has(id)).toBe(false)
    for (const p of staying) expect(after.has(p.id)).toBe(true)
    expect(o.squadAfter).toBe(staying.length)
  })

  it('a final-year player renewed on the last day for one season plays next season', () => {
    const p = o(end).expiring.find((r) => r.status === 'open' && !r.rescued)!.p
    const years = 1
    const ask = askingPrice(end, p, years, TEAM_IDS)
    const signed = makeOffer(end, p.id, { salary: ask, years }, TEAM_IDS)
    expect(signed.answer.kind).toBe('accept')
    const next = continueCareer(signed.career)
    const after = next.players.find((x) => x.id === p.id)
    // Unless he retired, he is still here with exactly one season left.
    if (after) {
      expect(after.teamId).toBe(me(end))
      expect(after.contract?.years).toBe(1)
    }
  })

  it('letting a player go marks him as leaving', () => {
    const row = contractOutlook(end, TEAM_IDS).expiring.find((r) => r.status === 'open')!
    const out = contractOutlook(setLetGo(end, row.p.id, true), TEAM_IDS)
    expect(out.expiring.find((r) => r.p.id === row.p.id)?.status).toBe('letGo')
    expect(out.undecided.map((p) => p.id)).not.toContain(row.p.id)
  })
})

const o = (c: Career) => contractOutlook(c, TEAM_IDS)

describe('renewals', () => {
  const c = start()

  it('can be done in the season, and add seasons to the current deal', () => {
    const inSeason = continueCareer(c)
    const p = expiring(inSeason)[0]!
    const ask = askingPrice(inSeason, p, 2, TEAM_IDS)
    const r = makeOffer(inSeason, p.id, { salary: ask, years: 2 }, TEAM_IDS)
    expect(r.answer.kind).toBe('accept')
    expect(r.career.players.find((x) => x.id === p.id)?.contract).toEqual({ salary: ask, years: 3 })
  })

  it('ask follows form: in form +30-50%, average +10-20%, out of form a pay cut', () => {
    expect(formRaise(85)).toBeCloseTo(0.5)
    expect(formRaise(65)).toBeCloseTo(0.3)
    expect(formRaise(55)).toBeCloseTo(0.15)
    expect(formRaise(45)).toBeCloseTo(0.1)
    expect(formRaise(44)).toBeLessThanOrEqual(0)
    expect(formRaise(20)).toBeCloseTo(-0.25)
    const p = expiring(c)[0]!
    const at = (form: number) =>
      renewalAsk(c, { ...p, form, contract: { salary: 200, years: 1 } }, 2)
    // A ₹2 cr player never asks much more than ₹3 cr, and takes a cut when out of form.
    expect(at(95)).toBeLessThanOrEqual(Math.ceil((300 * 1.25) / 5) * 5)
    expect(at(30)).toBeLessThan(at(55))
    expect(at(55)).toBeLessThan(at(80))
  })
})

describe('negotiation', () => {
  // Room in the squad for free agents: let the three weakest go.
  let c = start()
  for (const p of squadOf(c.players, me(c))
    .sort((a, b) => overallRating(a) - overallRating(b))
    .slice(0, 3))
    c = releasePlayer(c, p.id)
  const fas = marketAgents(c).filter(
    (p) => !p.overseas && askingPrice(c, p, 2, TEAM_IDS) <= capRoom(c.players, me(c)),
  )
  const all = [...fas, ...expiring(c)]

  it('offering his ask always signs him', () => {
    for (const p of all) {
      const years = preferredYears(p.age)
      const offer = { salary: askingPrice(c, p, years, TEAM_IDS), years }
      if (offerBlocker(c, p.id, offer)) continue
      expect(makeOffer(c, p.id, offer, TEAM_IDS).answer.kind).toBe('accept')
    }
  })

  it('two rounds at most: a low offer gets one counter, then he signs or walks', () => {
    for (const p of all) {
      const ask = askingPrice(c, p, 2, TEAM_IDS)
      const low = Math.ceil((ask * OFFER_MIN) / 5) * 5
      if (offerBlocker(c, p.id, { salary: ask, years: 2 })) continue
      const r = makeOffer(c, p.id, { salary: low, years: 2 }, TEAM_IDS)
      if (r.answer.kind === 'accept') continue // a keen agent may take 88%
      expect(r.answer.kind).toBe('counter')
      if (r.answer.kind !== 'counter') continue
      expect(r.answer.salary).toBeLessThanOrEqual(ask)
      expect(
        makeOffer(r.career, p.id, { salary: r.answer.salary, years: 2 }, TEAM_IDS).answer.kind,
      ).toBe('accept')
      const again = makeOffer(r.career, p.id, { salary: low, years: 2 }, TEAM_IDS)
      expect(again.answer.kind).toBe('reject')
      expect(again.career.market.talks[p.id]?.walkedAway).toBe(true)
    }
  })

  it('declining his counter ends talks for a fortnight', () => {
    const p = fas[0]!
    const ask = askingPrice(c, p, 2, TEAM_IDS)
    const x = declineCounter(c, p.id)
    expect(offerBlocker(x, p.id, { salary: ask, years: 2 })).toMatch(/listen again/)
    const later = { ...x, calendar: { ...x.calendar, day: x.calendar.day + TALKS_COOLDOWN } }
    expect(offerBlocker(later, p.id, { salary: ask, years: 2 })).toBeNull()
  })
})

describe('transfer hub', () => {
  const c = start()

  it('needs come with options that fill them', () => {
    const needs = transferNeeds(c, TEAM_IDS)
    expect(needs.length).toBeLessThanOrEqual(4)
    for (const n of needs) {
      expect(n.options.length).toBeLessThanOrEqual(3)
      for (const t of n.options) expect(t.p.teamId === null).toBe(t.kind === 'free')
    }
  })

  it('suggested trade packages are accepted', () => {
    const theirs = squadOf(c.players, 'mum').sort((a, b) => tradeValue(b) - tradeValue(a))
    let tried = 0
    for (const target of theirs.slice(2, 8)) {
      const give = suggestPackage(c, [target.id])
      if (!give) continue
      tried++
      expect(give.length).toBeLessThanOrEqual(3)
      expect(evaluateTrade(c, give, [target.id])).toEqual({ ok: true })
    }
    expect(tried).toBeGreaterThan(0)
  })

  it('listing a player brings offers for him', () => {
    const p = squadOf(c.players, me(c)).sort((a, b) => tradeValue(a) - tradeValue(b))[8]!
    const listed = setListed(c, p.id, true)
    const out = aiTradeOffers(listed, TEAM_IDS, createRng(1), 2, p.id)
    const offers = out.news.filter((n) => n.offer?.status === 'pending')
    expect(offers.length).toBeGreaterThan(0)
    expect(offers.every((n) => n.offer?.give.includes(p.id))).toBe(true)
  })
})

describe('trades with cash', () => {
  const c = start()
  const my = me(c)
  /** Plenty of funds and three free squad places (a new squad starts full). */
  const rich = (x: Career, amount = 5000): Career => {
    const weakest = new Set(
      squadOf(x.players, my)
        .sort((a, b) => overallRating(a) - overallRating(b))
        .slice(0, 3)
        .map((p) => p.id),
    )
    return {
      ...x,
      funds: { ...x.funds, [my]: amount },
      players: x.players.map((p) =>
        weakest.has(p.id) ? { ...p, teamId: null, contract: null } : p,
      ),
    }
  }
  /** The cash that gets a player (none of yours going back). */
  const cashFor = (x: Career, id: string) => {
    let cash = 5
    while (tradeTally(x, { club: 'mum', give: [], get: [id], cash }).progress < 1) cash += 5
    return cash
  }
  const theirs = squadOf(c.players, 'mum').sort((a, b) => tradeValue(a) - tradeValue(b))

  it('cash buys a player: funds move, the cap only sees his salary', () => {
    const x = rich(c)
    const target = theirs.find(
      (p) =>
        judgeTrade(x, { club: 'mum', give: [], get: [p.id], cash: cashFor(x, p.id) }).kind ===
        'accept',
    )!
    expect(target).toBeDefined()
    const cash = cashFor(x, target.id)
    const { career: after, reply } = proposeDeal(x, {
      club: 'mum',
      give: [],
      get: [target.id],
      cash,
    })
    expect(reply.kind).toBe('accept')
    expect(after.players.find((p) => p.id === target.id)?.teamId).toBe(my)
    expect(fundsOf(after, my)).toBe(5000 - cash)
    expect(fundsOf(after, 'mum')).toBe(fundsOf(x, 'mum') + cash)
    expect(capRoom(after.players, my)).toBe(capRoom(x.players, my) - (target.contract?.salary ?? 0))
    // Cash counts a little below players: the same value in cash costs more than 5 L a point.
    expect(cash).toBeGreaterThan(tradeValue(target) * 1.05 * CASH_PER_POINT)
  })

  it('a short offer gets a counter; meeting it closes the deal', () => {
    const x = rich(c)
    const target = theirs.find(
      (p) =>
        judgeTrade(x, { club: 'mum', give: [], get: [p.id], cash: cashFor(x, p.id) }).kind ===
        'accept',
    )!
    const low: TradeDeal = { club: 'mum', give: [], get: [target.id], cash: 5 }
    const first = proposeDeal(x, low)
    expect(first.reply.kind).toBe('counter')
    if (first.reply.kind !== 'counter') return
    expect(first.reply.cash).toBe(cashFor(x, target.id))
    expect(tradeRounds(first.career, 'mum')).toBe(1)
    const second = proposeDeal(first.career, { ...low, cash: first.reply.cash as number })
    expect(second.reply.kind).toBe('accept')
    expect(tradeRounds(second.career, 'mum')).toBe(0)
  })

  it('after three counters the club stops talking', () => {
    let x = rich(c)
    const deal: TradeDeal = { club: 'mum', give: [], get: [theirs[3]!.id], cash: 5 }
    const kinds: string[] = []
    for (let i = 0; i < 4; i++) {
      const r = proposeDeal(x, deal)
      kinds.push(r.reply.kind === 'counter' && r.reply.final ? 'final' : r.reply.kind)
      x = r.career
    }
    expect(kinds).toEqual(['counter', 'counter', 'final', 'reject'])
  })

  it("you can't spend money you don't have", () => {
    const poor = { ...c, funds: { ...c.funds, [my]: 50 } }
    const r = judgeTrade(poor, { club: 'mum', give: [], get: [theirs[3]!.id], cash: 100 })
    expect(r.kind).toBe('reject')
  })

  it('a club short in a role wants a player back, not just cash', () => {
    // Leave MUM with exactly five bowlers, then try to buy one of them for cash.
    const bowlers = squadOf(c.players, 'mum').filter((p) => p.role === 'bowler')
    const spare = new Set(bowlers.slice(5).map((p) => p.id))
    const x = rich({
      ...c,
      players: c.players.map((p) => (spare.has(p.id) ? { ...p, teamId: null, contract: null } : p)),
    })
    const target = bowlers.slice(0, 5).find((p) => !p.injury && !p.overseas)!
    const r = judgeTrade(x, { club: 'mum', give: [], get: [target.id], cash: 4000 })
    expect(r.kind).not.toBe('accept')
    if (r.kind === 'counter') {
      expect(x.players.find((p) => p.id === r.player)?.role).toBe('bowler')
    } else {
      expect(r.kind === 'reject' && r.message).toMatch(/bowler/)
    }
  })

  it('a cash offer from the news pays the manager', () => {
    const p = squadOf(c.players, my).sort((a, b) => tradeValue(a) - tradeValue(b))[6]!
    const x = addNews(c, {
      kind: 'offer',
      teamIds: [my, 'mum'],
      text: 'test',
      offer: { fromTeamId: 'mum', give: [p.id], get: [], cash: -200, status: 'pending' },
    })
    const id = x.news.at(-1)!.id
    const { career: after } = answerTradeOffer(x, id, true)
    expect(after.players.find((q) => q.id === p.id)?.teamId).toBe('mum')
    expect(fundsOf(after, my)).toBe(fundsOf(x, my) + 200)
    expect(fundsOf(after, 'mum')).toBe(fundsOf(x, 'mum') - 200)
  })
})

describe("the PA's renewals", () => {
  const c = start()
  const plan = renewalPlan(c, TEAM_IDS)

  it('has a decision and a reason for every undecided final-year player', () => {
    const undecided = contractOutlook(c, TEAM_IDS).undecided
    expect(plan.length).toBe(undecided.length)
    expect(plan.length).toBeGreaterThan(0)
    for (const r of plan) expect(r.reason.length).toBeGreaterThan(5)
  })

  it('keeps the XI regulars', () => {
    const xi = new Set(autoPickXI(squadOf(c.players, me(c))).map((p) => p.id))
    for (const r of plan) if (xi.has(r.p.id)) expect(r.keep).toBe(true)
  })

  it('settles everyone, pays no more than the ask, and keeps the squad at the minimum', () => {
    const { career: after, lines } = autoRenew(c, TEAM_IDS)
    expect(lines.length).toBe(plan.length)
    const o = contractOutlook(after, TEAM_IDS)
    expect(o.undecided).toHaveLength(0)
    for (const r of plan.filter((r) => r.keep)) {
      const now = after.players.find((p) => p.id === r.p.id)!
      if ((now.contract?.years ?? 0) > 1) expect(now.contract!.salary).toBeLessThanOrEqual(r.ask)
    }
    expect(o.squadAfter).toBeGreaterThanOrEqual(Math.min(SQUAD_MIN, o.squadNow))
  })
})

describe('free agents', () => {
  it('about 70% of the list are young prospects, from the very first season', () => {
    const c = start()
    const agents = marketAgents(c)
    expect(agents.length).toBeGreaterThanOrEqual(16)
    const young = agents.filter(isProspect).length / agents.length
    expect(young).toBeGreaterThan(0.6)
    expect(young).toBeLessThan(0.8)
  })
})
