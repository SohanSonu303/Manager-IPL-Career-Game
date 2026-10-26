import { registerSW } from 'virtual:pwa-register'
import { useGame } from './store'

/*
 * Keeping the installed app current. The service worker serves the cached build, so a new
 * deploy is only found after the page has loaded. We check for one at start-up and
 * whenever the page comes back to the front (no timers, so hidden tabs do nothing); once
 * the new build has taken over, the page reloads into it, but never in the middle of a
 * match held in memory.
 */

const JUST_UPDATED = 'cm-just-updated'

let registration: ServiceWorkerRegistration | undefined
let pending = false

/** A live match (or Daily Challenge) only lives in memory: reloading would lose it. */
function safeToReload(): boolean {
  const route = window.location.hash.replace(/^#/, '')
  return useGame.getState().live === null && !/^\/(match|daily)\b/.test(route)
}

function reload() {
  try {
    sessionStorage.setItem(JUST_UPDATED, '1')
  } catch {
    // Private mode: reload without the "updated" note.
  }
  window.location.reload()
}

/** Reload now if that's safe, otherwise as soon as the match is over. */
function reloadWhenSafe() {
  if (pending) return
  pending = true
  if (safeToReload()) return reload()
  const retry = () => {
    if (!safeToReload()) return
    unsubscribe()
    window.removeEventListener('hashchange', retry)
    reload()
  }
  const unsubscribe = useGame.subscribe(retry)
  window.addEventListener('hashchange', retry)
}

/** Ask the server for a new build; true if one was found (the reload follows by itself). */
export async function checkForUpdate(): Promise<boolean> {
  if (!registration) return false
  try {
    await registration.update()
  } catch {
    return false // offline
  }
  return !!(registration.installing || registration.waiting) || pending
}

/** Register the service worker and start checking for new builds. Call once at start-up. */
export function startUpdateChecks() {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return
  let justUpdated = false
  try {
    justUpdated = sessionStorage.getItem(JUST_UPDATED) === '1'
    sessionStorage.removeItem(JUST_UPDATED)
  } catch {
    // Storage blocked: no note.
  }
  if (justUpdated && !useGame.getState().notice)
    useGame.setState({ notice: `Updated to the latest version (${__APP_VERSION__}).` })

  registerSW({
    immediate: true,
    // The new build has taken control: reload into it (when it's safe).
    onNeedReload: reloadWhenSafe,
    onRegisteredSW(_url, reg) {
      registration = reg
      if (!reg) return
      const check = () => void checkForUpdate()
      check()
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })
}
