import { lazy, Suspense, useState, type ReactNode } from 'react'
import { BATTING_TRAITS, teamById } from '@/data'
import Field2D from '@/match3d/Field2D'
import { hasWebGL } from '@/match3d/FieldProps'
import type { CareerPlayer } from '@/sim/career'
import {
  type Match,
  atInningsBreak,
  atOverBreak,
  callTimeout,
  canCallTimeout,
  currentInnings,
  decideToss,
  eligibleBowlers,
  impactBlocker,
  makeImpactSub,
  resolveReview,
  setLiveBowler,
  setLiveIntent,
  setLiveTactics,
  simBall,
  simInnings,
  simMatch,
  simOver,
  simOvers,
  startNextInnings,
  suggestImpact,
  TIMEOUT_BALLS,
  TIMEOUT_BOOST,
} from '@/sim/match/engine'
import { ballLabel, chaseStatus, economy, oversText } from '@/sim/match/scorecard'
import { MAX_OVERS_PER_BOWLER, spellLength } from '@/sim/match/tactics'
import { projectedScore, winProbability } from '@/sim/match/winProb'
import {
  AGGRESSION,
  BOWL_INTENTS,
  BOWL_PLANS,
  FIELD_SETTINGS,
  phaseOf,
  type MatchState,
  type PendingReview,
} from '@/sim/match/types'
import { describePitch } from '../PreMatchPage'
import { TRAIT_LABEL, teamShort } from '../format'
import { Avatar } from '../identity/Avatar'
import { ringStatus } from '../identity/avatarSpec'
import { Crest } from '../identity/Crest'
import { Icon } from '../kit/Icon'
import { Screen, Sheet, StatBar, type Action } from '../kit/kit'
import { commentary } from './commentary'
import { INTENT_LABEL, Scorecard, WinWorm } from './MatchView'
import { readViewMode, type ViewMode } from './viewMode'

// three.js only loads when a match is opened.
const Field3D = lazy(() => import('@/match3d/Field3D'))

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** What the crease panel needs to draw a player's avatar. */
export type Person = Pick<
  CareerPlayer,
  'id' | 'nationality' | 'age' | 'teamId' | 'fitness' | 'traits'
>

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/** The dew forecast in plain words. */
export function dewText(dew: number): string {
  return dew > 0.6 ? 'Heavy dew expected' : dew > 0.3 ? 'Some dew expected' : 'Little dew expected'
}

export interface LiveMatchProps {
  match: Match
  /** The manager's side. */
  me: string
  /** Competition line in the scorebug. */
  title: string
  people: Map<string, Person>
  back: Action
  /** The bottom-bar action once the match is over. */
  finish: Action
  /** Shown under the scorebug before the match ends (e.g. the challenge brief). */
  brief?: ReactNode
  /** Shown above the commentary once the match is over (grades, the result card). */
  after?: ReactNode
  /** Called after every change to the match. */
  onChange?: () => void
}

/**
 * The live match screen: scorebug, stadium view, crease panel with batting and bowling
 * controls, the toss, DRS, Impact Player and strategic timeout decisions, sim buttons.
 */
