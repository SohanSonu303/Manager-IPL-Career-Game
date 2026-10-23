import { describe, expect, it } from 'vitest'
import {
  autoAuction,
  buildSets,
  ceilingFor,
  confirmRetention,
  increment,
  isMegaYear,
  nextBid,
  nextMegaSeason,
  nextSetOfKind,
  progress,
  RETAIN_MAX,
  retentionBlocker,
  retentionPrices,
  setAutoBid,
  simAuction,
  suggestRetention,
  setShortlist,
  setStopForShortlist,
  defaultMax,
  userBid,
  userBidBlocker,
  userBidUpTo,
  userPass,
  userWatch,
  nextLot,
  placeBid,
  rivalRaise,
  hammer,
} from './auction'
import type { Career } from './career'
import {
  continueBlocker,
  continueCareer,
  finishMega,
  quickSim,
  startCareer,
  TEAM_IDS,
  userFixtureToday,
} from './game'
import {
  FREE_AGENT_MAX,
  marketAgents,
  offerBlocker,
  payroll,
  SALARY_CAP,
  SQUAD_MAX,
  SQUAD_MIN,
  SQUAD_OVERSEAS_MAX,
  squadOf,
  freeAgents,
} from './market'

/** Play on until the first mega auction is waiting (retention stage). */
function toMega(seed = 7, teamId = 'mum'): Career {
  let c = startCareer({ seed, managerName: 'T', teamId })
  for (let guard = 0; !c.mega && guard < 1000; guard++) {
    const mine = userFixtureToday(c)
    c = mine ? quickSim(c, mine) : continueCareer(c)
  }
  return c
}

const mega = toMega()
const byId = (c: Career, id: string) => c.players.find((p) => p.id === id)!
const me = mega.manager.teamId

describe('when a mega auction happens', () => {
  it('follows every third season, starting with the third', () => {
    expect([2026, 2027, 2028, 2029, 2030, 2031].map(isMegaYear)).toEqual([
      false,
      false,
      true,
      false,
      false,
      true,
    ])
    expect(nextMegaSeason(2026)).toBe(2028)
    expect(nextMegaSeason(2028)).toBe(2028)
    expect(nextMegaSeason(2029)).toBe(2031)
  })

  it('holds the new season until retention and the auction are done', () => {
    expect(mega.calendar.year).toBe(2029)
    expect(mega.mega?.stage).toBe('retention')
    expect(mega.history.map((h) => h.year)).toEqual([2026, 2027, 2028])
    expect(continueBlocker(mega)).toMatch(/mega auction/)
    expect(continueCareer(mega)).toBe(mega)
    // Squads are untouched until the retentions are in.
    expect(squadOf(mega.players, me).length).toBeGreaterThanOrEqual(11)
  })

  it('shuts the market while it runs', () => {
    const fa = marketAgents(mega)[0]
    if (fa) expect(offerBlocker(mega, fa.id, { salary: 100, years: 2 })).toMatch(/mega auction/)
  })
})

