import { describe, expect, it } from 'vitest'
import { continueCareer, startCareer } from '@/sim/game'
import { FREE_AGENT_MAX } from '@/sim/market'
import { migrate, parseSave, SAVE_VERSION, serializeSave, type Migration } from './save'
import { DAMAGED_KEY, readSave, SAVE_KEY, writeSave, type KeyValueStore } from './storage'

const career = () => continueCareer(startCareer({ seed: 7, managerName: 'Tester', teamId: 'mum' }))

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}

function fullStore(): KeyValueStore {
  return {
    getItem: () => null,
    setItem: () => {
      throw new DOMException('full', 'QuotaExceededError')
    },
    removeItem: () => {},
  }
}

describe('save format', () => {
  it('upgrades a v4 save: achievements start empty', () => {
    const { achievements: _drop, ...old } = career()
    void _drop
    const parsed = migrate({ version: 4, savedAt: '', career: old })
    expect(parsed.ok && parsed.save.version).toBe(SAVE_VERSION)
    expect(parsed.ok && parsed.save.career.achievements).toEqual({})
  })

  it('upgrades a v5 save: no auction under way, at most one season of free agents on offer', () => {
    const { mega: _m, ...rest } = career()
    void _m
    const old = { ...rest, market: { talks: {}, log: [] } }
    const parsed = migrate({ version: 5, savedAt: '', career: old })
    expect(parsed.ok && parsed.save.version).toBe(SAVE_VERSION)
    if (!parsed.ok) return
    expect(parsed.save.career.mega).toBeNull()
    const ids = parsed.save.career.market.freeAgentIds
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.length).toBeLessThanOrEqual(FREE_AGENT_MAX)
  })

  it('upgrades a v7 save: an empty transfer list, talks without the old single ask', () => {
    const c = career()
    const { listed: _l, ...market } = c.market
    void _l
    const old = {
      ...c,
      market: { ...market, talks: { x: { rounds: 2, walkedAway: true, ask: 500 } } },
    }
    const parsed = migrate({ version: 7, savedAt: '', career: old })
    expect(parsed.ok && parsed.save.version).toBe(SAVE_VERSION)
    if (!parsed.ok) return
    expect(parsed.save.career.market.listed).toEqual([])
    expect(parsed.save.career.market.talks.x).toEqual({ rounds: 2, walkedAway: true })
  })

  it('upgrades a v8 save: every club starts with funds, an empty ledger', () => {
    const { funds: _f, ledger: _l, ...old } = career()
    void _f
    void _l
    const parsed = migrate({ version: 8, savedAt: '', career: old })
    expect(parsed.ok && parsed.save.version).toBe(SAVE_VERSION)
    if (!parsed.ok) return
    expect(parsed.save.career.funds.mum).toBe(500)
    expect(Object.keys(parsed.save.career.funds)).toHaveLength(10)
    expect(parsed.save.career.ledger).toEqual([])
  })

  it('upgrades a v6 auction in progress: starred ids become a shortlist', () => {
    const c = career()
    const mega = {
      year: 2028,
      stage: 'auction',
      retained: {},
      purses: {},
      sets: [],
      setIndex: 0,
      lotIndex: 0,
      lot: null,
      sold: [],
      unsold: [],
      targets: ['p1'],
      autoBid: false,
      accelerated: false,
      last: null,
    }
    const parsed = migrate({ version: 6, savedAt: '', career: { ...c, mega } })
    expect(parsed.ok && parsed.save.version).toBe(SAVE_VERSION)
    if (!parsed.ok) return
    const m = parsed.save.career.mega as unknown as Record<string, unknown>
    expect(m.shortlist).toEqual({})
    expect(m.stopForShortlist).toBe(false)
    expect(m.autoBid).toBe(false)
    expect('targets' in m).toBe(false)
  })

  it('round-trips through JSON', () => {
    const c = career()
    const parsed = parseSave(serializeSave(c))
    expect(parsed.ok && parsed.save.career).toEqual(c)
    expect(parsed.ok && parsed.save.version).toBe(SAVE_VERSION)
  })

  it('rejects garbage, missing versions and newer versions', () => {
    expect(parseSave('not json').ok).toBe(false)
    expect(parseSave('{"hello":1}').ok).toBe(false)
    const newer = parseSave(JSON.stringify({ version: SAVE_VERSION + 1, career: career() }))
    expect(newer.ok).toBe(false)
    expect(!newer.ok && newer.error).toMatch(/newer/)
  })

  it('rejects a save with damaged career data', () => {
    const c = { ...career(), players: [{ id: 'x' }] }
    const parsed = parseSave(JSON.stringify({ version: SAVE_VERSION, savedAt: '', career: c }))
    expect(!parsed.ok && parsed.error).toMatch(/damaged/)
  })

  it('runs migrations in order up to the target version', () => {
    const c = career()
    // Pretend v1 saves stored the manager name at the top level; v2 moves it into career.
    const v0 = { version: 0, career: c }
    const migrations: Record<number, Migration> = {
      0: (s) => ({ ...s, version: 1, legacyName: 'Old' }),
      1: ({ legacyName, ...s }) => ({
        ...s,
        version: 2,
        career: { ...(s.career as object), manager: { name: legacyName, teamId: 'mum' } },
      }),
    }
    const out = migrate(v0, migrations, 2)
    expect(out.ok).toBe(true)
    expect(out.ok && out.save.version).toBe(2)
    expect(out.ok && out.save.career.manager.name).toBe('Old')
  })

  it('fails clearly when a migration step is missing', () => {
    const out = migrate({ version: 0, career: career() }, {}, 1)
    expect(!out.ok && out.error).toMatch(/No migration from save v0/)
  })
})

