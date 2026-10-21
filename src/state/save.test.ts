import { describe, expect, it } from 'vitest'
import { advanceToNextEvent, newCareer } from '@/sim/career'
import { migrate, parseSave, SAVE_VERSION, serializeSave, type Migration } from './save'
import { DAMAGED_KEY, readSave, SAVE_KEY, writeSave, type KeyValueStore } from './storage'

const career = () =>
  advanceToNextEvent(newCareer({ seed: 7, managerName: 'Tester', teamId: 'mum' }))

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
  it('upgrades a v1 save (no injuries) to the current version', () => {
    const c = career()
    const v1Players = c.players.map((p) => {
      const old: Record<string, unknown> = { ...p }
      delete old.injury
      delete old.seasonDev
      return old
    })
    const out = migrate({ version: 1, savedAt: '', career: { ...c, players: v1Players } })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.save.version).toBe(SAVE_VERSION)
    expect(out.save.career.players[0]?.injury).toBeNull()
    expect(out.save.career.players[0]?.seasonDev).toEqual({ batting: 0, bowling: 0 })
  })

  it('reports a migration that crashes on bad data', () => {
    const out = migrate({ version: 1, career: { players: 'nope' } })
    expect(!out.ok && out.error).toMatch(/Could not upgrade/)
  })
})
