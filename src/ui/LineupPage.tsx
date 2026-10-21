import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Career, CareerPlayer } from '@/sim/career'
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
import { AGGRESSION, type TeamSheet } from '@/sim/match/types'
import { overallRating } from '@/sim/player'
import { setLineup, useGame } from '@/state/store'
import { Icon } from './kit/Icon'
import { Chip, Screen } from './kit/kit'
import { INTENT_LABEL } from './match/MatchView'

const ROLE_SHORT = { batter: 'BAT', wicketkeeper: 'WK', allrounder: 'AR', bowler: 'BWL' } as const

/** Where each batting position sits on the field diagram, as [left %, top %]. */
const SPOTS: [number, number][] = [
  [27, 10],
  [73, 10],
  [16, 28],
  [84, 28],
  [16, 47],
  [84, 47],
  [18, 66],
  [82, 66],
  [24, 85],
  [50, 94],
  [76, 85],
]

const lastName = (name: string) => name.split(' ').slice(1).join(' ') || name

/** Pick XI: eleven players on the field by batting order. Tap one, then another to swap. */
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
  const [sel, setSel] = useState<string | null>(null)
  const byId = new Map(squad.map((p) => [p.id, p]))
  const order = sheet.battingOrder
  const xi = order.map((id) => byId.get(id)).filter((p): p is CareerPlayer => !!p)
  const bench = squad
    .filter((p) => !order.includes(p.id))
    .sort((a, b) => overallRating(b) - overallRating(a))
  const errors = validateSheet(sheet, squad)
  const overseas = xi.filter((p) => p.overseas).length
  const bowlers = xi.filter((p) => p.role === 'bowler' || p.role === 'allrounder').length
  const setOrder = (battingOrder: string[]) => setSheet((s) => ({ ...s, battingOrder }))
  const selInXi = !!sel && order.includes(sel)

  const tapXi = (id: string) => {
    if (sel && sel !== id && selInXi) {
      const o = [...order]
      const i = o.indexOf(sel)
      const j = o.indexOf(id)
      ;[o[i], o[j]] = [o[j] as string, o[i] as string]
      setOrder(o)
      setSel(null)
    } else if (sel && !selInXi) {
      // A bench player was selected: he takes this player's place.
      setOrder(order.map((x) => (x === id ? sel : x)))
      if (sheet.keeperId === id) setSheet((s) => ({ ...s, keeperId: sel }))
      setSel(null)
    } else setSel(sel === id ? null : id)
  }
  const tapBench = (id: string) => {
    if (selInXi) {
      setOrder(order.map((x) => (x === sel ? id : x)))
      if (sheet.keeperId === sel) setSheet((s) => ({ ...s, keeperId: id }))
      setSel(null)
    } else if (order.length < XI_SIZE && isAvailable(byId.get(id) as CareerPlayer))
      setOrder([...order, id])
    else setSel(sel === id ? null : id)
  }
  const move = (d: number) => {
    if (!sel) return
    const o = [...order]
    const i = o.indexOf(sel)
    const j = i + d
    if (i < 0 || j < 0 || j >= o.length) return
    ;[o[i], o[j]] = [o[j] as string, o[i] as string]
    setOrder(o)
  }

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
      <div className="row-between">
        <h1>Your XI</h1>
        <button onClick={() => setSheet(autoTeamSheet(me, squad, false))}>Auto-pick</button>
      </div>
      <div className="prow-meta">
        <Chip tone={xi.length === XI_SIZE ? 'good' : 'warn'}>
          {xi.length}/{XI_SIZE}
        </Chip>
        <Chip tone={overseas <= MAX_OVERSEAS_IN_XI ? 'good' : 'bad'}>
          {overseas}/{MAX_OVERSEAS_IN_XI} overseas
        </Chip>
        <Chip tone={bowlers >= MIN_BOWLING_OPTIONS ? 'good' : 'warn'}>{bowlers} bowlers</Chip>
      </div>
      <div className="xi-strip">
        {selInXi ? (
          <div className="xi-tools">
            <button className="icon-btn" onClick={() => move(-1)} aria-label="Bat higher">
              <Icon name="up" />
            </button>
            <button className="icon-btn" onClick={() => move(1)} aria-label="Bat lower">
              <Icon name="down" />
            </button>
            <button onClick={() => sel && setSheet((s) => ({ ...s, keeperId: sel }))}>
              <Icon name="gloves" size={18} /> Keeper
            </button>
            <button
              onClick={() => {
                setOrder(order.filter((x) => x !== sel))
                setSel(null)
              }}
            >
              Bench
            </button>
          </div>
        ) : (
          <p className="dim">
            {sel
              ? 'Tap a player in the XI to swap him in.'
              : 'Batting order: 1–2 open, 11 last. Tap a player to move or swap.'}
          </p>
        )}
      </div>

      <div className="xi-field" role="group" aria-label="Playing XI by batting order">
        <span className="xi-oval" />
        <span className="xi-oval inner" />
        <span className="xi-pitch" />
        {xi.map((p, i) => {
          const [left, top] = SPOTS[i] ?? [50, 50]
          return (
            <button
              key={p.id}
              className={`xi-card ${sel === p.id ? 'sel' : ''} ${i < 2 ? 'open' : ''}`}
              style={{ left: `${left}%`, top: `${top}%` }}
              onClick={() => tapXi(p.id)}
              aria-label={`${i + 1}. ${p.name}`}
              aria-pressed={sel === p.id}
            >
              <span className="xi-n">{i + 1}</span>
              {sheet.keeperId === p.id && (
                <span className="xi-glove" aria-hidden="true">
                  <Icon name="gloves" size={14} />
                </span>
              )}
              <span className="xi-info">
                <strong>{lastName(p.name)}</strong>
                <span>
                  {ROLE_SHORT[p.role]} · {overallRating(p)}
                  {p.overseas && ' · OS'}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="xi-intent">
        <span className="dim">Batting intent</span>
        <div className="seg">
          {AGGRESSION.map((a) => (
            <button
              key={a}
              className={sheet.aggression === a ? 'on' : ''}
              onClick={() => setSheet((s) => ({ ...s, aggression: a }))}
            >
              {INTENT_LABEL[a]}
            </button>
          ))}
        </div>
      </div>

      {errors.map((e) => (
        <p key={e} className="warn">
          {e}
        </p>
      ))}

      <div className="row-between" style={{ marginTop: 12 }}>
        <h2 className="section" style={{ margin: 0 }}>
          Bench · {bench.length}
        </h2>
        <span className="dim" style={{ fontSize: 13 }}>
          Tap to add or swap in
        </span>
      </div>
      <div className="xi-bench">
        {bench.map((p) => (
          <button
            key={p.id}
            className={`bench-card ${sel === p.id ? 'sel' : ''}`}
            onClick={() => tapBench(p.id)}
            disabled={!isAvailable(p) && !selInXi}
          >
            <strong>{p.name}</strong>
            <span className={p.injury ? 'bad' : p.morale < 35 ? 'warn' : 'dim'}>
              {p.injury
                ? `Injured · ${p.injury.matchesOut}`
                : `${ROLE_SHORT[p.role]} · ${overallRating(p)}${p.morale < 35 ? ' · unhappy' : ''}`}
            </span>
          </button>
        ))}
      </div>
    </Screen>
  )
}