export function LiveMatch({
  match,
  me,
  title,
  people,
  back,
  finish,
  brief,
  after,
  onChange,
}: LiveMatchProps) {
  const [, setTick] = useState(0)
  const [mode] = useState<ViewMode>(readViewMode)
  const [use3d, setUse3d] = useState(() => (mode === '2d' ? false : hasWebGL()))
  const [slowNote, setSlowNote] = useState(false)
  const [impactOpen, setImpactOpen] = useState(false)
  const state = match.state
  const refresh = () => {
    setTick((t) => t + 1)
    onChange?.()
  }
  const step = (fn: (s: MatchState, r: Match['rng']) => unknown) => {
    if (state.result) return
    fn(state, match.rng)
    refresh()
  }
  const inn = currentInnings(state)
  const last = inn.events.at(-1) ?? null
  const opp = Object.keys(state.sheets).find((id) => id !== me) ?? state.order[1]
  const batTeam = teamById.get(inn.battingTeamId)
  const bowlTeam = teamById.get(inn.bowlingTeamId)
  const first = state.innings[0]
  const other = inn.index === 0 ? null : first
  const chase = chaseStatus(inn)
  const phase = inn.maxOvers === 1 ? 'death' : phaseOf(Math.floor(inn.legalBalls / 6))
  const over = Math.floor(inn.legalBalls / 6)
  const dew = state.conditions?.dew ?? 0
  const review = state.pendingReview?.teamId === me ? state.pendingReview : null
  const tossToCall = state.toss.pending && state.toss.winnerId === me && inn.events.length === 0
  const myTimeout = state.timeouts?.[me]
  const oppTimeout = state.timeouts?.[opp]
  const fresh = (t: typeof myTimeout) =>
    t && t.innings === inn.index && t.boostBalls === TIMEOUT_BALLS
  const impact = state.sheets[me]?.impact
  const canImpact =
    !!impact &&
    !impact.used &&
    inn.maxOvers === 20 &&
    !review &&
    (atInningsBreak(state) || atOverBreak(inn))
  const fieldProps = {
    radius: state.pitch.boundary,
    phase,
    field: state.sheets[inn.bowlingTeamId]?.field ?? 'balanced',
    event: last,
    recent: inn.events.filter((e) => e.over === over && e !== last && e.runs > 0),
    eventKey: inn.events.length + inn.index * 1000,
    batColor: batTeam?.colors.primary ?? '#14b8a6',
    bowlColor: bowlTeam?.colors.primary ?? '#ffffff',
    reducedMotion: prefersReducedMotion(),
  }
  const dock = state.result ? null : tossToCall ? (
    <div className="dock play-dock decision" role="group" aria-label="Toss">
      <span className="dock-caption">You won the toss</span>
      <div className="dock-row">
        <button
          className="pd-btn text main"
          onClick={() => {
            decideToss(state, 'bat')
            refresh()
          }}
        >
          <b>Bat first</b>
        </button>
        <button
          className="pd-btn text"
          onClick={() => {
            decideToss(state, 'field')
            refresh()
          }}
        >
          <b>Bowl first</b>
        </button>
      </div>
    </div>
  ) : review ? (
    <div className="dock play-dock decision" role="group" aria-label="Review decision">
      <span className="dock-caption">
        DRS · {inn.reviews?.[me] ?? 0} review{(inn.reviews?.[me] ?? 0) === 1 ? '' : 's'} left
      </span>
      <div className="dock-row">
        <button
          className="pd-btn text main"
          onClick={() => {
            resolveReview(state, true)
            refresh()
          }}
        >
          <b>Review</b>
        </button>
        <button
          className="pd-btn text"
          onClick={() => {
            resolveReview(state, false)
            refresh()
          }}
        >
          <b>{review.call === 'out' ? 'Walk off' : 'Accept'}</b>
        </button>
      </div>
    </div>
  ) : atInningsBreak(state) ? (
    <div className="dock play-dock decision" role="group" aria-label="Innings break">
      <div className="dock-row">
        <button
          className="pd-btn text main"
          onClick={() => {
            startNextInnings(state)
            refresh()
          }}
        >
          <b>{state.innings.length >= 2 ? 'Start super over' : 'Start 2nd innings'}</b>
        </button>
      </div>
    </div>
  ) : (
    <div className="dock play-dock stack" role="group" aria-label="Sim controls">
      <div className="dock-row">
        <button className="pd-btn" onClick={() => step(simBall)}>
          <b>1</b>
          <small>BALL</small>
        </button>
        <button className="pd-btn main" onClick={() => step(simOver)}>
          <b>1</b>
          <small>OVER</small>
        </button>
        <button className="pd-btn" onClick={() => step((s, r) => simOvers(s, r, 5))}>
          <b>5</b>
          <small>OVERS</small>
        </button>
        <button className="pd-btn" onClick={() => step(simInnings)}>
          <b>
            <Icon name="play" size={22} />
          </b>
          <small>INNINGS</small>
        </button>
      </div>
      <button
        className="dock-tool quiet"
        onClick={() => {
          if (confirm('Play the rest of the match without stopping?')) step(simMatch)
        }}
      >
        Play the rest of the match
      </button>
    </div>
  )

  return (
    <Screen
      className={`match-screen ${inn.bowlingTeamId === me && !state.result ? 'bowling-view' : ''}`}
      back={back}
      dock={dock}
      primary={state.result ? finish : null}
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
              {chase.rrr > 9 && chase.balls > 0 && (
                <em className="tag warn">
                  {' '}
                  · Pressure on{chase.rrr >= 11 ? ': risky shots get batters out' : ''}
                </em>
              )}
            </div>
          ) : (
            <div className="chase dim">
              {tossToCall
                ? 'You won the toss'
                : `Toss: ${teamShort(state.toss.winnerId)} chose to ${state.toss.decision}`}{' '}
              · {dewText(dew)}
            </div>
          )}
          {fresh(oppTimeout) ? (
            <div className="last">{teamShort(opp)} take their strategic timeout.</div>
          ) : (
            last && <div className="last">{commentary(last, state)}</div>
          )}
        </span>
        <span className="side">
          {bowlTeam && <Crest crest={bowlTeam.crest} colors={bowlTeam.colors} size={38} />}
          {other ? `${other.runs}/${other.wickets}` : bowlTeam?.short}
        </span>
        {!state.result && (
          <WinBar state={state} left={inn.battingTeamId} right={inn.bowlingTeamId} />
        )}
      </div>

      {brief}

      <div className="six-strip" aria-label="Last six balls">
        {inn.events.length === 0 && <span className="dim">First ball coming up</span>}
        {inn.events.slice(-6).map((e, i) => (
          <span key={i} className={`ball ${e.wicket ? 'w' : e.boundary ? 'b' : ''}`}>
            {ballLabel(e)}
          </span>
        ))}
      </div>

      <div className={`field-wrap ${inn.bowlingTeamId === me ? 'compact' : ''}`}>
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

      {tossToCall && (
        <div className="crease-panel decision">
          <span className="label">TOSS</span>
          <strong>You won the toss. Bat or bowl?</strong>
          <span className="dim">
            {capitalize(describePitch(state.pitch))}. {dewText(dew)} in the second innings
            {dew > 0.6 ? ': the ball will be wet for whoever bowls second' : ''}.
          </span>
        </div>
      )}

      {review && (
        <div className="crease-panel decision">
          <span className="label">
            DRS · {inn.reviews?.[me] ?? 0} review{(inn.reviews?.[me] ?? 0) === 1 ? '' : 's'} left
          </span>
          <strong>
            {review.call === 'out'
              ? `${state.players[review.batterId]?.name} is given out ${review.kind === 'lbw' ? 'lbw' : 'caught behind'}.`
              : `Big lbw appeal against ${state.players[review.batterId]?.name}: not out.`}
          </strong>
          <span className={`review-feel ${review.feel}`}>{feelText(review)}</span>
          <span className="dim">
            If the decision stands you lose the review (unless it's umpire's call).
          </span>
        </div>
      )}

      {fresh(myTimeout) && !review && <TimeoutCard state={state} me={me} />}

      {!state.result && atInningsBreak(state) && (
        <div className="crease-panel break">
          <span className="label">INNINGS BREAK</span>
          <strong>
            {batTeam?.short} {inn.runs}/{inn.wickets} ({oversText(inn.legalBalls)} ov)
          </strong>
          <span>
            {bowlTeam?.short} need {inn.runs + 1} to win
            {inn.maxOvers === 1 ? ' the super over' : ''}.
          </span>
          {canImpact && <ImpactHint state={state} me={me} onOpen={() => setImpactOpen(true)} />}
        </div>
      )}

      {!state.result && !atInningsBreak(state) && !tossToCall && (
        <>
          <div className={`crease-panel ${inn.bowlingTeamId === me ? 'bowling' : ''}`}>
            {inn.bowlingTeamId === me ? (
              <BowlingPanel state={state} me={me} people={people} onChange={refresh} />
            ) : (
              <>
                <span className="label">
                  BATTING · {teamShort(inn.battingTeamId)} reviews{' '}
                  {inn.reviews?.[inn.battingTeamId] ?? 0}
                </span>
                {[inn.strikerId, inn.nonStrikerId].map((id) => (
                  <BatRow
                    key={id}
                    p={people.get(id)}
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
                      refresh()
                    }}
                  />
                ))}
                <span className="label">BOWLING</span>
                <BowlRow state={state} people={people} />
              </>
            )}
            {(canImpact || canCallTimeout(state, me)) && (
              <div className="button-row">
                {canImpact && <button onClick={() => setImpactOpen(true)}>Impact Player</button>}
                {canCallTimeout(state, me) && (
                  <button
                    onClick={() => {
                      callTimeout(state, me)
                      refresh()
                    }}
                  >
                    Strategic timeout
                  </button>
                )}
              </div>
            )}
          </div>
          {inn.bowlingTeamId === me && inn.bowlerId === null && (
            <BowlerPicker state={state} people={people} onChange={refresh} />
          )}
        </>
      )}

      <div className="match-extra">
        {state.result && <WinWorm state={state} me={me} />}
        {state.result && after}
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

      {impactOpen && (
        <ImpactSheet
          state={state}
          me={me}
          onClose={() => setImpactOpen(false)}
          onDone={() => {
            setImpactOpen(false)
            refresh()
          }}
        />
      )}
    </Screen>
  )
}

