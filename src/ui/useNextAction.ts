import { useNavigate } from 'react-router-dom'
import { contractOutlook } from '@/sim/contracts'
import { continueBlocker, TEAM_IDS, userFixtureToday } from '@/sim/game'
import { continueGame, useGame } from '@/state/store'
import type { Action } from './kit/kit'

/**
 * The game's main action for the slanted bar: go to the match day screen when you have
 * a match, otherwise Continue. Next Season first shows who leaves (Before next season).
 */
export function useNextAction(): Action | null {
  const career = useGame((s) => s.career)
  const navigate = useNavigate()
  if (!career || career.status !== 'active') return null
  if (career.mega) return { label: 'Mega Auction', onClick: () => navigate('/auction') }
  if (userFixtureToday(career)) return { label: 'Play Match', onClick: () => navigate('/prematch') }
  const disabled = !!continueBlocker(career)
  if (career.season.review) {
    const o = contractOutlook(career, TEAM_IDS)
    const check = o.megaYear || o.leaving.length > 0 || o.undecided.length > 0
    return {
      label: 'Next Season',
      onClick: check ? () => navigate('/contracts?confirm=1') : continueGame,
      disabled,
    }
  }
  return { label: 'Continue', onClick: continueGame, disabled }
}
