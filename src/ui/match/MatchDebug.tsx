import { useMemo, useState } from 'react'
import { players as basePlayers, teamById, teams } from '@/data'
import type { CareerPlayer } from '@/sim/career'
import { setLiveIntent, type Match } from '@/sim/match/engine'
import type { PlayerReport } from '@/sim/match/postMatch'
import { autoTeamSheet, type Selectable } from '@/sim/match/selection'
import { setupMatch } from '@/sim/match/setup'
import type { MatchState } from '@/sim/match/types'
import { applyMatchToCareer, useGame } from '@/state/store'
import { MatchView, PostMatch, SimControls } from './MatchView'

function squadsFrom(careerPlayers: CareerPlayer[] | null): Record<string, Selectable[]> {
  const pool: Selectable[] =
    careerPlayers ?? basePlayers.map((p) => ({ ...p, fitness: 100, form: 50, injury: null }))
  return Object.fromEntries(teams.map((t) => [t.id, pool.filter((p) => p.teamId === t.id)]))
}

function randomSeed() {
  const b = new Uint32Array(1)
  crypto.getRandomValues(b)
  return b[0] ?? 1
}

/**
 * Debug match screen: pick two teams, step through a match ball by ball or in chunks,
 * read the commentary and scorecards, then apply the post-match step to the career.
 */
export function MatchDebug() {
  const career = useGame((s) => s.career)
  const squads = useMemo(() => squadsFrom(career?.players ?? null), [career])
  const humanId = career?.manager.teamId ?? null
  const [homeId, setHomeId] = useState(humanId ?? teams[0]?.id ?? '')
  const [awayId, setAwayId] = useState(teams.find((t) => t.id !== homeId)?.id ?? '')
  const [match, setMatch] = useState<Match | null>(null)
  const [, setTick] = useState(0)
  const [reports, setReports] = useState<PlayerReport[] | null>(null)

  const start = () => {
    const sheets =
      humanId && (homeId === humanId || awayId === humanId)
        ? { [humanId]: autoTeamSheet(humanId, squads[humanId] ?? [], false) }
        : {}
    setMatch(setupMatch({ seed: randomSeed(), homeId, awayId, squads, sheets }))
    setReports(null)
  }

  const step = (fn: (s: MatchState, r: Match['rng']) => unknown) => {
    if (!match || match.state.result) return
    fn(match.state, match.rng)
    setTick((t) => t + 1)
  }

  const setIntent = (batterId: string, delta: number) => {
    if (!match || !humanId) return
    setLiveIntent(match.state, humanId, batterId, delta)
    setTick((t) => t + 1)
  }

  return (
    <div className="match">
      <h1>Match sim</h1>
      <div className="match-pick">
        <select value={homeId} onChange={(e) => setHomeId(e.target.value)} aria-label="Home team">
          {teams.map((t) => (
            <option key={t.id} value={t.id} disabled={t.id === awayId}>
              {t.name}
            </option>
          ))}
        </select>
        <span className="dim">vs</span>
        <select value={awayId} onChange={(e) => setAwayId(e.target.value)} aria-label="Away team">
          {teams.map((t) => (
            <option key={t.id} value={t.id} disabled={t.id === homeId}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <button className="primary" onClick={start}>
        {match ? 'New match' : 'Start match'}
      </button>
      {humanId && (
        <p className="dim">You control {teamById.get(humanId)?.name}'s batting intent.</p>
      )}

      {match && (
        <MatchView
          state={match.state}
          humanId={humanId}
          onIntent={setIntent}
          controls={<SimControls step={step} />}
        />
      )}

      {match?.state.result && (
        <PostMatch
          state={match.state}
          reports={reports}
          canApply={!!career && !reports}
          onApply={() => setReports(applyMatchToCareer(match.state))}
        />
      )}
    </div>
  )
}