/** The captain's suggestion at the innings break. */
function ImpactHint({ state, me, onOpen }: { state: MatchState; me: string; onOpen: () => void }) {
  const s = suggestImpact(state, me)
  const name = (id: string) => state.players[id]?.name ?? id
  return (
    <div className="impact-hint">
      <span>
        Impact Player:{' '}
        {s ? `bring on ${name(s.inId)} for ${name(s.outId)}?` : 'no obvious swap right now.'}
      </span>
      <div className="button-row">
        {s && (
          <button
            onClick={() => {
              makeImpactSub(state, me, s.outId, s.inId)
              onOpen()
            }}
          >
            Use suggestion
          </button>
        )}
        <button onClick={onOpen}>Choose</button>
      </div>
    </div>
  )
}

/** Pick the substitute and who he replaces. */
function ImpactSheet({
  state,
  me,
  onClose,
  onDone,
}: {
  state: MatchState
  me: string
  onClose: () => void
  onDone: () => void
}) {
  const sheet = state.sheets[me]
  const used = sheet?.impact?.used
  const subs = sheet?.impact?.subs ?? []
  const [inId, setIn] = useState(subs[0] ?? '')
  const [outId, setOut] = useState('')
  const [error, setError] = useState<string | null>(null)
  const p = (id: string) => state.players[id]
  const rating = (id: string) =>
    `Bat ${Math.round(p(id)?.batting ?? 0)} · Bowl ${Math.round(p(id)?.bowling ?? 0)}`
  if (!sheet) return null
  if (used) {
    return (
      <Sheet title="Impact Player" onClose={onDone}>
        <p>
          {p(used.inId)?.name} comes on for {p(used.outId)?.name}.
        </p>
        <button className="primary" onClick={onDone}>
          Done
        </button>
      </Sheet>
    )
  }
  const blocked = inId && outId ? impactBlocker(state, me, outId, inId) : null
  return (
    <Sheet title="Impact Player" onClose={onClose}>
      <p className="dim">
        Once a match, at an over break: a substitute replaces a player, who takes no further part.
        The substitute can bat (if the player he replaces has not batted) and bowl a full four
        overs.
      </p>
      <h3 className="section">Bring on</h3>
      <div className="pick-list">
        {subs.map((id) => (
          <button key={id} className={id === inId ? 'on' : ''} onClick={() => setIn(id)}>
            <strong>{p(id)?.name}</strong>
            <span className="dim">
              {rating(id)}
              {p(id)?.overseas ? ' · Overseas' : ''}
            </span>
          </button>
        ))}
      </div>
      <h3 className="section">Replace</h3>
      <div className="pick-list">
        {sheet.battingOrder.map((id) => {
          const why = inId ? impactBlocker(state, me, id, inId) : null
          return (
            <button
              key={id}
              className={id === outId ? 'on' : ''}
              disabled={!!why && /keeper|crease/.test(why)}
              onClick={() => setOut(id)}
            >
              <strong>{p(id)?.name}</strong>
              <span className="dim">{rating(id)}</span>
            </button>
          )
        })}
      </div>
      {(error ?? blocked) && <p className="error">{error ?? blocked}</p>}
      <button
        className="primary"
        disabled={!inId || !outId || !!blocked}
        onClick={() => {
          const e = makeImpactSub(state, me, outId, inId)
          if (e) setError(e)
          else onDone()
        }}
      >
        Confirm swap
      </button>
    </Sheet>
  )
}

