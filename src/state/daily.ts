/*
 * Daily Challenge results, kept in this browser only (separate from the career save).
 * Reads and writes never throw: without storage the challenge still plays, unrecorded.
 */

const KEY = 'cricket-manager.daily'

export interface DailyRecord {
  stars: number
  won: boolean
  line: string
  share: string
}

export function readDaily(): Record<string, DailyRecord> {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, DailyRecord>)
      : {}
  } catch {
    return {}
  }
}

/** Record the first finished attempt of a day (later replays are practice). */
export function saveDaily(dateKey: string, record: DailyRecord): Record<string, DailyRecord> {
  const all = readDaily()
  if (all[dateKey]) return all
  const next = { ...all, [dateKey]: record }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Storage unavailable: the result just isn't kept.
  }
  return next
}
