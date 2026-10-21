import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { teamById, teams } from '@/data'
import { objectiveForRank } from '@/sim/board'
import { today } from '@/sim/calendar'
import type { Career, SeasonReview } from '@/sim/career'
import { managerSheet, standings, startCareer as previewCareer, TEAM_IDS } from '@/sim/game'
import { capRoom, isWindowOpen, payroll, SALARY_CAP, squadOf, strengthRanking } from '@/sim/market'
import { resetCareer, startCareer, useGame } from '@/state/store'
import { crore, ordinal, teamName } from './format'
import { Crest } from './identity/Crest'
import { Icon, type IconName } from './kit/Icon'
import { FlatButton, HubButton, Meter, Screen, Sheet, Tile } from './kit/kit'
import { useNextAction } from './useNextAction'

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

export function Home() {
  const career = useGame((s) => s.career)
  if (!career) return <NewCareer />
  if (career.status === 'sacked') return <GameOver career={career} />
  return <ClubHub career={career} />
}

// --- New career ------------------------------------------------------------------------

function NewCareer() {
  const [name, setName] = useState('')
  const expectations = useMemo(() => {
    const preview = previewCareer({ seed: 1, managerName: '', teamId: TEAM_IDS[0] as string })
    const ranking = strengthRanking(preview, TEAM_IDS)
    return Object.fromEntries(
      ranking.map((id, i) => [id, { rank: i + 1, goal: objectiveForRank(i + 1).text }]),
    )
  }, [])
  return (
    <Screen back={false}>
      <h1>Cricket Manager</h1>
      <p className="dim">Take charge of a franchise. Win the title, keep the board happy.</p>
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
                <Crest crest={t.crest} colors={t.colors} size={48} />
                <span>
                  <strong>{t.name}</strong>
                  <small>
                    Squad #{expectations[t.id]?.rank} · Board: {expectations[t.id]?.goal}
                  </small>
                </span>
              </button>
            </li>
          ))}
      </ul>
    </Screen>
  )
}

// --- Club hub ------------------------------------------------------------------------------

type SheetName = 'board' | 'finances' | 'club' | 'review' | null

/** Six hub buttons on a circle; angles in degrees, 0 = right, clockwise. */
const HUB: { icon: IconName; label: string; to: string; angle: number }[] = [
  { icon: 'market', label: 'Market', to: '/market', angle: -90 },
  { icon: 'stats', label: 'Statistics', to: '/stats', angle: -30 },
  { icon: 'calendar', label: 'Fixtures', to: '/fixtures', angle: 30 },
  { icon: 'lineup', label: 'Pick XI', to: '/lineup', angle: 90 },
  { icon: 'table', label: 'Table', to: '/table', angle: 150 },
  { icon: 'squad', label: 'Squad', to: '/squad', angle: 210 },
]

