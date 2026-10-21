import { useState } from 'react'
import type { CareerPlayer } from '@/sim/career'
import { squadOf } from '@/sim/market'
import { overallRating } from '@/sim/player'
import { useGame } from '@/state/store'
import { Screen } from './kit/kit'
import { PlayerRow, PlayerSheet } from './PlayerRow'
import { useNextAction } from './useNextAction'

export type Filter = 'all' | 'bat' | 'bowl' | 'ar' | 'wk' | 'os'

export const FILTERS: [Filter, string, (p: CareerPlayer) => boolean][] = [
  ['all', 'All', () => true],
  ['bat', 'Batters', (p) => p.role === 'batter'],
  ['wk', 'Keepers', (p) => p.role === 'wicketkeeper'],
  ['ar', 'All-rounders', (p) => p.role === 'allrounder'],
  ['bowl', 'Bowlers', (p) => p.role === 'bowler'],
  ['os', 'Overseas', (p) => p.overseas],
]

export function FilterChips({ value, onChange }: { value: Filter; onChange: (f: Filter) => void }) {
  return (
    <div className="filters" role="tablist">
      {FILTERS.map(([f, label]) => (
        <button
          key={f}
          className={value === f ? 'on' : ''}
          onClick={() => onChange(f)}
          role="tab"
          aria-selected={value === f}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function SquadPage() {
  const career = useGame((s) => s.career)
  const next = useNextAction()
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<CareerPlayer | null>(null)
  if (!career) return null
  const test = FILTERS.find(([f]) => f === filter)?.[2] ?? (() => true)
  const squad = squadOf(career.players, career.manager.teamId)
    .filter(test)
    .sort((a, b) => overallRating(b) - overallRating(a))
  return (
    <Screen primary={next}>
      <h1>Squad</h1>
      <FilterChips value={filter} onChange={setFilter} />
      <ul className="plist">
        {squad.map((p) => (
          <li key={p.id}>
            <PlayerRow
              p={p}
              onClick={() => setOpen(p)}
              extra={
                <>
                  Form {Math.round(p.form)} · Fit {Math.round(p.fitness)}
                </>
              }
            />
          </li>
        ))}
      </ul>
      {open && <PlayerSheet p={open} onClose={() => setOpen(null)} />}
    </Screen>
  )
}
