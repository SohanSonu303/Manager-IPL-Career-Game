import { describe, expect, it } from 'vitest'
import { today } from './calendar'
import type { Career } from './career'
import { contractOutlook, retirementOutlook } from './contracts'
import { continueCareer, quickSim, startCareer, TEAM_IDS, userFixtureToday } from './game'
import {
  aiTradeOffers,
  askingPrice,
  askingSalary,
  capRoom,
  evaluateTrade,
  LOWBALL,
  makeOffer,
  marketAgents,
  offerBlocker,
  preferredYears,
  releasePlayer,
  renewalCeiling,
  setLetGo,
  setListed,
  squadOf,
  TALKS_COOLDOWN,
  tradeValue,
} from './market'
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

  it('never ask much more than market value, or more than double their pay', () => {
    for (const p of expiring(c)) {
      for (const years of [1, 2, 3]) {
        const ask = askingPrice(c, p, years, TEAM_IDS)
        expect(ask).toBeLessThanOrEqual(renewalCeiling(p))
        expect(ask).toBeLessThanOrEqual(Math.ceil((askingSalary(p) * 1.1) / 5) * 5)
      }
    }
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

  it('a reasonable first offer gets a counter (or a yes), never a walk-out', () => {
    for (const p of all) {
      const ask = askingPrice(c, p, 2, TEAM_IDS)
      const r = makeOffer(c, p.id, { salary: Math.ceil(ask * LOWBALL), years: 2 }, TEAM_IDS)
      expect(['counter', 'accept']).toContain(r.answer.kind)
      expect(r.career.market.talks[p.id]?.walkedAway ?? false).toBe(false)
    }
  })

  it('counters come down towards the offer, then a final offer, then he walks', () => {
    const p = fas[0]!
    const ask = askingPrice(c, p, 2, TEAM_IDS)
    const low = Math.ceil((ask * 0.65) / 5) * 5
    let x = c
    let last = Infinity
    let sawFinal = false
    for (let i = 0; i < 6; i++) {
      const r = makeOffer(x, p.id, { salary: low, years: 2 }, TEAM_IDS)
      x = r.career
      if (r.answer.kind === 'counter') {
        expect(r.answer.salary).toBeLessThanOrEqual(last)
        expect(r.answer.salary).toBeGreaterThan(low)
        last = r.answer.salary
        sawFinal ||= r.answer.final
      } else {
        expect(r.answer.kind).toBe('reject')
        break
      }
    }
    expect(sawFinal).toBe(true)
    expect(x.market.talks[p.id]?.walkedAway).toBe(true)
    expect(offerBlocker(x, p.id, { salary: ask, years: 2 })).toMatch(/listen again/)
    // A fortnight later he listens again.
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
