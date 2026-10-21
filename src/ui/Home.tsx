import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { teamById, teams } from '@/data'
import { objectiveForRank } from '@/sim/board'
import { describeEvent, today } from '@/sim/calendar'
import type { Career, SeasonReview } from '@/sim/career'
import {
  continueBlocker,
  nextUserFixture,
  stageName,
  standings,
  startCareer as previewCareer,
  TEAM_IDS,
  userFixtureToday,
} from '@/sim/game'
import type { Fixture } from '@/sim/league'
import { capRoom, isWindowOpen, payroll, SALARY_CAP, squadOf, strengthRanking } from '@/sim/market'
import {
  continueGame,
  quickSimMyMatch,
  resetCareer,
  startCareer,
  startMyMatch,
  useGame,
} from '@/state/store'
import { Crest } from './identity/Crest'
import { SquadList } from './SquadList'

const PHASE_LABEL = {
  preseason: 'Preseason',
  league: 'League',
  playoffs: 'Playoffs',
  offseason: 'Offseason',
}
const FINISH_LABEL = {
  champion: 'Champions',
  runnerUp: 'Runners-up',
  playoffs: 'Playoffs',
  league: 'League stage',
}

export const crore = (lakh: number) => `₹${(lakh / 100).toFixed(lakh % 100 === 0 ? 0 : 1)} cr`
const teamName = (id: string) => teamById.get(id)?.name ?? id
export function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

export function Home() {
  const career = useGame((s) => s.career)
  if (!career) return <NewCareer />
  if (career.status === 'sacked') return <GameOver career={career} />
  return <ClubHome career={career} />
}

function NewCareer() {
  const [name, setName] = useState('')
  // What each board would ask of a new manager, from squad strength.
  const expectations = useMemo(() => {
    const preview = previewCareer({ seed: 1, managerName: '', teamId: TEAM_IDS[0] as string })
    const ranking = strengthRanking(preview, TEAM_IDS)
    return Object.fromEntries(
      ranking.map((id, i) => [id, { rank: i + 1, goal: objectiveForRank(i + 1).text }]),
    )
  }, [])
  return (
    <>
      <h1>New career</h1>
      <label className="field">
        Manager name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
      </label>
      <h2 className="section">Choose your club</h2>
      <ul className="team-pick">
        {[...teams]
          .sort((a, b) => (expectations[a.id]?.rank ?? 0) - (expectations[b.id]?.rank ?? 0))
          .map((t) => (
            <li key={t.id}>
              <button onClick={() => startCareer(t.id, name)}>
                <Crest crest={t.crest} colors={t.colors} size={44} />
                <span>
                  <strong>{t.name}</strong>
                  <small>
                    Squad strength #{expectations[t.id]?.rank} · Board: {expectations[t.id]?.goal}
                  </small>
                </span>
              </button>
            </li>
          ))}
      </ul>
    </>
  )
}

function FixtureLine({ career, f }: { career: Career; f: Fixture }) {
  const me = career.manager.teamId
  const opp = f.homeId === me ? f.awayId : f.homeId
  const where = f.homeId === me ? 'home' : 'away'
  const label = f.stage === 'league' ? `Round ${f.round}` : stageName(f.stage)
  return (
    <span>
      {label}: vs {teamName(opp)} ({where}, {teamById.get(f.homeId)?.ground})
    </span>
  )
}

