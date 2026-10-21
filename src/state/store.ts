import { create } from 'zustand'
import { advanceDay, advanceToNextEvent, newCareer, type Career } from '@/sim/career'
import { applyPostMatch, type PlayerReport } from '@/sim/match/postMatch'
import type { MatchState } from '@/sim/match/types'
import { deriveSeed } from '@/sim/rng'
import { parseSave } from './save'
import { clearSave, readSave, writeSave } from './storage'

/** Plain serializable game state; actions live outside the store as functions. */
export interface GameState {
  career: Career | null
  /** Last save/load problem to show the player, or null. */
  notice: string | null
}

export const useGame = create<GameState>(() => ({ career: null, notice: null }))

/** Set the career and auto-save it. */
function commit(career: Career) {
  const result = writeSave(career)
  useGame.setState({ career, notice: result.ok ? null : result.error })
}

/** Load the saved career on app start. */
export function loadSavedCareer() {
  const r = readSave()
  switch (r.status) {
    case 'ok':
      useGame.setState({ career: r.career, notice: null })
      break
    case 'damaged':
      useGame.setState({
        notice: `Your saved career could not be loaded (${r.error}) It was kept aside; import a backup or start again.`,
      })
      break
    case 'unavailable':
      useGame.setState({
        notice: 'Saving is not available in this browser. Use Export to keep your career.',
      })
      break
    case 'empty':
      break
  }
}

function randomSeed(): number {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0] ?? 1
}

export function startCareer(teamId: string, managerName: string) {
  commit(newCareer({ seed: randomSeed(), teamId, managerName: managerName.trim() || 'Manager' }))
}

export function continueToNextEvent() {
  const { career } = useGame.getState()
  if (career) commit(advanceToNextEvent(career))
}

export function advanceDays(n: number) {
  let { career } = useGame.getState()
  if (!career) return
  for (let i = 0; i < n; i++) career = advanceDay(career)
  commit(career)
}

/** Import a save file's text. Returns an error message, or null on success. */
export function importSave(text: string): string | null {
  const parsed = parseSave(text)
  if (!parsed.ok) return parsed.error
  commit(parsed.save.career)
  return null
}

export function resetCareer() {
  clearSave()
  useGame.setState({ career: null, notice: null })
}

/**
 * Apply a finished match to the career (fitness, form, injuries, rating changes).
 * Used by the debug match screen for friendlies until fixtures arrive in Phase 8.
 */
export function applyMatchToCareer(match: MatchState): PlayerReport[] {
  const { career } = useGame.getState()
  if (!career || !match.result) return []
  const { players, reports } = applyPostMatch(
    career.players,
    match,
    deriveSeed(career.seed, 'match', match.seed),
  )
  commit({ ...career, players })
  return reports
}

export const dismissNotice = () => useGame.setState({ notice: null })
