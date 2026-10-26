import { Link, useNavigate } from 'react-router-dom'
import { teamById } from '@/data'
import { PRIZES, WIN_BONUS } from '@/sim/finance'
import { stageName } from '@/sim/game'
import { finishMyMatch, useGame } from '@/state/store'
import { crore } from './format'
import { Screen } from './kit/kit'
import { LiveMatch } from './match/LiveMatch'
import { PostMatch } from './match/MatchView'

/** The manager's own fixture, played live. */
export function MatchPage() {
  const live = useGame((s) => s.live)
  const career = useGame((s) => s.career)
  const navigate = useNavigate()

  if (!live || !career) {
    return (
      <Screen>
        <h1>No match in progress</h1>
        <Link to="/">Back to the club</Link>
      </Screen>
    )
  }
  const { fixture, match } = live
  const title = `${fixture.stage === 'league' ? `Round ${fixture.round}` : stageName(fixture.stage)} · ${teamById.get(fixture.homeId)?.ground}`
  return (
    <LiveMatch
      match={match}
      me={career.manager.teamId}
      title={title}
      people={new Map(career.players.map((p) => [p.id, p]))}
      back={{ label: 'Back', onClick: () => navigate('/') }}
      finish={{
        label: 'Finish',
        onClick: () => {
          finishMyMatch()
          navigate('/', { replace: true })
        },
      }}
      after={
        <>
          {match.state.result?.winnerId === career.manager.teamId && (
            <p className="win-bonus">
              +{crore(WIN_BONUS)} win bonus to club funds
              {fixture.stage === 'final' ? `, and ${crore(PRIZES.champion)} prize money` : ''}
            </p>
          )}
          <PostMatch state={match.state} reports={null} canApply={false} onApply={() => {}} />
        </>
      }
    />
  )
}
