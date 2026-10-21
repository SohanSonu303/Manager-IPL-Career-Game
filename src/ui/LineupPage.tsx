import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { teamById } from '@/data'
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
import { TRAIT_LABEL } from './format'
import { Avatar } from './identity/Avatar'
import { ringStatus } from './identity/avatarSpec'
import { Icon } from './kit/Icon'
import { Chip, RatingRing, Screen } from './kit/kit'
import { INTENT_LABEL } from './match/MatchView'

const ROLE_SHORT = { batter: 'BAT', wicketkeeper: 'WK', allrounder: 'AR', bowler: 'BWL' } as const

/** Pick XI: a compact team sheet. Tap a player, then tap another to swap. */
export function LineupPage() {
  const career = useGame((s) => s.career)
  if (!career) return null
  return <LineupEditor career={career} />
}

function SheetRow({
  p,
  n,
  keeper,
  selected,
  bench,
  onTap,
}: {
  p: CareerPlayer
  n?: number
  keeper?: boolean
  selected: boolean
  bench?: boolean
  onTap: () => void
}) {
  const team = p.teamId ? teamById.get(p.teamId) : undefined
  const out = !isAvailable(p)
  return (
    <button
      className={`xi-row ${selected ? 'sel' : ''} ${bench ? 'bench' : ''}`}
      onClick={onTap}
      disabled={out && bench}
    >
      <span className="xi-num">{n ?? '+'}</span>
      <Avatar
        seed={p.id}
        nationality={p.nationality}
        age={p.age}
        kit={team?.colors ?? { primary: '#555', secondary: '#ccc' }}
        size={40}
        ring={ringStatus(p.fitness)}
      />
      <span className="xi-main">
        <strong>{p.name}</strong>
        <span className="xi-tags">
          <span className="role-tag">{ROLE_SHORT[p.role]}</span>
          {p.bowlingType && p.role !== 'batter' && p.role !== 'wicketkeeper' && (
            <span className="dim">{p.bowlingType === 'pace' ? 'Pace' : 'Spin'}</span>
          )}
          {keeper && <Chip tone="blue">Keeper</Chip>}
          {p.overseas && <Chip>OS</Chip>}
          {out && <Chip tone="bad">Injured</Chip>}
          {!out && p.traits[0] && <span className="dim">{TRAIT_LABEL[p.traits[0]]}</span>}
        </span>
      </span>
      <RatingRing value={overallRating(p)} size={38} />
    </button>
  )
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

  const tapXi = (id: string) => {
    if (sel && sel !== id && order.includes(sel)) {
      // Swap two batting positions.
      const o = [...order]
      const i = o.indexOf(sel)
      const j = o.indexOf(id)
      ;[o[i], o[j]] = [o[j] as string, o[i] as string]
      setOrder(o)
      setSel(null)
    } else if (sel && !order.includes(sel)) {
      // Bring the selected bench player in for this one.
      setOrder(order.map((x) => (x === id ? sel : x)))
      if (sheet.keeperId === id) setSheet((s) => ({ ...s, keeperId: sel }))
      setSel(null)
    } else setSel(sel === id ? null : id)
  }
  const tapBench = (id: string) => {
    if (sel && order.includes(sel)) {
      setOrder(order.map((x) => (x === sel ? id : x)))
      setSel(null)
    } else if (order.length < XI_SIZE) setOrder([...order, id])
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
  const selInXi = !!sel && order.includes(sel)

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
        <h1>Pick XI</h1>
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

      <div className="xi-card">
        <div className="row-between xi-head">
          <strong>Playing XI</strong>
          <span className="dim">
            {sel ? 'Tap another player to swap' : 'Tap a player to move or swap'}
          </span>
        </div>
        {selInXi && (
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
        )}
        {xi.map((p, i) => (
          <SheetRow
            key={p.id}
            p={p}
            n={i + 1}
            keeper={sheet.keeperId === p.id}
            selected={sel === p.id}
            onTap={() => tapXi(p.id)}
          />
        ))}
      </div>

      <h2 className="section">Bench</h2>
      <div className="xi-card">
        {bench.map((p) => (
          <SheetRow key={p.id} p={p} bench selected={sel === p.id} onTap={() => tapBench(p.id)} />
        ))}
      </div>
    </Screen>
  )
}