describe('retention', () => {
  const mine = squadOf(mega.players, me)

  it('allows up to five, at most two of them overseas, all of them yours', () => {
    const domestic = mine.filter((p) => !p.overseas)
    const overseas = mine.filter((p) => p.overseas)
    expect(
      retentionBlocker(
        mega,
        domestic.slice(0, RETAIN_MAX).map((p) => p.id),
      ),
    ).toBeNull()
    expect(retentionBlocker(mega, [])).toBeNull()
    expect(
      retentionBlocker(
        mega,
        mine.slice(0, RETAIN_MAX + 1).map((p) => p.id),
      ),
    ).toMatch(/at most/)
    expect(
      retentionBlocker(
        mega,
        overseas.slice(0, 3).map((p) => p.id),
      ),
    ).toMatch(/overseas/)
    const stranger = squadOf(
      mega.players,
      TEAM_IDS.find((t) => t !== me)!,
    )[0]!
    expect(retentionBlocker(mega, [stranger.id])).toMatch(/own players/)
    expect(retentionBlocker(mega, [mine[0]!.id, mine[0]!.id])).toMatch(/twice/)
  })

  it('suggests a legal set of five', () => {
    const ids = suggestRetention(mega)
    expect(ids).toHaveLength(RETAIN_MAX)
    expect(retentionBlocker(mega, ids)).toBeNull()
  })

  it('prices the slabs by value', () => {
    const ids = suggestRetention(mega)
    const prices = retentionPrices(ids.map((id) => mega.players.find((p) => p.id === id)!))
    expect(Object.values(prices).sort((a, b) => b - a)).toEqual([1800, 1400, 1100, 900, 700])
  })

  const ids = suggestRetention(mega)
  const after = confirmRetention(mega, ids)
  const m = after.mega!

  it('keeps only the retained players; everyone else joins the pool', () => {
    const kept = new Set(Object.values(m.retained).flat())
    for (const p of after.players) {
      if (kept.has(p.id)) expect(p.teamId).not.toBeNull()
      else {
        expect(p.teamId).toBeNull()
        expect(p.contract).toBeNull()
      }
    }
    expect(m.retained[me]).toEqual(ids)
    for (const t of TEAM_IDS) {
      expect(m.retained[t]!.length).toBeLessThanOrEqual(RETAIN_MAX)
      expect(m.retained[t]!.length).toBeGreaterThanOrEqual(4 - (t === me ? 4 : 0))
      expect(
        m.retained[t]!.filter((id) => after.players.find((p) => p.id === id)?.overseas).length,
      ).toBeLessThanOrEqual(2)
    }
  })

  it('leaves the rest of the cap as the purse', () => {
    for (const t of TEAM_IDS) {
      expect(m.purses[t]).toBe(SALARY_CAP - payroll(after.players, t))
      expect(m.purses[t]).toBeGreaterThan(0)
    }
  })

  it('puts every pool player in exactly one set', () => {
    const inSets = m.sets.flatMap((s) => s.ids)
    const pool = freeAgents(after.players).map((p) => p.id)
    expect([...inSets].sort()).toEqual([...pool].sort())
    expect(m.sets[0]?.kind).toBe('marquee')
    expect(m.sets.every((s) => s.ids.length > 0 && s.ids.length <= 10)).toBe(true)
  })

  it('rejects a bad retention and does nothing', () => {
    expect(
      confirmRetention(
        mega,
        mine.slice(0, 6).map((p) => p.id),
      ),
    ).toBe(mega)
  })
})

describe('sets', () => {
  const m = confirmRetention(mega, suggestRetention(mega)).mega!

  it('go marquee, then rounds of batters, all-rounders, keepers, fast bowlers, spinners', () => {
    expect(m.sets.slice(1, 6).map((s) => s.kind)).toEqual(['bat', 'ar', 'wk', 'fast', 'spin'])
    expect(m.sets[1]?.label).toBe('Batters 1')
  })

  it('finds the next set of a kind', () => {
    expect(nextSetOfKind(m, 'bat')).toBe(1)
    expect(nextSetOfKind(m, 'spin')).toBe(5)
    expect(nextSetOfKind({ ...m, setIndex: 1 }, 'bat')).toBe(6)
  })

  it('is empty-safe', () => {
    expect(buildSets([], 1).filter((s) => s.ids.length)).toEqual([])
  })
})

