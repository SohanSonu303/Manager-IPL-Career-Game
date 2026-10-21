import type { ReactNode } from 'react'
import { teamById } from '@/data'
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

export function Scorecard({ state, inn }: { state: MatchState; inn: InningsState }) {
  const name = (id: string) => state.players[id]?.name ?? id
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
                  {name(id)}
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
              <td>{name(id)}</td>
              <td>{oversText(b.legalBalls)}</td>
              <td>{b.runs}</td>
              <td>{b.wickets}</td>
              <td>{economy(b.runs, b.legalBalls).toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
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
