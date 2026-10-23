import { describe, expect, it } from 'vitest'
import {
  CAPABILITIES,
  capabilities,
  depthFor,
  evaluatePlayer,
  personalityOf,
  planFor,
  primaryRole,
  squadNeeds,
  STYLE_ORDER,
  type AuctionView,
  type ClubView,
  type Personality,
} from './auctionAI'
import type { CareerPlayer } from './career'
import { startCareer, TEAM_IDS } from './game'
import { askingSalary, SQUAD_MIN } from './market'
import { overallRating } from './player'

/*
 * Scenario tests for the CPU clubs' auction brain, on real players from the game data.
 * Each builds the public auction state a club would see and checks its decision.
 */

const all = startCareer({ seed: 3, managerName: 'T', teamId: 'mum' }).players
const by = (test: (p: CareerPlayer) => boolean) =>
  all.filter(test).sort((a, b) => overallRating(b) - overallRating(a))
const pacers = by((p) => p.role === 'bowler' && p.bowlingType === 'pace')
const spinners = by((p) => p.role === 'bowler' && p.bowlingType === 'spin')
const batters = by((p) => p.role === 'batter')
const keepers = by((p) => p.role === 'wicketkeeper')
const allrounders = by((p) => p.role === 'allrounder')
const deathBowlers = by((p) => (capabilities(p).death ?? 0) >= 1)

const BALANCED: Personality = {
  style: 'balanced',
  premium: 1.08,
  maxShare: 0.27,
  patience: 0,
  squadTarget: 22,
  eagerness: 1,
}

function club(teamId: string, squad: CareerPlayer[], purse: number, p = BALANCED): ClubView {
  return {
    teamId,
    squad,
    overseas: squad.filter((x) => x.overseas).length,
    purse,
    needs: squadNeeds(squad, planFor(teamId)),
    personality: p,
  }
}

function view(clubs: ClubView[], pool: CareerPlayer[], progress = 0.3): AuctionView {
  return {
    clubs: Object.fromEntries(clubs.map((c) => [c.teamId, c])),
    pool,
    lotsLeft: pool.length + 1,
    progress,
    accelerated: false,
  }
}

const notIn = (squad: CareerPlayer[], list: CareerPlayer[]) =>
  list.filter((p) => !squad.includes(p))

/** A balanced five: two batters, a keeper, an all-rounder, a spinner. */
const core = [batters[0]!, batters[1]!, keepers[0]!, allrounders[0]!, spinners[0]!]

describe('tactical roles come from real attributes', () => {
  it('every player fills at least one role, keepers keep and bowlers bowl', () => {
    for (const p of all) expect(Object.keys(capabilities(p)).length).toBeGreaterThan(0)
    for (const k of keepers) expect(capabilities(k).keeper).toBe(1)
    for (const b of pacers) expect(capabilities(b).pace).toBe(1)
    for (const s of spinners) expect(capabilities(s).spin).toBe(1)
  })

  it('death and new-ball specialists come from skills', () => {
    expect(deathBowlers.length).toBeGreaterThan(3)
    expect(
      deathBowlers.every((p) =>
        p.traits.some((t) => t === 'death-bowler' || t === 'yorker-specialist'),
      ),
    ).toBe(true)
  })

  it('needs follow the squad: an empty squad needs everything, a covered role nothing', () => {
    const empty = squadNeeds([], planFor('mum'))
    for (const c of CAPABILITIES) expect(empty[c].short).toBeGreaterThan(0)
    const lotsOfKeepers = squadNeeds(keepers.slice(0, 4), planFor('mum'))
    expect(lotsOfKeepers.keeper.short).toBe(0)
  })
})

describe('characters', () => {
  it('every style is dealt across the ten clubs, and the deal follows the seed', () => {
    const styles = TEAM_IDS.map((t) => personalityOf(11, TEAM_IDS, t).style)
    expect(new Set(styles).size).toBe(STYLE_ORDER.length)
    expect(TEAM_IDS.map((t) => personalityOf(11, TEAM_IDS, t).style)).toEqual(styles)
    const other = TEAM_IDS.map((t) => personalityOf(12, TEAM_IDS, t).style)
    expect(other).not.toEqual(styles)
  })
})