describe('bidding', () => {
  const start = nextLot(confirmRetention(mega, suggestRetention(mega)))
  const lot = () => start.mega!.lot!

  it('opens a lot at its base price, with nobody holding the bid', () => {
    expect(lot().bidderId).toBeNull()
    expect(lot().bid).toBe(lot().base)
    expect(nextBid(lot())).toBe(lot().base)
    expect(progress(start.mega!)).toMatchObject({ done: 0 })
  })

  it('steps by finer amounts at the bottom', () => {
    expect([50, 150, 300, 800].map(increment)).toEqual([5, 10, 25, 50])
  })

  it('a rival answers the manager’s bid, or the player is his', () => {
    const c = userBid(start)
    if (c.mega?.lot) {
      expect(c.mega.lot.bidderId).not.toBe(me)
      expect(c.mega.lot.bid).toBeGreaterThan(lot().base)
    } else {
      expect(c.mega?.last?.teamId).toBe(me)
      expect(c.players.find((p) => p.id === lot().playerId)?.teamId).toBe(me)
      expect(c.mega?.purses[me]).toBe(start.mega!.purses[me]! - lot().base)
    }
  })

  it('bidding up to a limit never goes past it and never spends more than the purse', () => {
    const c = userBidUpTo(start, 400)
    const l = c.mega?.lot
    if (l && l.bidderId === me) expect(l.bid).toBeLessThanOrEqual(400)
    expect(c.mega!.purses[me]!).toBeGreaterThanOrEqual(0)
  })

  it('passing hands the lot to the rivals and moves on', () => {
    const c = userPass(start)
    expect(c.mega?.lot).toBeNull()
    expect(c.mega?.lotIndex).toBe(1)
    expect(c.mega?.last?.teamId).not.toBe(me)
    expect((c.mega?.sold.length ?? 0) + (c.mega?.unsold.length ?? 0)).toBe(1)
  })

  it('cannot bid after passing, or on a full squad, or without money', () => {
    const l = start.mega!.lot!
    const passed = { ...start, mega: { ...start.mega!, lot: { ...l, out: true } } }
    expect(userBidBlocker(passed)).toMatch(/dropped out/)
    const broke = {
      ...start,
      mega: { ...start.mega!, purses: { ...start.mega!.purses, [me]: 5 } },
    }
    expect(userBidBlocker(broke)).toBeTruthy()
    expect(userBid(broke)).toBe(broke)
  })

  it('watching lets the rivals bid; it ends in a sale or no sale', () => {
    let c = start
    for (let i = 0; i < 200 && c.mega?.lot; i++) c = userWatch(c)
    expect(c.mega?.lot).toBeNull()
    expect(c.mega?.lotIndex).toBe(1)
  })

  it('live room: the manager bids, a rival answers on its turn, the hammer sells', () => {
    const mine = placeBid(start)
    expect(mine.mega!.lot!.bidderId).toBe(me)
    expect(mine.mega!.lot!.bid).toBe(lot().base)
    // Nobody answers until the clock gives the rivals their turn.
    expect(mine.mega!.lot!.trail.at(-1)).toEqual({ teamId: me, bid: lot().base })
    const turn = rivalRaise(mine)
    if (turn.raised) {
      expect(turn.career.mega!.lot!.bidderId).not.toBe(me)
      expect(turn.career.mega!.lot!.bid).toBeGreaterThan(lot().base)
    } else expect(turn.career).toBe(mine)
    const sold = hammer(mine)
    expect(sold.mega!.lot).toBeNull()
    expect(sold.mega!.last).toEqual({ playerId: lot().playerId, teamId: me, price: lot().base })
    expect(sold.players.find((p) => p.id === lot().playerId)?.teamId).toBe(me)
  })

  it('rivals keep bidding against each other until nobody will go higher', () => {
    let c = start
    let raises = 0
    for (let r = rivalRaise(c); r.raised && raises < 500; r = rivalRaise(c)) {
      c = r.career
      raises++
    }
    expect(raises).toBeLessThan(500)
    expect(rivalRaise(c).raised).toBe(false)
  })

  it('placing a bid is blocked when the manager cannot afford it', () => {
    const broke = { ...start, mega: { ...start.mega!, purses: { ...start.mega!.purses, [me]: 5 } } }
    expect(placeBid(broke)).toBe(broke)
  })

  it('is deterministic', () => {
    expect(JSON.stringify(userPass(start))).toBe(JSON.stringify(userPass(start)))
  })

  it('a club never bids more than its purse allows', () => {
    const m = start.mega!
    for (const t of TEAM_IDS)
      for (const p of freeAgents(start.players).slice(0, 40))
        expect(ceilingFor(start, m, t, p, 0.9)).toBeLessThanOrEqual(m.purses[t]!)
  })
})