describe('storage', () => {
  it('writes and reads back the career', () => {
    const store = memoryStore()
    const c = career()
    const w = writeSave(c, store)
    expect(w.ok).toBe(true)
    expect(readSave(store)).toEqual({ status: 'ok', career: c })
  })

  it('reports empty storage', () => {
    expect(readSave(memoryStore())).toEqual({ status: 'empty' })
  })

  it('reports unavailable storage on both read and write', () => {
    expect(readSave(null)).toEqual({ status: 'unavailable' })
    expect(writeSave(career(), null).ok).toBe(false)
  })

  it('handles a full storage with a clear message', () => {
    const w = writeSave(career(), fullStore())
    expect(!w.ok && w.error).toMatch(/full/)
  })

  it('moves a corrupted save aside instead of losing it', () => {
    const store = memoryStore()
    store.setItem(SAVE_KEY, '{"version":1,"career":')
    const r = readSave(store)
    expect(r.status).toBe('damaged')
    expect(store.data.get(DAMAGED_KEY)).toBe('{"version":1,"career":')
    expect(store.data.has(SAVE_KEY)).toBe(false)
  })
})

describe('real migrations', () => {
  it('upgrades a v1 save (no injuries, no league) to the current version', () => {
    const c = career()
    const v1Players = c.players.map((p) => {
      const old: Record<string, unknown> = { ...p }
      delete old.injury
      delete old.seasonDev
      return old
    })
    const v1 = {
      seed: c.seed,
      manager: { name: c.manager.name, teamId: c.manager.teamId },
      calendar: { year: 2026, day: 0 },
      players: v1Players,
    }
    const out = migrate({ version: 1, savedAt: '', career: v1 })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.save.version).toBe(SAVE_VERSION)
    expect(out.save.career.players[0]?.injury).toBeNull()
    expect(out.save.career.players[0]?.seasonDev).toEqual({ batting: 0, bowling: 0 })
    expect(out.save.career.manager.reputation).toBeGreaterThan(0)
    expect(out.save.career.season.objective.text).not.toBe('')
    expect(out.save.career.status).toBe('active')
  })

  it('reports a migration that crashes on bad data', () => {
    const out = migrate({ version: 1, career: { players: 'nope' } })
    expect(!out.ok && out.error).toMatch(/Could not upgrade/)
  })
})