/** What the manager sees during his strategic timeout. */
function TimeoutCard({ state, me }: { state: MatchState; me: string }) {
  const inn = currentInnings(state)
  const batting = inn.battingTeamId === me
  const pct = Math.round(winProbability(state, me) * 100)
  const chase = chaseStatus(inn)
  const name = (id: string) => state.players[id]?.name ?? id
  const sheet = state.sheets[inn.bowlingTeamId]
  const left = (sheet?.battingOrder ?? [])
    .filter((id) => inn.bowling[id] || (state.players[id]?.bowling ?? 0) >= 50)
    .filter((id) => id !== sheet?.keeperId)
    .map((id) => ({
      id,
      overs: MAX_OVERS_PER_BOWLER - Math.floor((inn.bowling[id]?.legalBalls ?? 0) / 6),
    }))
    .filter((b) => b.overs > 0)
    .sort((a, b) => (state.players[b.id]?.bowling ?? 0) - (state.players[a.id]?.bowling ?? 0))
    .slice(0, 4)
  const batters = [inn.strikerId, inn.nonStrikerId].map((id) => ({
    id,
    balls: inn.batting[id]?.balls ?? 0,
  }))
  return (
    <div className="crease-panel decision">
      <span className="label">STRATEGIC TIMEOUT</span>
      <strong>
        Win chance {pct}% ·{' '}
        {chase
          ? `need ${chase.need} from ${chase.balls} (RRR ${chase.rrr.toFixed(1)})`
          : `heading for about ${projectedScore(inn)}`}
      </strong>
      <ul className="tips">
        {batters.map((b) => (
          <li key={b.id}>
            {name(b.id)}:{' '}
            {b.balls < 6 ? 'new, still getting set' : b.balls >= 20 ? 'set' : 'settling in'} (
            {inn.batting[b.id]?.runs ?? 0} off {b.balls})
          </li>
        ))}
        <li>
          {batting ? 'Their' : 'Your'} overs left:{' '}
          {left.map((b) => `${name(b.id)} ${b.overs}`).join(', ') || 'none'}
        </li>
        {inn.index >= 1 && (state.conditions?.dew ?? 0) > 0.6 && (
          <li>Heavy dew: spinners will struggle to grip the ball.</li>
        )}
      </ul>
      <span className="dim">
        Your side refocuses: +{TIMEOUT_BOOST} for the next {TIMEOUT_BALLS / 6} overs. Set your
        tactics, then play on.
      </span>
    </div>
  )
}

