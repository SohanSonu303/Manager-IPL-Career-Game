import { useState } from 'react'
import type { SeasonStat } from '@/sim/league'
import { useGame } from '@/state/store'
import { teamShort } from './format'
import { Screen } from './kit/kit'
import { useNextAction } from './useNextAction'

type Board = 'runs' | 'wickets' | 'sr' | 'econ' | 'mvp'

const BOARDS: {
  id: Board
  label: string
  value: (s: SeasonStat) => number
  show: (s: SeasonStat) => string
  ok: (s: SeasonStat) => boolean
  asc?: boolean
}[] = [
  {
    id: 'runs',
    label: 'Runs',
    value: (s) => s.runs,
    show: (s) => `${s.runs} (HS ${s.highScore})`,
    ok: (s) => s.runs > 0,
  },
  {
    id: 'wickets',
    label: 'Wickets',
    value: (s) => s.wickets,
    show: (s) => `${s.wickets}`,
    ok: (s) => s.wickets > 0,
  },
  {
    id: 'sr',
    label: 'Strike rate',
    value: (s) => (s.runs / s.balls) * 100,
    show: (s) => ((s.runs / s.balls) * 100).toFixed(1),
    ok: (s) => s.balls >= 60,
  },
  {
    id: 'econ',
    label: 'Economy',
    value: (s) => (s.runsConceded / s.ballsBowled) * 6,
    show: (s) => ((s.runsConceded / s.ballsBowled) * 6).toFixed(2),
    ok: (s) => s.ballsBowled >= 60,
    asc: true,
  },
  {
    id: 'mvp',
    label: 'MVP',
    value: (s) => s.gradeSum / s.matches,
    show: (s) => `avg grade ${Math.round(s.gradeSum / s.matches)}`,
    ok: (s) => s.matches >= 3,
  },
]

/** Season leaderboards. */
export function StatsPage() {
  const career = useGame((s) => s.career)
  const next = useNextAction()
  const [board, setBoard] = useState<Board>('runs')
  const [mine, setMine] = useState(false)
  if (!career) return null
  const b = BOARDS.find((x) => x.id === board) ?? BOARDS[0]!
  const name = new Map(career.players.map((p) => [p.id, p.name]))
  const rows = Object.entries(career.season.stats)
    .filter(([, s]) => b.ok(s) && (!mine || s.teamId === career.manager.teamId))
    .sort((x, y) => (b.asc ? b.value(x[1]) - b.value(y[1]) : b.value(y[1]) - b.value(x[1])))
    .slice(0, 15)
  return (
    <Screen primary={next}>
      <h1>{career.calendar.year} statistics</h1>
      <div className="filters">
        {BOARDS.map((x) => (
          <button key={x.id} className={board === x.id ? 'on' : ''} onClick={() => setBoard(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
      <label className="toggle">
        <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
        My team only
      </label>
      {rows.length === 0 ? (
        <p className="dim">No numbers yet — play some matches.</p>
      ) : (
        <table className="standings">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>M</th>
              <th>{b.label}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([id, s], i) => (
              <tr key={id} className={s.teamId === career.manager.teamId ? 'mine' : ''}>
                <td>{i + 1}</td>
                <td>
                  {name.get(id) ?? 'Retired'} <span className="dim">{teamShort(s.teamId)}</span>
                </td>
                <td>{s.matches}</td>
                <td>
                  <strong>{b.show(s)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Screen>
  )
}
