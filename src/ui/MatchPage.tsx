import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { teamById } from '@/data'
import { stageName } from '@/sim/game'
import { setLiveIntent, type Match } from '@/sim/match/engine'
import type { MatchState } from '@/sim/match/types'
import { finishMyMatch, useGame } from '@/state/store'
import { MatchView, PostMatch, SimControls } from './match/MatchView'

/** The manager's own fixture: watch it ball by ball, steer the batting, then finish. */
export function MatchPage() {
  const live = useGame((s) => s.live)
  const me = useGame((s) => s.career?.manager.teamId ?? null)
  const navigate = useNavigate()
  const [, setTick] = useState(0)

  if (!live) {
    return (
      <>
        <h1>No match in progress</h1>
        <Link to="/">Back to the club</Link>
      </>
    )
  }
  const { fixture, match } = live
  const step = (fn: (s: MatchState, r: Match['rng']) => unknown) => {
    if (match.state.result) return
    fn(match.state, match.rng)
    setTick((t) => t + 1)
  }
  const onIntent = (batterId: string, delta: number) => {
    if (!me) return
    setLiveIntent(match.state, me, batterId, delta)
    setTick((t) => t + 1)
  }
  const title = fixture.stage === 'league' ? `Round ${fixture.round}` : stageName(fixture.stage)

  return (
    <div className="match">
      <h1>
        {title}: {teamById.get(fixture.homeId)?.short} v {teamById.get(fixture.awayId)?.short}
      </h1>
      <p className="dim">{teamById.get(fixture.homeId)?.ground}</p>
      <MatchView
        state={match.state}
        humanId={me}
        onIntent={onIntent}
        controls={<SimControls step={step} />}
      />
      {match.state.result && (
        <>
          <button
            className="primary"
            onClick={() => {
              finishMyMatch()
              navigate('/')
            }}
          >
            Finish and return to the club
          </button>
          <PostMatch state={match.state} reports={null} canApply={false} onApply={() => {}} />
        </>
      )}
    </div>
  )
}