/** Live win chance for the two sides, as one split bar (batting side on the left). */
function WinBar({ state, left, right }: { state: MatchState; left: string; right: string }) {
  const mine = teamById.get(left)
  const theirs = teamById.get(right)
  const p = winProbability(state, left)
  const pct = Math.round(p * 100)
  return (
    <div className="win-bar" aria-label={`Win chance ${mine?.short} ${pct}%`}>
      <span className="wb-side">
        {mine?.short} <strong>{pct}%</strong>
      </span>
      <span className="wb-track">
        <span
          className="wb-fill"
          style={{ width: `${pct}%`, background: mine?.colors.primary ?? 'var(--accent)' }}
        />
        <span
          className="wb-rest"
          style={{ background: theirs?.colors.primary ?? 'var(--surface-2)' }}
        />
      </span>
      <span className="wb-side right">
        <strong>{100 - pct}%</strong> {theirs?.short}
      </span>
    </div>
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
  p: Person | undefined
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
          {(line?.balls ?? 0) < 6 ? (
            <em className="tag warn"> New</em>
          ) : (line?.balls ?? 0) >= 20 && (line?.runs ?? 0) >= 25 ? (
            <em className="tag good"> In the zone</em>
          ) : (line?.balls ?? 0) >= 20 ? (
            <em className="tag good"> Set</em>
          ) : null}
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

function BowlRow({ state, people }: { state: MatchState; people: Map<string, Person> }) {
  const inn = currentInnings(state)
  const id = inn.bowlerId ?? inn.events.at(-1)?.bowlerId
  if (!id) return <span className="dim">New over</span>
  const p = people.get(id)
  const b = inn.bowling[id]
  const team = p?.teamId ? teamById.get(p.teamId) : undefined
  const spell = inn.bowlerId === id ? (inn.spell ?? spellLength(inn, id) + 1) : 0
  const rattled = inn.bowlerId === id && (inn.overBoundaries ?? 0) >= 2
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
          {spell >= 3 && <em className="tag warn"> Tiring · over {spell} of spell</em>}
          {rattled && <em className="tag bad"> Rattled</em>}
          {!rattled && inn.expensive?.[id] && (
            <em className="tag warn"> Shaken by his last over</em>
          )}
          {(b?.wickets ?? 0) > 0 && !rattled && <em className="tag good"> Confident</em>}
        </span>
      </span>
    </div>
  )
}

const FIELD_LABEL = {
  attacking: 'Attacking',
  balanced: 'Balanced',
  defensive: 'Defensive',
} as const
const BOWL_INTENT_LABEL = { contain: 'Contain', balanced: 'Balanced', attack: 'Attack' } as const
const PLAN_LABEL = {
  stock: 'Stock',
  yorkers: 'Yorkers',
  bouncers: 'Bouncers',
  wide: 'Wide line',
  variations: 'Variations',
} as const

/** A small avatar with a one-line score, for the side column. */
function Mini({
  p,
  name,
  sub,
  on = false,
  tag,
}: {
  p: Person | undefined
  name: string
  sub: string
  on?: boolean
  tag?: string
}) {
  const team = p?.teamId ? teamById.get(p.teamId) : undefined
  return (
    <div className={`mini ${on ? 'on' : ''}`}>
      {p && (
        <Avatar
          seed={p.id}
          nationality={p.nationality}
          age={p.age}
          kit={team?.colors ?? { primary: '#555', secondary: '#ccc' }}
          size={32}
          ring={ringStatus(p.fitness)}
        />
      )}
      <span className="mini-text">
        <span className="mini-name">{name.split(' ').slice(-1)[0]}</span>
        <span className="mini-sub">
          {sub}
          {tag && <em className="tag warn"> {tag}</em>}
        </span>
      </span>
    </div>
  )
}

/**
 * The manager's bowling, laid out so it fits on screen: the batters and the bowler as
 * small badges on the left; on the right, who bowls the next over, the field, the
 * bowler's approach and the plan.
 */
function BowlingPanel({
  state,
  me,
  people,
  onChange,
}: {
  state: MatchState
  me: string
  people: Map<string, Person>
  onChange: () => void
}) {
  const inn = currentInnings(state)
  const sheet = state.sheets[me]
  if (!sheet) return null
  const choosing = inn.bowlerId === null
  const bowlerId = inn.bowlerId ?? inn.events.at(-1)?.bowlerId
  const bowled = bowlerId ? inn.bowling[bowlerId] : undefined
  const batter = (id: string) => ({
    line: inn.batting[id],
    name: state.players[id]?.name ?? '',
  })
  const set = (patch: Parameters<typeof setLiveTactics>[2]) => {
    setLiveTactics(state, me, patch)
    onChange()
  }
  return (
    <div className="bowl-panel">
      <div className="bp-side">
        <span className="label">BAT</span>
        {[inn.strikerId, inn.nonStrikerId].map((id) => {
          const { line, name } = batter(id)
          return (
            <Mini
              key={id}
              p={people.get(id)}
              name={name}
              sub={`${line?.runs ?? 0} (${line?.balls ?? 0})${id === inn.strikerId ? ' *' : ''}`}
              on={id === inn.strikerId}
            />
          )
        })}
        <span className="label">BOWL</span>
        {bowlerId ? (
          <Mini
            p={people.get(bowlerId)}
            name={state.players[bowlerId]?.name ?? ''}
            sub={
              bowled
                ? `${oversText(bowled.legalBalls)}-${bowled.runs}-${bowled.wickets}`
                : 'new over'
            }
            tag={!choosing && (inn.overBoundaries ?? 0) >= 2 ? 'Rattled' : undefined}
          />
        ) : (
          <div className="mini empty">—</div>
        )}
      </div>

      <div className="bp-main">
        <span className="bp-title">
          Over {Math.floor(inn.legalBalls / 6) + 1}
          {(inn.spell ?? 0) >= 3 ? ` · spell over ${inn.spell}` : ''}
          {choosing ? ' · pick a bowler below' : ''}
        </span>
        <div className="bp-group">
          <span className="bp-label">Field</span>
          <div className="bp-seg">
            {FIELD_SETTINGS.map((f) => (
              <button
                key={f}
                className={sheet.field === f ? 'on' : ''}
                onClick={() => set({ field: f })}
              >
                {FIELD_LABEL[f]}
              </button>
            ))}
          </div>
        </div>
        <div className="bp-group">
          <span className="bp-label">Bowler</span>
          <div className="bp-seg">
            {BOWL_INTENTS.map((b) => (
              <button
                key={b}
                className={sheet.bowlIntent === b ? 'on' : ''}
                onClick={() => set({ bowlIntent: b })}
              >
                {BOWL_INTENT_LABEL[b]}
              </button>
            ))}
          </div>
        </div>
        <div className="bp-group">
          <span className="bp-label">Plan</span>
          <div className="bp-plans">
            {BOWL_PLANS.map((pl) => (
              <button
                key={pl}
                className={sheet.bowlPlan === pl ? 'on' : ''}
                onClick={() => set({ bowlPlan: pl })}
              >
                {PLAN_LABEL[pl]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Who bowls the next over: its own block under the panel, so the tactics stay compact. */
function BowlerPicker({
  state,
  people,
  onChange,
}: {
  state: MatchState
  people: Map<string, Person>
  onChange: () => void
}) {
  const inn = currentInnings(state)
  return (
    <div className="bp-pick">
      <span className="bp-title">
        Pick the bowler for over {Math.floor(inn.legalBalls / 6) + 1}
      </span>
      <div className="bp-list">
        {eligibleBowlers(state)
          .map((id) => ({ id, b: inn.bowling[id], m: state.players[id] }))
          .filter((x) => x.m && (x.m.role === 'bowler' || x.m.role === 'allrounder' || x.b))
          .sort((x, y) => (y.m?.bowling ?? 0) - (x.m?.bowling ?? 0))
          .map(({ id, b, m }) => {
            const tiring = spellLength(inn, id) >= 2
            const traits = people
              .get(id)
              ?.traits.filter((t) => !(BATTING_TRAITS as readonly string[]).includes(t))
            return (
              <button
                key={id}
                className={`bp-card ${tiring ? 'tired' : ''}`}
                onClick={() => {
                  setLiveBowler(state, id)
                  onChange()
                }}
              >
                <strong>
                  {m?.name}
                  {tiring && <em className="tag warn"> Tiring</em>}
                </strong>
                <small>
                  {m?.bowlingType === 'spin' ? 'Spin' : 'Pace'} ·{' '}
                  {b ? `${oversText(b.legalBalls)}-${b.runs}-${b.wickets}` : 'yet to bowl'}
                  {traits?.map((t) => ` · ${TRAIT_LABEL[t]}`)}
                </small>
                <span className="bp-rate">{Math.round(m?.bowling ?? 0)}</span>
              </button>
            )
          })}
      </div>
      <span className="bp-hint">Or press a sim button and the captain picks.</span>
    </div>
  )
}

/** What the players' reactions tell the side deciding whether to review. */
function feelText(r: PendingReview): string {
  const out = r.call === 'out'
  const what = r.kind === 'lbw' ? 'lbw' : 'edge'
  if (r.feel === 'confident')
    return out
      ? r.kind === 'lbw'
        ? 'The batter is adamant: he thinks it pitched outside or was going over.'
        : "The batter is adamant he didn't hit it."
      : 'The bowler is sure it was plumb, and the keeper agrees.'
  if (r.feel === 'unsure')
    return out
      ? `A long chat in the middle: the ${what} looked close.`
      : 'The bowler half-fancies it; the keeper shrugs.'
  return out
    ? 'The batter half-turns for the pavilion: it looked out.'
    : 'Even the bowler looks unconvinced.'
}