describe('scenarios', () => {
  const star = pacers[0]!
  const pool = notIn(
    [star],
    all.filter((p) => p.teamId !== null),
  ).slice(0, 150)

  it('a club with no fast bowlers values a premium quick far above one that has plenty', () => {
    const needy = club('hyd', core, 8000)
    const stocked = club('che', [...core, ...pacers.slice(1, 7)], 8000)
    const v = view([needy, stocked], pool)
    const a = evaluatePlayer(v, 'hyd', star, 200, 0.5)
    const b = evaluatePlayer(v, 'che', star, 200, 0.5)
    expect(a.decision).not.toBe('skip')
    expect(a.maxBid).toBeGreaterThan(b.maxBid * 1.3)
    expect(a.fills.map((f) => f.role)).toContain('pace')
  })

  it('a club overloaded with top-order batters passes on another one', () => {
    const squad = [
      ...batters.slice(0, 7),
      keepers[0]!,
      keepers[1]!,
      ...pacers.slice(1, 6),
      spinners[0]!,
      spinners[1]!,
      allrounders[0]!,
      allrounders[1]!,
    ]
    const v = view([club('hyd', squad, 4000)], pool)
    const e = evaluatePlayer(v, 'hyd', batters[8]!, 50, 0.5)
    expect(e.decision).toBe('skip')
  })

  it('a club with little money and many places keeps enough back to finish the squad', () => {
    const v = view([club('hyd', core, 600)], pool)
    const e = evaluatePlayer(v, 'hyd', star, 200, 0.5)
    const places = SQUAD_MIN - core.length - 1
    expect(e.maxBid).toBeLessThanOrEqual(600 - places * 20)
    expect(e.reserve).toBeGreaterThanOrEqual(places * 20)
  })

  it('a rich club with one gap chases that gap, not more of what it has', () => {
    const squad = [
      ...batters.slice(0, 5),
      keepers[0]!,
      keepers[1]!,
      ...allrounders.slice(0, 4),
      ...pacers.filter((p) => p.ratings.bowling < 72).slice(0, 6),
      spinners[0]!,
      spinners[1]!,
      spinners[2]!,
    ]
    // No death bowler in the squad.
    const noDeath = squad.filter((p) => (capabilities(p).death ?? 0) < 1)
    const v = view([club('hyd', noDeath, 6000)], pool)
    const death = deathBowlers.find((p) => !noDeath.includes(p))!
    const another = batters[6]!
    const d = evaluatePlayer(v, 'hyd', death, 100, 0.5)
    const b = evaluatePlayer(v, 'hyd', another, 100, 0.5)
    expect(d.fills.map((f) => f.role)).toContain('death')
    expect(d.maxBid).toBeGreaterThan(b.maxBid)
  })

  it('a scarce role is worth more than the same player when many like him are still to come', () => {
    const target = deathBowlers[0]!
    const needy = club('hyd', core, 8000)
    const fewLeft = view(
      [needy],
      all.filter((p) => p.role === 'batter'),
    )
    const manyLeft = view([needy], notIn([target], [...pacers, ...deathBowlers]))
    const scarce = evaluatePlayer(fewLeft, 'hyd', target, 100, 0.5)
    const common = evaluatePlayer(manyLeft, 'hyd', target, 100, 0.5)
    expect(scarce.alternatives).toBeLessThan(common.alternatives)
    expect(scarce.maxBid).toBeGreaterThan(common.maxBid)
  })

  it('two clubs short of the same specialist both want him, and each sees the other as a rival', () => {
    const target = deathBowlers[0]!
    const v = view([club('hyd', core, 8000), club('che', core, 8000)], pool)
    const a = evaluatePlayer(v, 'hyd', target, 100, 0.5)
    const b = evaluatePlayer(v, 'che', target, 100, 0.5)
    expect(a.decision).not.toBe('skip')
    expect(b.decision).not.toBe('skip')
    expect(a.rivals).toBeGreaterThanOrEqual(1)
  })

  it('after losing a target, the club still bids for the next comparable player', () => {
    const [first, second] = pacers.slice(0, 2) as [CareerPlayer, CareerPlayer]
    const v = view([club('hyd', core, 8000)], notIn([first, second], pool))
    expect(evaluatePlayer(v, 'hyd', second, 200, 0.5).decision).not.toBe('skip')
  })

  it('late with places to fill, a club turns to whoever fills them', () => {
    const squad = [...core, pacers[1]!, pacers[2]!]
    const v = view([club('hyd', squad, 3000)], pool.slice(0, 20), 0.95)
    const e = evaluatePlayer(v, 'hyd', pacers[20]!, 20, 0.5)
    expect(e.stage).toBe('completion')
    expect(e.decision).not.toBe('skip')
  })

  it('a club with all its overseas places full skips an overseas player', () => {
    const overseas = all.filter((p) => p.overseas).slice(0, 8)
    const v = view([club('hyd', overseas, 5000)], pool)
    const p = all.find((x) => x.overseas && !overseas.includes(x))!
    const e = evaluatePlayer(v, 'hyd', p, 50, 0.5)
    expect(e.decision).toBe('skip')
    expect(e.reason).toMatch(/Overseas/)
  })

  it('a full squad never bids', () => {
    const v = view([club('hyd', all.slice(0, 25), 5000)], pool)
    expect(evaluatePlayer(v, 'hyd', star, 200, 0.5).maxBid).toBe(0)
  })

  it('different squads and characters reach different decisions on the same player', () => {
    const aggressive: Personality = {
      ...BALANCED,
      style: 'aggressive',
      premium: 1.22,
      maxShare: 0.34,
    }
    const conservative: Personality = {
      ...BALANCED,
      style: 'conservative',
      premium: 0.95,
      maxShare: 0.22,
      patience: 0.4,
    }
    const v = view(
      [club('hyd', core, 8000, aggressive), club('che', core, 8000, conservative)],
      pool,
    )
    const a = evaluatePlayer(v, 'hyd', star, 200, 0.5)
    const c = evaluatePlayer(v, 'che', star, 200, 0.5)
    expect(a.maxBid).toBeGreaterThan(c.maxBid)
    expect(c.entryAt).toBeGreaterThanOrEqual(a.entryAt)
  })

  it('a high rating alone does not make him a target: fit and value over replacement do', () => {
    const v = view([club('hyd', [...core, ...keepers.slice(1, 3)], 8000)], pool)
    const keeper = keepers[3]!
    const e = evaluatePlayer(v, 'hyd', keeper, 100, 0.5)
    expect(e.maxBid).toBeLessThan(askingSalary(keeper))
  })

  it('never pays above its limit: maxBid is within purse, share and reserve', () => {
    for (const purse of [300, 1500, 8000]) {
      const v = view([club('hyd', core, purse)], pool)
      for (const p of [star, batters[0]!, spinners[1]!, keepers[2]!]) {
        const e = evaluatePlayer(v, 'hyd', p, 50, 0.9)
        if (e.decision === 'skip') continue
        expect(e.maxBid).toBeLessThanOrEqual(purse - e.reserve)
        expect(e.maxBid).toBeLessThanOrEqual(purse * 0.6)
      }
    }
  })

  it('every decision explains itself', () => {
    const v = view([club('hyd', core, 8000)], pool)
    const e = evaluatePlayer(v, 'hyd', star, 200, 0.5)
    expect(e.reason).toMatch(/Fit \d/)
    expect(['bid', 'wait', 'skip']).toContain(e.decision)
  })
})

describe('depth', () => {
  it('a planned squad of 22 wants about 23 players across the primary roles', () => {
    const d = depthFor(22)
    expect(d.keeper + d.top + d.finisher + d.allround + d.pace + d.spin).toBeGreaterThanOrEqual(22)
    expect(primaryRole(keepers[0]!)).toBe('keeper')
  })
})
