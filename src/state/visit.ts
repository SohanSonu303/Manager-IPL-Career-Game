/*
 * When the player was last here, for the "welcome back" summary. Read once when the app
 * loads, then stamped with now.
 */

const KEY = 'cricket-manager.lastSeen'
/** Away at least this long before the summary shows. */
export const WELCOME_BACK_AFTER_MS = 6 * 60 * 60 * 1000

function readAndStamp(): number | null {
  try {
    const prev = Number(localStorage.getItem(KEY)) || null
    localStorage.setItem(KEY, String(Date.now()))
    return prev
  } catch {
    return null
  }
}

/** The previous visit's time (ms), or null on a first visit. */
export const previousVisit: number | null = readAndStamp()

let dismissed = false

/** Show the summary? Until it is dismissed, when the player has been away long enough. */
export function welcomeBackDue(now = Date.now()): boolean {
  return !dismissed && previousVisit !== null && now - previousVisit >= WELCOME_BACK_AFTER_MS
}

export function dismissWelcomeBack() {
  dismissed = true
}
