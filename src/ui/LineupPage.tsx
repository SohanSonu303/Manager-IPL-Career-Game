import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Career } from '@/sim/career'
import { managerSheet } from '@/sim/game'
import { squadOf } from '@/sim/market'
import {
  autoTeamSheet,
  isAvailable,
  MAX_OVERSEAS_IN_XI,
  MIN_BOWLING_OPTIONS,
  validateSheet,
  XI_SIZE,
} from '@/sim/match/selection'
import { AGGRESSION, type Aggression, type TeamSheet } from '@/sim/match/types'
import { overallRating } from '@/sim/player'
import { setLineup, useGame } from '@/state/store'
import { Icon } from './kit/Icon'
import { Chip, RatingRing, Screen } from './kit/kit'
import { INTENT_LABEL } from './match/MatchView'
import { PlayerRow } from './PlayerRow'

/** Pick XI: who plays, batting order, keeper and the team's default intent. */
export function LineupPage() {
  const career = useGame((s) => s.career)
  if (!career) return null
  return <LineupEditor career={career} />
}

function LineupEditor({ career }: { career: Career }) {
  const navigate = useNavigate()
  const me = career.manager.teamId
  const squad = squadOf(career.players, me)
  const [sheet, setSheet] = useState<TeamSheet>(() => managerSheet(career))
  const byId = new Map(squad.map((p) => [p.id, p]))
  const xi = sheet.battingOrder.map((id) => byId.get(id)).filter((p) => !!p)
  const bench = squad
    .filter((p) => !sheet.battingOrder.includes(p.id))
    .sort((a, b) => overallRating(b) - overallRating(a))
  const errors = validateSheet(sheet, squad)
  const overseas = xi.filter((p) => p.overseas).length
  const bowlers = xi.filter((p) => p.role === 'bowler' || p.role === 'allrounder').length

  const setOrder = (battingOrder: string[]) => setSheet((s) => ({ ...s, battingOrder }))
  const move = (i: number, d: number) => {
    const o = [...sheet.battingOrder]
    const j = i + d
    if (j < 0 || j >= o.length) return
    ;[o[i], o[j]] = [o[j] as string, o[i] as string]
    setOrder(o)
  }
  const remove = (id: string) => setOrder(sheet.battingOrder.filter((x) => x !== id))
  const add = (id: string) =>
    sheet.battingOrder.length < XI_SIZE && setOrder([...sheet.battingOrder, id])

  return (
    <Screen
      primary={{
        label: 'Save XI',
        disabled: errors.length > 0,
        onClick: () => {
          setLineup({
            battingOrder: sheet.battingOrder,
            keeperId: sheet.keeperId,
            aggression: sheet.aggression,
          })
          navigate(-1)
        },
      }}
    >
      <h1>Pick XI</h1>
      <div className="row-between">
        <span className="prow-meta">
          <Chip tone={xi.length === XI_SIZE ? 'good' : 'warn'}>
            {xi.length}/{XI_SIZE} picked
          </Chip>
          <Chip tone={overseas <= MAX_OVERSEAS_IN_XI ? 'good' : 'bad'}>
            {overseas}/{MAX_OVERSEAS_IN_XI} overseas
          </Chip>
          <Chip tone={bowlers >= MIN_BOWLING_OPTIONS ? 'good' : 'warn'}>
            {bowlers} bowling options
          </Chip>
        </span>
        <button onClick={() => setSheet(autoTeamSheet(me, squad, false))}>Auto-pick</button>
      </div>

      <h2 className="section">Team intent</h2>
      <div className="filters">
        {AGGRESSION.map((a: Aggression) => (
          <button
            key={a}
            className={sheet.aggression === a ? 'on' : ''}
            onClick={() => setSheet((s) => ({ ...s, aggression: a }))}
          >
            {INTENT_LABEL[a]}
          </button>
        ))}
      </div>

      {errors.length > 0 && (
        <ul className="list">
          {errors.map((e) => (
            <li key={e} className="warn">
              {e}
            </li>
          ))}
        </ul>
      )}

      <h2 className="section">Batting order</h2>
      <ul className="plist">
        {xi.map((p, i) => (
          <li key={p.id}>
            <PlayerRow
              p={p}
              as="div"
              side={
                <span className="prow-side">
                  <span className="button-row">
                    <button
                      className="icon-btn"
                      onClick={() => move(i, -1)}
                      aria-label={`Move ${p.name} up`}
                      disabled={i === 0}
                    >
                      <Icon name="up" />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => move(i, 1)}
                      aria-label={`Move ${p.name} down`}
                      disabled={i === xi.length - 1}
                    >
                      <Icon name="down" />
                    </button>
                  </span>
                  <span className="button-row">
                    <button
                      className={`icon-btn ${sheet.keeperId === p.id ? 'good' : 'dim'}`}
                      onClick={() => setSheet((s) => ({ ...s, keeperId: p.id }))}
                      aria-label={`Make ${p.name} the keeper`}
                      aria-pressed={sheet.keeperId === p.id}
                    >
                      <Icon name="gloves" />
                    </button>
                    <button
                      className="icon-btn bad"
                      onClick={() => remove(p.id)}
                      aria-label={`Drop ${p.name}`}
                    >
                      <Icon name="close" />
                    </button>
                  </span>
                </span>
              }
              extra={
                <>
                  <strong>#{i + 1}</strong>{' '}
                  {sheet.keeperId === p.id && <Chip tone="blue">Keeper</Chip>} OVR{' '}
                  {overallRating(p)}
                </>
              }
            />
          </li>
        ))}
      </ul>

      <h2 className="section">Bench</h2>
      <ul className="plist">
        {bench.map((p) => (
          <li key={p.id}>
            <PlayerRow
              p={p}
              as="div"
              side={
                <span className="prow-side">
                  <RatingRing value={overallRating(p)} />
                  <button
                    className="icon-btn"
                    onClick={() => add(p.id)}
                    disabled={!isAvailable(p) || xi.length >= XI_SIZE}
                    aria-label={`Add ${p.name}`}
                  >
                    <Icon name="plus" />
                  </button>
                </span>
              }
            />
          </li>
        ))}
      </ul>
    </Screen>
  )
}
