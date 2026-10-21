import { Link, useNavigate } from 'react-router-dom'
import { teamById } from '@/data'
import { stageName } from '@/sim/game'
import { finishMyMatch, useGame } from '@/state/store'
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
      after={<PostMatch state={match.state} reports={null} canApply={false} onApply={() => {}} />}
    />
  )
}
