import { lazy, Suspense, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { teamById } from '@/data'
import Field2D from '@/match3d/Field2D'
import { hasWebGL } from '@/match3d/FieldProps'
import type { CareerPlayer } from '@/sim/career'
import { stageName } from '@/sim/game'
import {
  currentInnings,
  setLiveIntent,
  simBall,
  simInnings,
  simMatch,
  simOver,
  simOvers,
  type Match,
} from '@/sim/match/engine'
import { ballLabel, chaseStatus, economy, oversText } from '@/sim/match/scorecard'
import { AGGRESSION, phaseOf, type MatchState } from '@/sim/match/types'
import { finishMyMatch, useGame } from '@/state/store'
import { teamShort } from './format'
import { Avatar } from './identity/Avatar'
import { ringStatus } from './identity/avatarSpec'
import { Crest } from './identity/Crest'
import { Icon } from './kit/Icon'
import { Screen, StatBar } from './kit/kit'
import { commentary } from './match/commentary'
import { INTENT_LABEL, PostMatch, Scorecard } from './match/MatchView'

// three.js only loads when a match is opened.
const Field3D = lazy(() => import('@/match3d/Field3D'))

export type ViewMode = 'auto' | '3d' | '2d'
export const VIEW_KEY = 'cricket-manager.view'

export function readViewMode(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    return v === '3d' || v === '2d' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** The manager's own fixture: stadium view, scorebug, batting controls, sim buttons. */
export function MatchPage() {
  const live = useGame((s) => s.live)
  const career = useGame((s) => s.career)
  const navigate = useNavigate()
  const [, setTick] = useState(0)
  const [mode] = useState<ViewMode>(readViewMode)
  const [use3d, setUse3d] = useState(() => (mode === '2d' ? false : hasWebGL()))
  const [slowNote, setSlowNote] = useState(false)

  if (!live || !career) {
    return (
      <Screen>
        <h1>No match in progress</h1>
        <Link to="/">Back to the club</Link>
      </Screen>
    )
  }
  const { fixture, match } = live
  const state = match.state
  const me = career.manager.teamId
  const step = (fn: (s: MatchState, r: Match['rng']) => unknown) => {
    if (state.result) return
    fn(state, match.rng)
    setTick((t) => t + 1)
  }
  const inn = currentInnings(state)
  const last = inn.events.at(-1) ?? null
  const players = new Map(career.players.map((p) => [p.id, p]))
  const title = `${fixture.stage === 'league' ? `Round ${fixture.round}` : stageName(fixture.stage)} · ${teamById.get(fixture.homeId)?.ground}`
  const batTeam = teamById.get(inn.battingTeamId)
  const bowlTeam = teamById.get(inn.bowlingTeamId)
  const first = state.innings[0]
  const other = inn.index === 0 ? null : first
  const chase = chaseStatus(inn)
  const phase = inn.maxOvers === 1 ? 'death' : phaseOf(Math.floor(inn.legalBalls / 6))
  const fieldProps = {
    radius: state.pitch.boundary,
    phase,
    event: last,
    eventKey: inn.events.length + inn.index * 1000,
    batColor: batTeam?.colors.primary ?? '#14b8a6',
    bowlColor: bowlTeam?.colors.primary ?? '#ffffff',
    reducedMotion: prefersReducedMotion(),
  }

  return (
    <Screen
      className="match-screen"
      back={{ label: 'Back', onClick: () => navigate('/') }}
      primary={
        state.result
          ? {
              label: 'Finish',
              onClick: () => {
                finishMyMatch()
                navigate('/', { replace: true })
              },
            }
          : { label: 'Sim Match', onClick: () => step(simMatch) }
      }
    >
      <div className="scorebug">
        <span className="side">
          {batTeam && <Crest crest={batTeam.crest} colors={batTeam.colors} size={38} />}
          {batTeam?.short}
        </span>
        <span>
          <div className="comp">{title}</div>
          <div className="score">
            {inn.runs}/{inn.wickets}
            <small> ({oversText(inn.legalBalls)} ov)</small>
          </div>
          {state.result ? (
            <div className="chase good">
              {state.result.winnerId
                ? `${teamById.get(state.result.winnerId)?.name} ${state.result.margin}`
                : 'Match tied'}
            </div>
          ) : chase ? (
            <div className="chase">
              {batTeam?.short} need {chase.need} from {chase.balls} · RRR {chase.rrr.toFixed(2)}
            </div>
          ) : (
            <div className="chase dim">
              Toss: {teamShort(state.toss.winnerId)} chose to {state.toss.decision}
            </div>
          )}
          {last && <div className="last">{commentary(last, state)}</div>}
        </span>
        <span className="side">
          {bowlTeam && <Crest crest={bowlTeam.crest} colors={bowlTeam.colors} size={38} />}
          {other ? `${other.runs}/${other.wickets}` : bowlTeam?.short}
        </span>
      </div>

      <div className="six-strip" aria-label="Last six balls">
        {inn.events.length === 0 && <span className="dim">First ball coming up</span>}
        {inn.events.slice(-6).map((e, i) => (
          <span key={i} className={`ball ${e.wicket ? 'w' : e.boundary ? 'b' : ''}`}>
            {ballLabel(e)}
          </span>
        ))}
      </div>

      <div className="field-wrap">
        {use3d ? (
          <Suspense fallback={<Field2D {...fieldProps} />}>
            <Field3D
              {...fieldProps}
              onSlow={() => {
                if (mode === 'auto') {
                  setUse3d(false)
                  setSlowNote(true)
                }
              }}
            />
          </Suspense>
        ) : (
          <Field2D {...fieldProps} />
        )}
        {last && (last.boundary || last.wicket) && (
          <span key={fieldProps.eventKey} className={`popup ${last.wicket ? 'w' : ''}`}>
            {last.wicket ? 'OUT!' : last.boundary}
          </span>
        )}
        <button className="view-toggle" onClick={() => setUse3d((v) => !v)}>
          {use3d ? '3D' : '2D'} view
        </button>
      </div>
      {slowNote && (
        <p className="dim" style={{ margin: '0 10px' }}>
          Switched to the 2D view to keep things smooth.
        </p>
      )}

      {!state.result && (
        <>
          <div className="crease-panel">
            <span className="label">BATTING</span>
            {[inn.strikerId, inn.nonStrikerId].map((id) => (
              <BatRow
                key={id}
                p={players.get(id)}
                name={state.players[id]?.name ?? ''}
                line={inn.batting[id]}
                onStrike={id === inn.strikerId}
                human={inn.battingTeamId === me}
                intent={
                  state.sheets[inn.battingTeamId]?.intent[id] ??
                  state.sheets[inn.battingTeamId]?.aggression ??
                  'balanced'
                }
                onIntent={(d) => {
                  setLiveIntent(state, me, id, d)
                  setTick((t) => t + 1)
                }}
              />
            ))}
            <span className="label">BOWLING</span>
            <BowlRow state={state} players={players} />
          </div>
          <div className="sim-row">
            <button onClick={() => step(simBall)}>Ball</button>
            <button onClick={() => step(simOver)}>Over</button>
            <button onClick={() => step((s, r) => simOvers(s, r, 5))}>5 Ov</button>
            <button onClick={() => step(simInnings)}>Innings</button>
            <button onClick={() => step(simMatch)}>Match</button>
          </div>
        </>
      )}

      <div className="match-extra">
        {state.result && (
          <PostMatch state={state} reports={null} canApply={false} onApply={() => {}} />
        )}
        <h2 className="section">Commentary</h2>
        <ol className="commentary">
          {[...inn.events]
            .slice(-10)
            .reverse()
            .map((e, i) => (
              <li key={i}>
                <span className="ov">
                  {e.over}.{e.ball}
                </span>
                {commentary(e, state)}
              </li>
            ))}
        </ol>
        <h2 className="section">Scorecards</h2>
        {state.innings.map((i) => (
          <Scorecard key={i.index} state={state} inn={i} />
        ))}
      </div>
    </Screen>
  )
}

function BatRow({
  p,
  name,
  line,
  onStrike,
  human,
  intent,
  onIntent,
}: {
  p: CareerPlayer | undefined
  name: string
  line: { runs: number; balls: number } | undefined
  onStrike: boolean
  human: boolean
  intent: (typeof AGGRESSION)[number]
  onIntent: (delta: number) => void
}) {
  const level = AGGRESSION.indexOf(intent)
  const team = p?.teamId ? teamById.get(p.teamId) : undefined
  return (
    <div className={`bat-row ${onStrike ? 'on-strike' : ''}`}>
      {p && (
        <Avatar
          seed={p.id}
          nationality={p.nationality}
          age={p.age}
          kit={team?.colors ?? { primary: '#555', secondary: '#ccc' }}
          size={48}
          ring={ringStatus(p.fitness)}
          badge={team ? { crest: team.crest, colors: team.colors } : undefined}
        />
      )}
      <span className="who">
        <strong>{name}</strong>
        <span>
          {line?.runs ?? 0} ({line?.balls ?? 0})
        </span>
      </span>
      {human && (
        <span className="intent-ctl">
          <button
            onClick={() => onIntent(-1)}
            aria-label={`Less aggressive: ${name}`}
            disabled={level === 0}
          >
            <Icon name="minus" />
          </button>
          <span className="mid">
            <StatBar filled={level + 1} total={AGGRESSION.length} hot={level >= 3} />
            {INTENT_LABEL[intent]}
          </span>
          <button
            onClick={() => onIntent(1)}
            aria-label={`More aggressive: ${name}`}
            disabled={level === AGGRESSION.length - 1}
          >
            <Icon name="plus" />
          </button>
        </span>
      )}
    </div>
  )
}

function BowlRow({ state, players }: { state: MatchState; players: Map<string, CareerPlayer> }) {
  const inn = currentInnings(state)
  const id = inn.bowlerId ?? inn.events.at(-1)?.bowlerId
  if (!id) return <span className="dim">New over</span>
  const p = players.get(id)
  const b = inn.bowling[id]
  const team = p?.teamId ? teamById.get(p.teamId) : undefined
  return (
    <div className="bat-row">
      {p && (
        <Avatar
          seed={p.id}
          nationality={p.nationality}
          age={p.age}
          kit={team?.colors ?? { primary: '#555', secondary: '#ccc' }}
          size={40}
        />
      )}
      <span className="who">
        <strong>{state.players[id]?.name}</strong>
        <span>
          {b
            ? `${oversText(b.legalBalls)}-${b.runs}-${b.wickets} · Econ ${economy(b.runs, b.legalBalls).toFixed(1)}`
            : 'Yet to bowl'}
        </span>
      </span>
    </div>
  )
}
