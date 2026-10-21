import { useState, type ReactNode } from 'react'
import { teamById } from '@/data'
import { direction } from '@/match3d/geometry'
import {
  currentInnings,
  simBall,
  simInnings,
  simMatch,
  simOver,
  simOvers,
  type Match,
} from '@/sim/match/engine'
import { gradeMatch, letterGrade, type PlayerReport } from '@/sim/match/postMatch'
import {
  ballLabel,
  chaseStatus,
  dismissalText,
  economy,
  oversText,
  strikeRate,
} from '@/sim/match/scorecard'
import type { Aggression, InningsState, MatchState } from '@/sim/match/types'
import { turningPoint, winProbabilityTrail } from '@/sim/match/winProb'
import { commentary } from './commentary'

export const INTENT_LABEL: Record<Aggression, string> = {
  defend: 'Defend',
  rotate: 'Rotate',
  balanced: 'Balanced',
  attack: 'Attack',
  allout: 'All-out',
}

export const short = (id: string) => teamById.get(id)?.short ?? id

/** Next ball / over / 5 overs / innings / match. `step` runs one sim function and re-renders. */
export function SimControls({
  step,
}: {
  step: (fn: (s: MatchState, r: Match['rng']) => unknown) => void
}) {
  return (
    <div className="button-row sim-buttons">
      <button onClick={() => step(simBall)}>Next ball</button>
      <button onClick={() => step(simOver)}>Sim over</button>
      <button onClick={() => step((s, r) => simOvers(s, r, 5))}>Sim 5 overs</button>
      <button onClick={() => step(simInnings)}>Sim innings</button>
      <button onClick={() => step(simMatch)}>Sim match</button>
    </div>
  )
}