function ClubHub({ career }: { career: Career }) {
  const navigate = useNavigate()
  const next = useNextAction()
  const [sheet, setSheet] = useState<SheetName>(career.season.review ? 'review' : null)
  const me = career.manager.teamId
  const team = teamById.get(me)
  const day = today(career.calendar)
  const squad = squadOf(career.players, me)
  const table = standings(career)
  const started = table.some((r) => r.played > 0)
  const position = table.findIndex((r) => r.teamId === me) + 1
  const injured = squad.filter((p) => p.injury)
  const expiring = squad.filter((p) => (p.contract?.years ?? 0) <= 1)
  const lineupStale =
    !!career.lineup &&
    managerSheet(career).battingOrder.join() !== career.lineup.battingOrder.join()
  const round = career.season.results.filter(
    (r) => r.stage === 'league' && r.teams.includes(me),
  ).length

  const alert: { text: string; icon: IconName; go: () => void } | null = career.season.review
    ? { text: 'Season review', icon: 'trophy', go: () => setSheet('review') }
    : injured.length
      ? { text: `${injured.length} injured`, icon: 'alert', go: () => navigate('/squad') }
      : expiring.length && isWindowOpen(career)
        ? {
            text: `${expiring.length} contracts ending`,
            icon: 'alert',
            go: () => navigate('/market'),
          }
        : null

  return (
    <Screen back={{ label: 'Settings', onClick: () => navigate('/settings') }} primary={next}>
      <div className="hub-tabs">
        <FlatButton onClick={() => setSheet('board')}>Board</FlatButton>
        <FlatButton onClick={() => setSheet('finances')}>Finances</FlatButton>
        <FlatButton onClick={() => setSheet('club')}>Club</FlatButton>
      </div>

      <div className="hub">
        <div className="hub-ring" />
        <div className="hub-ring inner" />
        <div className="hub-center">
          {team && <Crest crest={team.crest} colors={team.colors} size={112} />}
          <strong>{team?.name}</strong>
          <span>
            {career.calendar.year} ·{' '}
            {day.phase === 'league'
              ? `Round ${Math.min(14, round + 1)}/14`
              : PHASE_LABEL[day.phase]}
          </span>
        </div>
        {HUB.map((h) => {
          const rad = (h.angle * Math.PI) / 180
          const badge =
            (h.to === '/squad' && injured.length > 0) ||
            (h.to === '/market' && expiring.length > 0 && isWindowOpen(career)) ||
            (h.to === '/lineup' && lineupStale)
          return (
            <div
              key={h.to}
              style={{
                ['--x' as string]: `${50 + 37 * Math.cos(rad)}%`,
                ['--y' as string]: `${50 + 37 * Math.sin(rad)}%`,
              }}
              className="hub-pos"
            >
              <HubButton
                icon={h.icon}
                label={h.label}
                onClick={() => navigate(h.to)}
                badge={badge}
              />
            </div>
          )
        })}
      </div>

      <div className="tiles">
        <Tile caption="Standings" onClick={() => navigate('/table')}>
          {started ? (
            <span className="big">
              {position}
              <sup>{ordinal(position).slice(-2)}</sup>
            </span>
          ) : (
            <span className="big">–</span>
          )}
        </Tile>
        <Tile caption="Calendar" onClick={() => navigate('/fixtures')}>
          <span className="big">{career.calendar.year}</span>
        </Tile>
        <Tile caption="Alerts" onClick={alert?.go}>
          {alert ? (
            <>
              <span className="bad">
                <Icon name={alert.icon} size={30} />
              </span>
              <span>{alert.text}</span>
            </>
          ) : (
            <span className="dim">All clear</span>
          )}
        </Tile>
      </div>

      {sheet === 'board' && (
        <BoardSheet
          career={career}
          position={started ? position : null}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'finances' && <FinanceSheet career={career} onClose={() => setSheet(null)} />}
      {sheet === 'club' && <ClubSheet career={career} onClose={() => setSheet(null)} />}
      {sheet === 'review' && career.season.review && (
        <ReviewSheet review={career.season.review} onClose={() => setSheet(null)} />
      )}
    </Screen>
  )
}

function BoardSheet({
  career,
  position,
  onClose,
}: {
  career: Career
  position: number | null
  onClose: () => void
}) {
  const goal = career.season.objective
  const onTrack = position !== null && position <= goal.targetPosition
  return (
    <Sheet title="The board" onClose={onClose}>
      <div className="card">
        <strong>Objective: {goal.text}</strong>
        {position !== null ? (
          <span className={onTrack ? 'good' : 'warn'}>
            Currently {ordinal(position)} — {onTrack ? 'on track' : 'below target'}
          </span>
        ) : (
          <span className="dim">The season hasn't started.</span>
        )}
      </div>
      <div className="card">
        <div className="row-between">
          <strong>Board confidence</strong>
          <span>{Math.round(career.manager.boardConfidence)}/100</span>
        </div>
        <Meter
          value={career.manager.boardConfidence}
          color={career.manager.boardConfidence < 40 ? 'var(--danger)' : 'var(--money)'}
        />
        <span className="dim">Below 25 after a season review and you are sacked.</span>
      </div>
      <div className="card">
        <div className="row-between">
          <strong>Reputation</strong>
          <span>{Math.round(career.manager.reputation)}/100</span>
        </div>
        <Meter value={career.manager.reputation} color="var(--gold)" />
        <span className="dim">Higher reputation makes players keener to join.</span>
      </div>
    </Sheet>
  )
}

function FinanceSheet({ career, onClose }: { career: Career; onClose: () => void }) {
  const me = career.manager.teamId
  const squad = squadOf(career.players, me).sort(
    (a, b) => (b.contract?.salary ?? 0) - (a.contract?.salary ?? 0),
  )
  return (
    <Sheet title="Finances" onClose={onClose}>
      <div className="card">
        <div className="row-between">
          <span>Payroll</span>
          <strong>{crore(payroll(career.players, me))}</strong>
        </div>
        <div className="row-between">
          <span>Salary cap</span>
          <strong>{crore(SALARY_CAP)}</strong>
        </div>
        <div className="row-between">
          <span>Room</span>
          <strong className="money">{crore(capRoom(career.players, me))}</strong>
        </div>
        <Meter value={(payroll(career.players, me) / SALARY_CAP) * 100} color="var(--money)" />
      </div>
      <h2 className="section">Contracts</h2>
      <ul className="list">
        {squad.map((p) => (
          <li key={p.id} className="row-between">
            <span>
              {p.name} <span className="dim">· {p.contract?.years} yr</span>
            </span>
            <span className={(p.contract?.years ?? 0) <= 1 ? 'warn' : ''}>
              {crore(p.contract?.salary ?? 0)}
            </span>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}

function ClubSheet({ career, onClose }: { career: Career; onClose: () => void }) {
  const team = teamById.get(career.manager.teamId)
  const titles = career.history.filter((h) => h.finish === 'champion').length
  return (
    <Sheet title={team?.name ?? 'Club'} onClose={onClose}>
      <div className="card">
        <div className="row-between">
          <span>Home ground</span>
          <strong>
            {team?.ground}, {team?.city}
          </strong>
        </div>
        <div className="row-between">
          <span>Manager</span>
          <strong>{career.manager.name}</strong>
        </div>
        <div className="row-between">
          <span>Titles under you</span>
          <strong>{titles}</strong>
        </div>
      </div>
      <h2 className="section">Seasons</h2>
      {career.history.length ? (
        <SeasonsTable seasons={career.history} />
      ) : (
        <p className="dim">Your first season is under way.</p>
      )}
    </Sheet>
  )
}

function SeasonsTable({ seasons }: { seasons: SeasonReview[] }) {
  return (
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
  )
}

function ReviewSheet({ review, onClose }: { review: SeasonReview; onClose: () => void }) {
  const players = useGame((s) => s.career?.players ?? [])
  const name = (id: string | undefined) => players.find((p) => p.id === id)?.name ?? '—'
  const a = review.awards
  return (
    <Sheet title={`${review.year} season review`} onClose={onClose}>
      <div className="card">
        <div className="row-between">
          <span>Champions</span>
          <strong>{teamName(review.championId)}</strong>
        </div>
        <div className="row-between">
          <span>Runners-up</span>
          <span>{teamName(review.runnerUpId)}</span>
        </div>
      </div>
      <div className="card">
        <strong>
          You finished {ordinal(review.position)} · {FINISH_LABEL[review.finish]}
        </strong>
        <span>
          Objective: {review.objective.text} — {review.objectiveMet ? 'met' : 'missed'}
        </span>
        <span className={review.objectiveMet ? 'good' : 'warn'}>{review.message}</span>
      </div>
      <h2 className="section">Awards</h2>
      <ul className="list">
        {a.orangeCap && (
          <AwardRow label="Orange Cap" who={name(a.orangeCap.playerId)} what={a.orangeCap.value} />
        )}
        {a.purpleCap && (
          <AwardRow label="Purple Cap" who={name(a.purpleCap.playerId)} what={a.purpleCap.value} />
        )}
        {a.mvp && <AwardRow label="MVP" who={name(a.mvp.playerId)} what={a.mvp.value} />}
        {a.emerging && (
          <AwardRow
            label="Emerging player"
            who={name(a.emerging.playerId)}
            what={a.emerging.value}
          />
        )}
      </ul>
      <p className="dim">
        Renew expiring contracts in the Market before you start the next season.
      </p>
    </Sheet>
  )
}

function AwardRow({ label, who, what }: { label: string; who: string; what: string }) {
  return (
    <li>
      <span className="dim">{label}</span>
      <strong>{who}</strong>
      <span className="dim">{what}</span>
    </li>
  )
}

// --- Game over --------------------------------------------------------------------------

function GameOver({ career }: { career: Career }) {
  const last = career.season.review
  const seasons = [...career.history, ...(last ? [last] : [])]
  return (
    <Screen back={false} primary={{ label: 'New Career', onClick: resetCareer }}>
      <h1>Sacked</h1>
      <p>
        The board of {teamName(career.manager.teamId)} has ended your time as manager.
        {last ? ` ${last.message}` : ''}
      </p>
      <h2 className="section">Your career</h2>
      <SeasonsTable seasons={seasons} />
    </Screen>
  )
}
