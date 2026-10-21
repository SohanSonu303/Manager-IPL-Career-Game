import type { Career } from '@/sim/career'

/**
 * Save file format. Bump SAVE_VERSION whenever the `Career` shape changes, and add a
 * migration from the previous version to MIGRATIONS.
 */
export const SAVE_VERSION = 1

export interface SaveFile {
  version: number
  savedAt: string
  career: Career
}

/** Upgrades a save from version `n` to `n + 1`. Inputs are untrusted JSON. */
export type Migration = (save: Record<string, unknown>) => Record<string, unknown>

/** Keyed by the version being migrated FROM. Example for a future v2:
 *  1: (s) => ({ ...s, version: 2, career: { ...(s.career as object), finances: initialFinances } }) */
export const MIGRATIONS: Record<number, Migration> = {}

export type ParseResult = { ok: true; save: SaveFile } | { ok: false; error: string }

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Run migrations until the save reaches `target`. */
export function migrate(
  raw: unknown,
  migrations: Record<number, Migration> = MIGRATIONS,
  target = SAVE_VERSION,
): ParseResult {
  if (!isObject(raw) || typeof raw.version !== 'number') {
    return { ok: false, error: 'Not a Cricket Manager save (no version).' }
  }
  if (raw.version > target) {
    return { ok: false, error: `Save is from a newer version (v${raw.version}). Update the game.` }
  }
  let save: Record<string, unknown> = raw
  while ((save.version as number) < target) {
    const from = save.version as number
    const step = migrations[from]
    if (!step) return { ok: false, error: `No migration from save v${from}.` }
    save = step(save)
    if (save.version !== from + 1)
      return { ok: false, error: `Migration from v${from} did not bump the version.` }
  }
  const problem = checkCareer(save.career)
  if (problem) return { ok: false, error: `Save is damaged: ${problem}.` }
  return { ok: true, save: save as unknown as SaveFile }
}

/** Structural check of the parts the game relies on. Returns a problem or null. */
export function checkCareer(c: unknown): string | null {
  if (!isObject(c)) return 'missing career'
  if (typeof c.seed !== 'number') return 'missing seed'
  if (!isObject(c.manager) || typeof c.manager.teamId !== 'string') return 'missing manager'
  if (
    !isObject(c.calendar) ||
    typeof c.calendar.year !== 'number' ||
    typeof c.calendar.day !== 'number'
  ) {
    return 'missing calendar'
  }
  if (!Array.isArray(c.players) || c.players.length === 0) return 'missing players'
  for (const p of c.players) {
    if (
      !isObject(p) ||
      typeof p.id !== 'string' ||
      !isObject(p.ratings) ||
      typeof p.fitness !== 'number'
    ) {
      return 'bad player record'
    }
  }
  return null
}

export function parseSave(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'File is not valid JSON.' }
  }
  return migrate(raw)
}

export function serializeSave(career: Career, now = new Date()): string {
  const file: SaveFile = { version: SAVE_VERSION, savedAt: now.toISOString(), career }
  return JSON.stringify(file)
}
