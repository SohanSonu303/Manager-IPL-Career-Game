import { useState } from 'react'
import type { CareerPlayer } from '@/sim/career'
import { squadOf } from '@/sim/market'
import { useGame } from '@/state/store'
import { FilterBar } from './FilterBar'
import { Chip, Screen } from './kit/kit'
import { applyFilters, DEFAULT_FILTERS, type PlayerFilters } from './playerFilters'
import { PlayerRow, PlayerSheet } from './PlayerRow'
import { useNextAction } from './useNextAction'

export function SquadPage() {
  const career = useGame((s) => s.career)
  const next = useNextAction()
  const [filters, setFilters] = useState<PlayerFilters>(DEFAULT_FILTERS)
  const [open, setOpen] = useState<CareerPlayer | null>(null)
  if (!career) return null
  const all = squadOf(career.players, career.manager.teamId)
  const squad = applyFilters(all, filters)
  return (
    <Screen primary={next}>
      <h1>Squad</h1>
      <FilterBar
        value={filters}
        onChange={setFilters}
        count={squad.length}
        total={all.length}
        priceLabel="Salary"
      />
      <ul className="plist">
        {squad.map((p) => (
          <li key={p.id}>
            <PlayerRow
              p={p}
              onClick={() => setOpen(p)}
              extra={
                <>
                  Form {Math.round(p.form)} · Fit {Math.round(p.fitness)}
                  {(p.contract?.years ?? 0) <= 1 && <Chip tone="warn">Final year</Chip>}
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