export function MatchView({
  state,
  humanId,
  onIntent,
  controls,
}: {
  state: MatchState
  humanId: string | null
  onIntent: (batterId: string, delta: number) => void
  controls: ReactNode
}) {
  const inn = currentInnings(state)
  const name = (id: string) => state.players[id]?.name ?? id
  const chase = chaseStatus(inn)
  const last = inn.events.slice(-6)
  const first = state.innings[0]
  const humanBatting = inn.battingTeamId === humanId && !state.result
  const sheet = state.sheets[inn.battingTeamId]
  const intentOf = (id: string) => sheet?.intent[id] ?? sheet?.aggression ?? 'balanced'
  const label =
    inn.index >= 2
      ? `Super over ${Math.floor(inn.index / 2)}`
      : inn.index === 0
        ? '1st innings'
        : '2nd innings'

  return (
    <>
      <section className="card scorebug">
        <div className="dim">
          {label} · toss: {short(state.toss.winnerId)} chose to {state.toss.decision}
        </div>
        <div className="score">
          {short(inn.battingTeamId)} {inn.runs}/{inn.wickets}
          <small> ({oversText(inn.legalBalls)} ov)</small>
        </div>
        {inn.index > 0 && first && (
          <div className="dim">
            {short(first.battingTeamId)} {first.runs}/{first.wickets} ({oversText(first.legalBalls)}
            )
          </div>
        )}
        {chase && !state.result && (
          <div>
            Need {chase.need} from {chase.balls} balls · RRR {chase.rrr.toFixed(2)}
          </div>
        )}
        {state.result && (
          <div className="result">
            {state.result.winnerId
              ? `${teamById.get(state.result.winnerId)?.name} ${state.result.margin}`
              : 'Match tied'}
          </div>
        )}
        <div className="last-six">
          {last.map((e, i) => (
            <span
              key={i}
              className={`ball ${e.wicket ? 'w' : e.boundary ? 'b' : e.total === 0 ? 'd' : ''}`}
            >
              {ballLabel(e)}
            </span>
          ))}
        </div>
      </section>

      {!state.result && (
        <section className="card crease">
          {[inn.strikerId, inn.nonStrikerId].map((id) => {
            const line = inn.batting[id]
            return (
              <div key={id} className="crease-row">
                <span className="crease-name">
                  {name(id)}
                  {id === inn.strikerId ? ' *' : ''}
                  <small>
                    {' '}
                    {line?.runs ?? 0} ({line?.balls ?? 0})
                  </small>
                </span>
                {humanBatting && (
                  <span className="intent">
                    <button onClick={() => onIntent(id, -1)} aria-label="Less aggressive">
                      −
                    </button>
                    <span>{INTENT_LABEL[intentOf(id)]}</span>
                    <button onClick={() => onIntent(id, 1)} aria-label="More aggressive">
                      +
                    </button>
                  </span>
                )}
              </div>
            )
          })}
          {inn.events.at(-1) && (
            <div className="dim">
              Bowler: {name(inn.events.at(-1)?.bowlerId ?? '')}{' '}
              {(() => {
                const b = inn.bowling[inn.events.at(-1)?.bowlerId ?? '']
                return b ? `${oversText(b.legalBalls)}-${b.runs}-${b.wickets}` : ''
              })()}
            </div>
          )}
        </section>
      )}

      {!state.result && controls}

      <h2 className="section">Commentary</h2>
      <ol className="commentary">
        {[...inn.events]
          .slice(-12)
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
    </>
  )
}

/** "(impact)" for an Impact Player who came on, "(replaced)" for the player he replaced. */
function impactTag(state: MatchState, teamId: string, id: string): string {
  const used = state.sheets[teamId]?.impact?.used
  return used?.inId === id ? ' (impact)' : used?.outId === id ? ' (replaced)' : ''
}

export function Scorecard({ state, inn }: { state: MatchState; inn: InningsState }) {
  const name = (id: string) => state.players[id]?.name ?? id
  const batName = (id: string) => name(id) + impactTag(state, inn.battingTeamId, id)
  const bowlName = (id: string) => name(id) + impactTag(state, inn.bowlingTeamId, id)
  const title =
    inn.index >= 2
      ? `Super over: ${short(inn.battingTeamId)}`
      : teamById.get(inn.battingTeamId)?.name
  const bowlers = Object.entries(inn.bowling)
  return (
    <details className="scorecard" open={inn.index < 2 && !!state.result}>
      <summary>
        {title} {inn.runs}/{inn.wickets} ({oversText(inn.legalBalls)})
      </summary>
      <table>
        <thead>
          <tr>
            <th>Batter</th>
            <th>R</th>
            <th>B</th>
            <th>4s</th>
            <th>6s</th>
            <th>SR</th>
          </tr>
        </thead>
        <tbody>
          {inn.battedOrder.map((id) => {
            const l = inn.batting[id]
            return (
              <tr key={id}>
                <td>
                  {batName(id)}
                  <small>{dismissalText(state, inn, id)}</small>
                </td>
                <td>{l?.runs ?? 0}</td>
                <td>{l?.balls ?? 0}</td>
                <td>{l?.fours ?? 0}</td>
                <td>{l?.sixes ?? 0}</td>
                <td>{strikeRate(l?.runs ?? 0, l?.balls ?? 0).toFixed(0)}</td>
              </tr>
            )
          })}
          <tr>
            <td>Extras</td>
            <td colSpan={5}>{inn.extras}</td>
          </tr>
        </tbody>
      </table>
      <table>
        <thead>
          <tr>
            <th>Bowler</th>
            <th>O</th>
            <th>R</th>
            <th>W</th>
            <th>Econ</th>
          </tr>
        </thead>
        <tbody>
          {bowlers.map(([id, b]) => (
            <tr key={id}>
              <td>{bowlName(id)}</td>
              <td>{oversText(b.legalBalls)}</td>
              <td>{b.runs}</td>
              <td>{b.wickets}</td>
              <td>{economy(b.runs, b.legalBalls).toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <WagonWheel state={state} inn={inn} />
    </details>
  )
}

/** Every scoring shot of an innings (or one batter) from the striker's end. */
export function WagonWheel({ state, inn }: { state: MatchState; inn: InningsState }) {
  const [batter, setBatter] = useState<string>('')
  const shots = inn.events.filter((e) => e.shot && e.runs > 0 && (!batter || e.batterId === batter))
  const off = shots.filter((e) => (e.shot?.angle ?? 0) < 180).reduce((n, e) => n + e.runs, 0)
  const total = shots.reduce((n, e) => n + e.runs, 0)
  const R = 100
  // From the batter at the centre; fours reach the rope, sixes just beyond it.
  const end = (e: (typeof shots)[number]) => {
    const s = e.shot as NonNullable<typeof e.shot>
    const reach = e.boundary === 6 ? 1.05 : e.boundary === 4 ? 1 : Math.min(0.95, s.distance / 70)
    const d = direction(s.angle)
    return { x: d.x * reach * R, y: d.y * reach * R }
  }
  return (
    <div className="wagon">
      <div className="row-between">
        <strong>Wagon wheel</strong>
        <select
          value={batter}
          onChange={(ev) => setBatter(ev.target.value)}
          aria-label="Wagon wheel for"
        >
          <option value="">Whole innings</option>
          {inn.battedOrder.map((id) => (
            <option key={id} value={id}>
              {state.players[id]?.name}
            </option>
          ))}
        </select>
      </div>
      <svg
        viewBox={`${-R - 8} ${-R - 8} ${2 * R + 16} ${2 * R + 16}`}
        role="img"
        aria-label={`Scoring shots: ${total} runs, ${off} on the off side`}
      >
        <circle r={R} className="ww-field" />
        <circle r={R * 0.42} className="ww-ring" />
        <rect x={-3} y={-2} width={6} height={26} className="ww-pitch" />
        {shots.map((e, i) => {
          const p = end(e)
          return (
            <line
              key={i}
              x1={0}
              y1={0}
              x2={p.x}
              y2={p.y}
              className={e.boundary === 6 ? 'ww-six' : e.boundary === 4 ? 'ww-four' : 'ww-run'}
            />
          )
        })}
        <text x={-R + 4} y={R - 4} className="ww-label">
          Off {off}
        </text>
        <text x={R - 4} y={R - 4} className="ww-label" textAnchor="end">
          Leg {total - off}
        </text>
      </svg>
      <p className="dim ww-key">
        <span className="ww-dot four" /> Four <span className="ww-dot six" /> Six{' '}
        <span className="ww-dot run" /> 1–3
      </p>
    </div>
  )
}

/** Win-chance worm over both innings, with the ball that swung it most. */
export function WinWorm({ state, me }: { state: MatchState; me: string }) {
  const trail = winProbabilityTrail(state, me)
  if (trail.length < 2) return null
  const W = 320
  const H = 90
  const x = (i: number) => (i / (trail.length - 1)) * W
  const y = (p: number) => H - p * H
  const points = trail.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ')
  const breakAt = (state.innings[0]?.events.length ?? 0) + 0.5
  const tp = turningPoint(trail)
  const events = state.innings.slice(0, 2).flatMap((i) => i.events)
  const tpEvent = tp ? events[tp.index] : undefined
  const team = teamById.get(me)
  return (
    <section className="worm">
      <h2 className="section">Win chance · {team?.short}</h2>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Win chance through the match">
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="worm-mid" />
        <line x1={x(breakAt)} x2={x(breakAt)} y1={0} y2={H} className="worm-mid" />
        <polyline points={points} className="worm-line" />
        {tp && (
          <circle
            cx={x(tp.index + 1)}
            cy={y(trail[tp.index + 1] ?? 0.5)}
            r={4}
            className="worm-dot"
          />
        )}
      </svg>
      {tp && tpEvent && (
        <p className="dim">
          <strong>Turning point</strong> ({tpEvent.innings === 0 ? '1st' : '2nd'} inns{' '}
          {tpEvent.over}.{tpEvent.ball}, {tp.swing > 0 ? '+' : ''}
          {Math.round(tp.swing * 100)}%): {commentary(tpEvent, state)}
        </p>
      )}
    </section>
  )
}

export function PostMatch({
  state,
  reports,
  canApply,
  onApply,
}: {
  state: MatchState
  reports: PlayerReport[] | null
  canApply: boolean
  onApply: () => void
}) {
  const rows = reports ?? gradeMatch(state)
  const name = (id: string) => state.players[id]?.name ?? id
  const sorted = [...rows].sort((a, b) => b.grade - a.grade)
  return (
    <>
      <h2 className="section">Player grades</h2>
      {canApply && (
        <button onClick={onApply}>Apply to career (fitness, form, injuries, ratings)</button>
      )}
      <table className="grades">
        <thead>
          <tr>
            <th>Player</th>
            <th>Bat</th>
            <th>Bowl</th>
            <th>Grade</th>
            {reports && <th>Change</th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const rep = reports ? (r as PlayerReport) : null
            const delta = rep ? rep.ratingChange.batting + rep.ratingChange.bowling : 0
            return (
              <tr key={r.id}>
                <td>
                  {name(r.id)} <small>{short(r.teamId)}</small>
                  {rep?.injury && (
                    <small className="injury">
                      Injured ({rep.injury.kind}, {rep.injury.matchesOut} matches)
                    </small>
                  )}
                </td>
                <td>{r.battingGrade ?? '–'}</td>
                <td>{r.bowlingGrade ?? '–'}</td>
                <td>{letterGrade(r.grade)}</td>
                {rep && (
                  <td>
                    {delta > 0 ? `+${delta}` : delta || '–'}
                    <small>Fit {Math.round(rep.fitnessAfter)}</small>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}
