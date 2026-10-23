import { Fragment, type ReactNode } from 'react'
import { teamById } from '@/data'
import type { CareerPlayer } from '@/sim/career'
import { askingSalary } from '@/sim/market'
import { mergeStats } from '@/sim/game'
import type { SeasonStat } from '@/sim/league'
import { overallRating } from '@/sim/player'
import { useGame } from '@/state/store'
import { crore, roleLabel, TRAIT_INFO, TRAIT_LABEL } from './format'
import { Avatar } from './identity/Avatar'
import { ringStatus } from './identity/avatarSpec'
import { Chip, Meter, RatingRing, ratingColor, Sheet } from './kit/kit'

/** Squad-list row: avatar with fitness ring, name, nationality, role, traits, overall ring. */
export function PlayerRow({
  p,
  onClick,
  side,
  extra,
  picked = false,
  as = 'button',
}: {
  p: CareerPlayer
  onClick?: () => void
  /** Replaces the overall ring on the right. */
  side?: ReactNode
  /** Extra line under the role. */
  extra?: ReactNode
  picked?: boolean
  /** Render as a plain container when the row holds its own buttons. */
  as?: 'button' | 'div'
}) {
  const team = p.teamId ? teamById.get(p.teamId) : undefined
  const Tag = as
  return (
    <Tag
      className={`prow ${picked ? 'picked' : ''}`}
      onClick={onClick}
      {...(as === 'div' && onClick
        ? {
            role: 'button',
            tabIndex: 0,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            },
          }
        : {})}
    >
      <Avatar
        seed={p.id}
        nationality={p.nationality}
        age={p.age}
        kit={team?.colors ?? { primary: '#5b6070', secondary: '#c9ccd6' }}
        size={54}
        ring={ringStatus(p.fitness)}
        title={p.name}
      />
      <span className="prow-main">
        <span className="prow-name">
          {p.name}
          <span className="nat">{p.nationality}</span>
        </span>
        <span className="prow-meta">
          {roleLabel(p)} · {p.age}
          {p.traits.map((t) => (
            <Chip key={t} tone={t === 'poor-vs-spin' ? 'warn' : 'good'}>
              {TRAIT_LABEL[t]}
            </Chip>
          ))}
          {p.injury && <Chip tone="bad">Injured {p.injury.matchesOut}</Chip>}
        </span>
        {extra && <span className="prow-meta">{extra}</span>}
      </span>
      {side ?? <RatingRing value={overallRating(p)} />}
    </Tag>
  )
}

function StatsTable({ season, total }: { season?: SeasonStat; total?: SeasonStat }) {
  const rows: [string, SeasonStat | undefined][] = [
    ['Season', season],
    ['Career', total],
  ]
  const avg = (runs: number, outs: number) =>
    outs ? (runs / outs).toFixed(1) : runs ? `${runs}*` : '–'
  const sr = (runs: number, balls: number) => (balls ? ((runs / balls) * 100).toFixed(0) : '–')
  const econ = (r: number, b: number) => (b ? ((r / b) * 6).toFixed(2) : '–')
  return (
    <table className="grades">
      <thead>
        <tr>
          <th />
          <th>M</th>
          <th>Runs</th>
          <th>Avg</th>
          <th>SR</th>
          <th>HS</th>
          <th>Wkts</th>
          <th>Econ</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, s]) => (
          <tr key={label}>
            <td>{label}</td>
            <td>{s?.matches ?? 0}</td>
            <td>{s?.runs ?? 0}</td>
            <td>{s ? avg(s.runs, s.outs) : '–'}</td>
            <td>{s ? sr(s.runs, s.balls) : '–'}</td>
            <td>{s?.highScore ?? 0}</td>
            <td>{s?.wickets ?? 0}</td>
            <td>{s ? econ(s.runsConceded, s.ballsBowled) : '–'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Everything about one player: ratings, condition, skills, numbers, contract. */
export function PlayerSheet({
  p,
  onClose,
  actions,
}: {
  p: CareerPlayer
  onClose: () => void
  actions?: ReactNode
}) {
  const career = useGame((s) => s.career)
  const team = p.teamId ? teamById.get(p.teamId) : undefined
  const season = career?.season.stats[p.id]
  const past = career?.careerStats[p.id]
  const total =
    season && past ? mergeStats({ [p.id]: past }, { [p.id]: season })[p.id] : (past ?? season)
  const rows: [string, number][] = [
    ['Batting', p.ratings.batting],
    ['Bowling', p.ratings.bowling],
    ['Fielding', p.ratings.fielding],
    ['Potential', p.potential],
    ['Form', Math.round(p.form)],
    ['Fitness', Math.round(p.fitness)],
    ['Morale', Math.round(p.morale)],
  ]
  return (
    <Sheet title={p.name} onClose={onClose}>
      <div className="row-between">
        <span className="prow-meta">
          {roleLabel(p)} · {p.age} · {p.nationality}
          {p.overseas && <Chip tone="blue">Overseas</Chip>}
        </span>
        <RatingRing value={overallRating(p)} size={56} />
      </div>
      <div className="card" style={{ marginTop: 10 }}>
        <div className="ratings-grid">
          {rows.map(([label, v]) => (
            <Fragment key={label}>
              <span>{label}</span>
              <Meter value={v} color={ratingColor(v)} />
              <b>{v}</b>
            </Fragment>
          ))}
        </div>
        {p.morale < 35 && (
          <span className="warn">Unhappy — he wants more game time or a move.</span>
        )}
      </div>
      {p.traits.length > 0 && (
        <div className="card">
          <strong>Skills</strong>
          {p.traits.map((t) => (
            <span key={t} className="prow-meta">
              <Chip tone={t === 'poor-vs-spin' ? 'warn' : 'good'}>{TRAIT_LABEL[t]}</Chip>
              {TRAIT_INFO[t]}
            </span>
          ))}
        </div>
      )}
      <div className="card">
        <strong>Numbers</strong>
        <StatsTable season={season} total={total} />
      </div>
      <div className="card">
        <div className="row-between">
          <span>Club</span>
          <strong>{team?.name ?? 'Free agent'}</strong>
        </div>
        {p.contract ? (
          <div className="row-between">
            <span>Contract</span>
            <strong>
              {crore(p.contract.salary)} · {p.contract.years} season
              {p.contract.years === 1 ? '' : 's'} left
            </strong>
          </div>
        ) : (
          <div className="row-between">
            <span>Asking</span>
            <strong>{crore(askingSalary(p))}</strong>
          </div>
        )}
        {p.injury && (
          <span className="bad">
            Injured ({p.injury.kind}): out for {p.injury.matchesOut} more matches
          </span>
        )}
      </div>
      {actions}
    </Sheet>
  )
}
