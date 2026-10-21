import type { Career } from '@/sim/career'
import { parseSave, serializeSave } from './save'

export const SAVE_KEY = 'cricket-manager.save'
/** A save that failed to load is moved here instead of being lost. */
export const DAMAGED_KEY = 'cricket-manager.save.damaged'

/** The subset of `Storage` we use, so tests can pass a fake. */
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** `localStorage`, or null when unavailable (private mode, blocked site data, SSR). */
export function browserStorage(): KeyValueStore | null {
  try {
    const s = window.localStorage
    const probe = '__cm_probe__'
    s.setItem(probe, '1')
    s.removeItem(probe)
    return s
  } catch {
    return null
  }
}

export type WriteResult = { ok: true; bytes: number } | { ok: false; error: string }

const isQuotaError = (e: unknown) =>
  e instanceof DOMException &&
  (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')

export function writeSave(
  career: Career,
  store: KeyValueStore | null = browserStorage(),
): WriteResult {
  if (!store)
    return {
      ok: false,
      error: 'Saving is not available in this browser. Use Export to keep your career.',
    }
  const text = serializeSave(career)
  try {
    store.setItem(SAVE_KEY, text)
    return { ok: true, bytes: text.length }
  } catch (e) {
    return {
      ok: false,
      error: isQuotaError(e)
        ? 'Browser storage is full. Export your career to a file, then free up space.'
        : 'Could not save. Export your career to a file to be safe.',
    }
  }
}

export type ReadResult =
  | { status: 'empty' }
  | { status: 'ok'; career: Career }
  | { status: 'damaged'; error: string }
  | { status: 'unavailable' }

export function readSave(store: KeyValueStore | null = browserStorage()): ReadResult {
  if (!store) return { status: 'unavailable' }
  let text: string | null
  try {
    text = store.getItem(SAVE_KEY)
  } catch {
    return { status: 'unavailable' }
  }
  if (text === null || text === '') return { status: 'empty' }
  const parsed = parseSave(text)
  if (parsed.ok) return { status: 'ok', career: parsed.save.career }
  // Keep the damaged save for recovery/bug reports, then clear the slot.
  try {
    store.setItem(DAMAGED_KEY, text)
    store.removeItem(SAVE_KEY)
  } catch {
    // Nothing more we can do; the error is still reported.
  }
  return { status: 'damaged', error: parsed.error }
}

export function clearSave(store: KeyValueStore | null = browserStorage()): void {
  try {
    store?.removeItem(SAVE_KEY)
  } catch {
    // Ignore: storage unavailable.
  }
}

/** Offer the save as a JSON file download. */
export function downloadSave(career: Career): void {
  const blob = new Blob([serializeSave(career)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `cricket-manager-${career.calendar.year}-day${career.calendar.day}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
