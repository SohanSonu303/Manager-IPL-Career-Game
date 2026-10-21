import { teamById, type Role } from '@/data'
import type { CareerPlayer } from '@/sim/career'
import { overallRating } from '@/sim/player'
import { Avatar } from './identity/Avatar'
import { ringStatus } from './identity/avatarSpec'

const ROLE_LABEL: Record<Role, string> = {
  batter: 'Batter',
  wicketkeeper: 'Wicketkeeper',
  allrounder: 'All-rounder',
  bowler: 'Bowler',
}

export function roleLabel(p: Pick<CareerPlayer, 'role' | 'bowlingType'>): string {
  const type =
    p.bowlingType && p.role !== 'batter' && p.role !== 'wicketkeeper'
      ? ` · ${p.bowlingType === 'pace' ? 'Pace' : 'Spin'}`
      : ''
  return ROLE_LABEL[p.role] + type
}

/** Squad rows: avatar with fitness ring, full name, role, age, overall. */
export function SquadList({ players }: { players: CareerPlayer[] }) {
  const sorted = [...players].sort((a, b) => overallRating(b) - overallRating(a))
  return (
    <ul className="squad">
      {sorted.map((p) => {
        const team = p.teamId ? teamById.get(p.teamId) : undefined
        return (
          <li key={p.id}>
            <Avatar
              seed={p.id}
              nationality={p.nationality}
              age={p.age}
              kit={team?.colors ?? { primary: '#5b6070', secondary: '#c9ccd6' }}
              size={52}
              ring={ringStatus(p.fitness)}
              title={p.name}
            />
            <div className="squad-main">
              <div className="squad-name">{p.name}</div>
              <div className="squad-meta">
                {roleLabel(p)} · {p.age}
                {p.overseas && <span className="chip">Overseas · {p.nationality}</span>}
              </div>
              <div className="squad-meta">
                Form {Math.round(p.form)} · Fitness {Math.round(p.fitness)}
              </div>
            </div>
            <div className="squad-ovr" aria-label="Overall rating">
              {overallRating(p)}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