function ClubHome({ career }: { career: Career }) {
  const navigate = useNavigate()
  const me = career.manager.teamId
  const team = teamById.get(me)
  const day = today(career.calendar)
  const mine = userFixtureToday(career)
  const next = mine ? null : nextUserFixture(career)
  const blocker = continueBlocker(career)
  const squad = squadOf(career.players, me)
  const table = standings(career)
  const played = table.some((r) => r.played > 0)
  const position = table.findIndex((r) => r.teamId === me) + 1
  const lastResult = [...career.season.results].reverse().find((r) => r.teams.includes(me))
  const expiring = squad.filter((p) => (p.contract?.years ?? 0) <= 1)
  const review = career.season.review

  return (
    <>
      <header className="club-head">
        {team && <Crest crest={team.crest} colors={team.colors} size={56} />}
        <div>
          <h1>{team?.name}</h1>
          <p className="dim">Manager: {career.manager.name}</p>
        </div>
      </header>

      {review && <ReviewCard review={review} />}

      <section className="card">
        <div className="dim">
          {career.calendar.year} · Week {day.week} · {PHASE_LABEL[day.phase]}
        </div>
        {mine ? (
          <>
            <div className="today">
              <FixtureLine career={career} f={mine} />
            </div>
            <div className="button-row">
              <button className="primary grow" onClick={() => startMyMatch() && navigate('/match')}>
                Play match
              </button>
              <button className="grow" onClick={quickSimMyMatch}>
                Quick sim
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="today">
              {day.event
                ? describeEvent(day.event)
                : day.day === 0
                  ? 'New season'
                  : 'No match today'}
            </div>
            {next && (
              <div className="dim">
                Next: <FixtureLine career={career} f={next} />
              </div>
            )}
            <button className="primary" disabled={!!blocker} onClick={continueGame}>
              {review ? 'Start next season' : 'Continue'}
            </button>
          </>
        )}
        {lastResult && (
          <div className="dim">
            Last: {lastResult.winnerId === me ? 'Won' : lastResult.winnerId ? 'Lost' : 'No result'}{' '}
            vs {teamName(lastResult.teams.find((t) => t !== me) ?? '')} ·{' '}
            {lastResult.innings
              .slice(0, 2)
              .map((i) => `${teamById.get(i.teamId)?.short} ${i.runs}/${i.wickets}`)
              .join(', ')}
          </div>
        )}
      </section>

      <section className="card">
        <div className="row-between">
          <strong>Board</strong>
          <span className="dim">Reputation {Math.round(career.manager.reputation)}</span>
        </div>
        <div>
          Objective: {career.season.objective.text}
          {played && (
            <span className={position <= career.season.objective.targetPosition ? 'good' : 'warn'}>
              {' '}
              · now {ordinal(position)}
            </span>
          )}
        </div>
        <div className="meter" aria-label={`Board confidence ${career.manager.boardConfidence}`}>
          <span style={{ width: `${career.manager.boardConfidence}%` }} />
        </div>
        <div className="dim">Board confidence {Math.round(career.manager.boardConfidence)}/100</div>
      </section>

      <section className="card">
        <div className="row-between">
          <strong>Squad</strong>
          <span className="money">{crore(capRoom(career.players, me))} left</span>
        </div>
        <div className="dim">
          {squad.length} players · {squad.filter((p) => p.overseas).length} overseas · payroll{' '}
          {crore(payroll(career.players, me))} of {crore(SALARY_CAP)}
        </div>
        {expiring.length > 0 && (
          <div className="warn">
            {expiring.length} contract{expiring.length > 1 ? 's' : ''} end this season
            {isWindowOpen(career) ? ' — renew them in the Market.' : ' — renew after the season.'}
          </div>
        )}
      </section>

      <h2 className="section">Squad ({squad.length})</h2>
      <SquadList players={squad} />
    </>
  )
}

function ReviewCard({ review }: { review: SeasonReview }) {
  const players = useGame((s) => s.career?.players ?? [])
  const name = (id: string | undefined) => players.find((p) => p.id === id)?.name ?? '—'
  const a = review.awards
  return (
    <section className="card review">
      <strong>{review.year} season review</strong>
      <div>
        Champions: {teamName(review.championId)} · Runners-up: {teamName(review.runnerUpId)}
      </div>
      <div>
        You finished {ordinal(review.position)} ({FINISH_LABEL[review.finish]}). Objective:{' '}
        {review.objective.text} — {review.objectiveMet ? 'met' : 'missed'}.
      </div>
      <div className={review.objectiveMet ? 'good' : 'warn'}>{review.message}</div>
      <ul className="awards">
        {a.orangeCap && (
          <li>
            Orange Cap: {name(a.orangeCap.playerId)} ({a.orangeCap.value})
          </li>
        )}
        {a.purpleCap && (
          <li>
            Purple Cap: {name(a.purpleCap.playerId)} ({a.purpleCap.value})
          </li>
        )}
        {a.mvp && <li>MVP: {name(a.mvp.playerId)}</li>}
        {a.emerging && <li>Emerging player: {name(a.emerging.playerId)}</li>}
      </ul>
    </section>
  )
}

function GameOver({ career }: { career: Career }) {
  const last = career.season.review
  const seasons = [...career.history, ...(last ? [last] : [])]
  return (
    <>
      <h1>Sacked</h1>
      <p>
        The board of {teamName(career.manager.teamId)} has ended your time as manager.
        {last ? ` ${last.message}` : ''}
      </p>
      <h2 className="section">Your career</h2>
      <table className="grades">
        <thead>
          <tr>
            <th>Season</th>
            <th>Finish</th>
            <th>Objective</th>
          </tr>
        </thead>
        <tbody>
          {seasons.map((s) => (
            <tr key={s.year}>
              <td>{s.year}</td>
              <td>
                {ordinal(s.position)} · {FINISH_LABEL[s.finish]}
              </td>
              <td>{s.objectiveMet ? 'Met' : 'Missed'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="primary" onClick={resetCareer}>
        Start a new career
      </button>
    </>
  )
}
