import { useNavigate } from 'react-router-dom'
import { teamById } from '@/data'
import { managerSheet, stageName, userFixtureToday } from '@/sim/game'
import { squadOf } from '@/sim/market'
import { autoPickXI, pitchFor } from '@/sim/match/selection'
import type { Pitch } from '@/sim/match/types'
import { overallRating } from '@/sim/player'
import { quickSimMyMatch, startMyMatch, useGame } from '@/state/store'
import { Crest } from './identity/Crest'
import { Screen } from './kit/kit'
import { INTENT_LABEL } from './match/MatchView'
import { PlayerRow } from './PlayerRow'

/** A plain-words read of the pitch. */
export function describePitch(p: Pitch): string {
  const bits: string[] = []
  if (p.flat > 0.25) bits.push('a flat, high-scoring deck')
  else if (p.flat < -0.1) bits.push('a slow, tricky surface')
  else bits.push('a fair surface')
  if (p.pace > 0.25) bits.push('some help for the quicks')
  if (p.spin > 0.25) bits.push('turn for the spinners')
  bits.push(
    p.boundary <= 67
      ? 'short boundaries'
      : p.boundary >= 72
        ? 'big boundaries'
        : 'average boundaries',
  )
  return bits.join(', ')
}

export function PreMatchPage() {
  const career = useGame((s) => s.career)
  const navigate = useNavigate()
  const f = career ? userFixtureToday(career) : null
  if (!career || !f) {
    return (
      <Screen>
        <h1>No match today</h1>
      </Screen>
    )
  }
  const me = career.manager.teamId
  const oppId = f.homeId === me ? f.awayId : f.homeId
  const home = teamById.get(f.homeId)
  const away = teamById.get(f.awayId)
  const sheet = managerSheet(career)
  const byId = new Map(career.players.map((p) => [p.id, p]))
  const theirBest = autoPickXI(squadOf(career.players, oppId))
    .sort((a, b) => overallRating(b) - overallRating(a))
    .slice(0, 3)
  return (
    <Screen
      primary={{
        label: 'Play Live',
        onClick: () => {
          if (startMyMatch()) navigate('/match', { replace: true })
        },
      }}
    >
      <div className="card" style={{ alignItems: 'center', textAlign: 'center' }}>
        <span className="dim">
          {f.stage === 'league' ? `Round ${f.round}` : stageName(f.stage)}
        </span>
        <div className="row-between" style={{ width: '100%', justifyContent: 'space-around' }}>
          {home && <Crest crest={home.crest} colors={home.colors} size={72} />}
          <strong style={{ fontSize: 22 }}>vs</strong>
          {away && <Crest crest={away.crest} colors={away.colors} size={72} />}
        </div>
        <strong>
          {home?.name} v {away?.name}
        </strong>
        <span className="dim">
          {home?.ground}, {home?.city}: {describePitch(pitchFor(f.homeId))}.
        </span>
      </div>
      <div className="button-row" style={{ marginTop: 10 }}>
        <button onClick={() => navigate('/lineup')}>Edit XI</button>
        <button
          onClick={() => {
            quickSimMyMatch()
            navigate('/', { replace: true })
          }}
        >
          Quick sim
        </button>
      </div>
      <h2 className="section">Your XI · intent {INTENT_LABEL[sheet.aggression]}</h2>
      <ol className="list">
        {sheet.battingOrder.map((id, i) => {
          const p = byId.get(id)
          return (
            p && (
              <li key={id} className="row-between">
                <span>
                  {i + 1}. {p.name} {id === sheet.keeperId && <span className="dim">(wk)</span>}
                </span>
                <span className="dim">{overallRating(p)}</span>
              </li>
            )
          )
        })}
      </ol>
      <h2 className="section">Danger men</h2>
      <ul className="plist">
        {theirBest.map((p) => (
          <li key={p.id}>
            <PlayerRow p={p} as="div" />
          </li>
        ))}
      </ul>
    </Screen>
  )
}