describe('simming', () => {
  const ready = confirmRetention(mega, suggestRetention(mega))

  it('sim lot settles one lot', () => {
    const r = simAuction(ready)
    expect(r.lots).toBe(1)
    expect(r.career.mega?.lot).toBeNull()
    expect(r.career.mega?.lotIndex).toBe(1)
  })

  it('sim to a set stops at the start of that set', () => {
    const r = simAuction(ready, 2)
    expect(r.stopped).toBe('set')
    expect(r.career.mega?.setIndex).toBe(2)
    expect(r.career.mega?.lotIndex).toBe(0)
    expect(r.lots).toBe(ready.mega!.sets[0]!.ids.length + ready.mega!.sets[1]!.ids.length)
  })

  it('bids for a shortlisted player up to his max, even with the captain off', () => {
    const id = ready.mega!.sets[0]!.ids[0]!
    const off = setAutoBid(setShortlist(ready, id, 6000), false)
    const r = simAuction(off, 'end')
    const sale = r.career.mega!.sold.find((x) => x.playerId === id)
    expect(sale?.teamId).toBe(me)
    expect(sale!.price).toBeLessThanOrEqual(6000)
    expect(r.bought).toContain(r.career.players.find((p) => p.id === id)!.name)
  })

  it('never pays more than the max, and misses him if the max is too low', () => {
    const id = ready.mega!.sets[0]!.ids[0]!
    const off = setAutoBid(setShortlist(ready, id, 20), false)
    const r = simAuction(off, 'end')
    expect(r.career.mega!.sold.find((x) => x.playerId === id)?.teamId).not.toBe(me)
    expect(r.missed).toContain(r.career.players.find((p) => p.id === id)!.name)
    expect(r.biggest?.price).toBeGreaterThan(0)
  })

  it('can stop for a shortlisted lot so the manager bids himself', () => {
    const target = ready.mega!.sets[3]!.ids[4]!
    const stop = setStopForShortlist(
      setShortlist(ready, target, defaultMax(byId(ready, target))),
      true,
    )
    const r = simAuction(stop, 'end')
    expect(r.stopped).toBe('target')
    expect(r.career.mega?.lot?.playerId).toBe(target)
    expect(r.at).toBe(ready.mega!.sets[3]!.label)
    // Taken off the shortlist, the sim runs on.
    const clear = setShortlist(r.career, target, null)
    expect(simAuction(clear, 'end').stopped).not.toBe('target')
  })

  it('the captain only buys players the manager did not shortlist when asked to', () => {
    const off = simAuction(setAutoBid(ready, false), 'end').career
    const on = simAuction(setAutoBid(ready, true), 'end').career
    expect(off.mega!.sold.filter((s) => s.teamId === me)).toHaveLength(0)
    expect(on.mega!.sold.filter((s) => s.teamId === me).length).toBeGreaterThan(0)
  })

  it('shortlist max is rounded to 5 lakh and can be removed', () => {
    const id = ready.mega!.sets[0]!.ids[0]!
    expect(setShortlist(ready, id, 1234).mega!.shortlist[id]).toBe(1235)
    expect(setShortlist(setShortlist(ready, id, 500), id, null).mega!.shortlist).toEqual({})
  })

  it('runs the whole auction and ends consistent', () => {
    const done = autoAuction(mega)
    const m = done.mega!
    expect(m.stage).toBe('done')
    expect(m.lot).toBeNull()
    const ids = m.sold.map((s) => s.playerId)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of TEAM_IDS) {
      expect(m.purses[t]).toBeGreaterThanOrEqual(0)
      const squad = squadOf(done.players, t)
      expect(squad.length).toBeLessThanOrEqual(SQUAD_MAX)
      expect(squad.filter((p) => p.overseas).length).toBeLessThanOrEqual(SQUAD_OVERSEAS_MAX)
      expect(payroll(done.players, t)).toBeLessThanOrEqual(SALARY_CAP)
    }
    for (const s of m.sold) {
      const p = done.players.find((x) => x.id === s.playerId)!
      expect(p.teamId).toBe(s.teamId)
      expect(p.contract?.salary).toBe(s.price)
      expect(p.contract?.years).toBeGreaterThan(0)
    }
  })

  it('finishing leaves playable squads, a legal market and no auction', () => {
    const end = finishMega(autoAuction(mega))
    expect(end.mega).toBeNull()
    expect(continueBlocker(end)).toBeNull()
    for (const t of TEAM_IDS) {
      const squad = squadOf(end.players, t)
      expect(squad.length).toBeGreaterThanOrEqual(SQUAD_MIN)
      expect(squad.some((p) => p.role === 'wicketkeeper')).toBe(true)
      for (const p of squad) expect(p.contract?.years ?? 0).toBeGreaterThan(0)
    }
    expect(marketAgents(end).length).toBeLessThanOrEqual(FREE_AGENT_MAX)
    expect(end.lineup).toBeUndefined()
    // The new season can start.
    expect(continueCareer(end)).not.toBe(end)
  })

  it('is deterministic from the seed', () => {
    expect(JSON.stringify(finishMega(autoAuction(mega)).players)).toBe(
      JSON.stringify(finishMega(autoAuction(mega)).players),
    )
  })

  it('finishMega does nothing before the hammer falls on the last lot', () => {
    expect(finishMega(ready)).toBe(ready)
    expect(finishMega(mega)).toBe(mega)
  })
})
