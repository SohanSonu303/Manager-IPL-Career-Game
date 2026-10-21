import { useNavigate } from 'react-router-dom'
import { continueBlocker, userFixtureToday } from '@/sim/game'
import { continueGame, useGame } from '@/state/store'
import type { Action } from './kit/kit'

/**
 * The game's main action for the slanted bar: go to the match day screen when you have
 * a match, otherwise Continue (or start the next season).
 */
export function useNextAction(): Action | null {
  const career = useGame((s) => s.career)
  const navigate = useNavigate()
  if (!career || career.status !== 'active') return null
  if (userFixtureToday(career)) return { label: 'Play Match', onClick: () => navigate('/prematch') }
  return {
    label: career.season.review ? 'Next Season' : 'Continue',
    onClick: continueGame,
    disabled: !!continueBlocker(career),
  }
}
