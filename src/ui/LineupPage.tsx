import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Career, CareerPlayer } from '@/sim/career'
import { managerSheet, userFixtureToday } from '@/sim/game'
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
import { teamName } from './format'
import { teamById } from '@/data'
import { Avatar } from './identity/Avatar'
import { ringStatus } from './identity/avatarSpec'
import { Icon, type IconName } from './kit/Icon'
import { Chip, Screen } from './kit/kit'
import { INTENT_LABEL } from './match/MatchView'
import { PlayerSheet } from './PlayerRow'
import { StreakChip } from './StreakChip'

/** The icon for what a player does: bat, keep, bowl, or both. */
export function roleIcon(p: Pick<CareerPlayer, 'role'>, keeper = false): IconName {
  if (keeper || p.role === 'wicketkeeper') return 'gloves'
  if (p.role === 'bowler') return 'ball'
  if (p.role === 'allrounder') return 'allround'
  return 'bat'
}

/**
 * One team-sheet line: number, photo and name with (C)/(WK), a STATS button and the role
 * icon. `n` null is a bench line. Tapping the player picks him for a swap.
 */
export function SheetRow({
  p,
  n,
  captain,
  keeper,
  selected,
  onTap,
  onStats,
}: {
  p: CareerPlayer
  n: number | null
  captain?: boolean
  keeper?: boolean
  selected?: boolean
  onTap?: () => void
  onStats?: () => void
}) {
  const team = p.teamId ? teamById.get(p.teamId) : undefined
  const body = (
    <>
      <Avatar
        seed={p.id}
        nationality={p.nationality}
        age={p.age}
        kit={team?.colors ?? { primary: '#5b6070', secondary: '#c9ccd6' }}
        size={44}
        ring={ringStatus(p.fitness)}
        title={p.name}
      />
      <span className="ts-text">
        <strong>
          {p.name.toUpperCase()}
          {captain && <em> (C)</em>}
          {keeper && <em> (WK)</em>}
        </strong>
        <small>
          {overallRating(p)} OVR · form {Math.round(p.form)}
          {p.overseas && ' · overseas'}
          {p.injury && <span className="bad"> · injured {p.injury.matchesOut}</span>}
          <StreakChip p={p} />
        </small>
      </span>
    </>
  )
  return (
    <li
      className={`ts-row ${n === null ? 'bench' : ''} ${p.injury ? 'out' : ''} ${selected ? 'sel' : ''}`}
    >
      <span className="ts-n">{n ?? '–'}</span>
      {onTap ? (
        <button
          className="ts-name"
          onClick={onTap}
          aria-pressed={selected}
          aria-label={`${p.name}: tap to swap`}
        >
          {body}
        </button>
      ) : (
        <span className="ts-name">{body}</span>
      )}
      {onStats && (
        <button className="ts-stats" onClick={onStats} aria-label={`Stats: ${p.name}`}>
          STATS
        </button>
      )}
      <span className="ts-icon" aria-label={p.role}>
        <Icon name={roleIcon(p, keeper)} size={22} />
      </span>
    </li>
  )
}

/** The batting order as a team sheet (read-only), e.g. on the match-day screen. */
export function TeamSheetRows({
  sheet,
  players,
  onOpen,
}: {
  sheet: TeamSheet
  players: Map<string, CareerPlayer>
  onOpen?: (id: string) => void
}) {
  return (
    <ol className="team-sheet">
      {sheet.battingOrder.map((id, i) => {
        const p = players.get(id)
        return (
          p && (
            <SheetRow
              key={id}
              p={p}
              n={i + 1}
              captain={id === sheet.captainId}
              keeper={id === sheet.keeperId}
              onStats={onOpen && (() => onOpen(id))}
            />
          )
        )
      })}
    </ol>
  )
}

/** Pick XI: the playing XI as a numbered team sheet, the bench below; tap anyone for stats. */
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
  const [params] = useSearchParams()
  const [openId, setOpenId] = useState<string | null>(params.get('open'))
  const [picked, setPicked] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const byId = new Map(squad.map((p) => [p.id, p]))
  const order = sheet.battingOrder
  const xi = order.map((id) => byId.get(id)).filter((p): p is CareerPlayer => !!p)
  const bench = squad
    .filter((p) => !order.includes(p.id))
    .sort((a, b) => Number(!!a.injury) - Number(!!b.injury) || overallRating(b) - overallRating(a))
  const errors = validateSheet(sheet, squad)
  const overseas = xi.filter((p) => p.overseas).length
  const bowlers = xi.filter((p) => p.role === 'bowler' || p.role === 'allrounder').length
  const fixture = userFixtureToday(career)
  const opp = fixture && (fixture.homeId === me ? fixture.awayId : fixture.homeId)
  const open = openId ? byId.get(openId) : undefined
  const inXi = !!openId && order.includes(openId)

  const setOrder = (battingOrder: string[]) => setSheet((s) => ({ ...s, battingOrder }))
  /** Bring a bench player in for someone in the XI (he takes over the gloves/captaincy). */
  const swapIn = (benchId: string, outId: string) => {
    setSheet((s) => ({
      ...s,
      battingOrder: s.battingOrder.map((x) => (x === outId ? benchId : x)),
      keeperId: s.keeperId === outId ? benchId : s.keeperId,
      captainId: s.captainId === outId ? benchId : s.captainId,
    }))
    setOpenId(null)
  }
  /** Tap one player, then another: two in the XI swap batting places; XI and bench swap in. */
  const tap = (id: string) => {
    setNote(null)
    if (!picked || picked === id) return setPicked(picked === id ? null : id)
    const a = picked
    setPicked(null)
    const aIn = order.includes(a)
    const bIn = order.includes(id)
    if (aIn && bIn) {
      setOrder(order.map((x) => (x === a ? id : x === id ? a : x)))
    } else if (aIn !== bIn) {
      const benchId = aIn ? id : a
      const bench = byId.get(benchId)
      if (bench && !isAvailable(bench)) return setNote(`${bench.name} is injured.`)
      swapIn(benchId, aIn ? a : id)
    } else setPicked(id)
  }
  /** Tap an empty slot with a bench player picked: he joins the XI. */
  const fillSlot = () => {
    const p = picked ? byId.get(picked) : undefined
    if (!p || order.includes(p.id)) return
    if (!isAvailable(p)) return setNote(`${p.name} is injured.`)
    setOrder([...order, p.id])
    setPicked(null)
  }
  const pickedName = picked ? byId.get(picked)?.name : undefined

  return (
    <Screen
      primary={{
        label: 'Save XI',
        disabled: errors.length > 0,
        onClick: () => {
          setLineup({
            battingOrder: sheet.battingOrder,
            keeperId: sheet.keeperId,
            captainId: sheet.captainId,
            aggression: sheet.aggression,
          })
          navigate(-1)
        },
      }}
    >
      <div className="ts-head">
        <span className="eyebrow">{opp ? `Against ${teamName(opp)}` : 'Your team sheet'}</span>
        <h1>Playing XI</h1>
        <div className="prow-meta">
          <Chip tone={xi.length === XI_SIZE ? 'good' : 'warn'}>
            {xi.length}/{XI_SIZE}
          </Chip>
          <Chip tone={overseas <= MAX_OVERSEAS_IN_XI ? 'good' : 'bad'}>
            {overseas}/{MAX_OVERSEAS_IN_XI} overseas
          </Chip>
          <Chip tone={bowlers >= MIN_BOWLING_OPTIONS ? 'good' : 'warn'}>
            {bowlers} bowling options
          </Chip>
          <button className="ts-auto" onClick={() => setSheet(autoTeamSheet(me, squad, false))}>
            Auto-pick
          </button>
        </div>
      </div>

      <p className={`ts-hint ${picked ? 'on' : ''}`} aria-live="polite">
        {pickedName
          ? `${pickedName} picked: tap another player to swap them.`
          : 'Tap a player, then another, to swap them (XI or bench).'}
      </p>
      {note && <p className="warn">{note}</p>}
      <ol className="team-sheet" aria-label="Playing XI in batting order">
        {xi.map((p, i) => (
          <SheetRow
            key={p.id}
            p={p}
            n={i + 1}
            captain={p.id === sheet.captainId}
            keeper={p.id === sheet.keeperId}
            selected={picked === p.id}
            onTap={() => tap(p.id)}
            onStats={() => setOpenId(p.id)}
          />
        ))}
        {Array.from({ length: Math.max(0, XI_SIZE - xi.length) }, (_, i) => (
          <li key={`empty-${i}`} className="ts-row empty">
            <span className="ts-n">{xi.length + i + 1}</span>
            <button className="ts-name" onClick={fillSlot}>
              <small>Empty: pick a bench player, then tap here</small>
            </button>
          </li>
        ))}
      </ol>

      {errors.map((e) => (
        <p key={e} className="warn">
          {e}
        </p>
      ))}

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

      <h2 className="section">Bench · {bench.length}</h2>
      <ol className="team-sheet bench" aria-label="Bench">
        {bench.map((p) => (
          <SheetRow
            key={p.id}
            p={p}
            n={null}
            selected={picked === p.id}
            onTap={() => tap(p.id)}
            onStats={() => setOpenId(p.id)}
          />
        ))}
      </ol>

      {open && (
        <PlayerSheet
          p={open}
          onClose={() => setOpenId(null)}
          actions={
            inXi ? (
              <div className="ts-actions">
                <button
                  className={sheet.captainId === open.id ? 'on' : ''}
                  onClick={() => setSheet((s) => ({ ...s, captainId: open.id }))}
                >
                  {sheet.captainId === open.id ? 'Captain ✓' : 'Make captain'}
                </button>
                <button
                  className={sheet.keeperId === open.id ? 'on' : ''}
                  onClick={() => setSheet((s) => ({ ...s, keeperId: open.id }))}
                >
                  <Icon name="gloves" size={16} />{' '}
                  {sheet.keeperId === open.id ? 'Keeper ✓' : 'Make keeper'}
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    setOrder(order.filter((x) => x !== open.id))
                    setOpenId(null)
                  }}
                >
                  Drop to bench
                </button>
              </div>
            ) : !isAvailable(open) ? (
              <p className="warn">Injured: he can't be picked.</p>
            ) : (
              <div className="card">
                <strong>Bring him in for…</strong>
                {xi.length < XI_SIZE && (
                  <button
                    className="primary"
                    onClick={() => {
                      setOrder([...order, open.id])
                      setOpenId(null)
                    }}
                  >
                    Add to the XI (no. {xi.length + 1})
                  </button>
                )}
                <div className="ts-swap">
                  {xi.map((q, i) => (
                    <button key={q.id} onClick={() => swapIn(open.id, q.id)}>
                      {i + 1}. {q.name.split(' ').slice(-1)[0]}
                      <Icon name={roleIcon(q, q.id === sheet.keeperId)} size={14} />
                    </button>
                  ))}
                </div>
              </div>
            )
          }
        />
      )}
    </Screen>
  )
}
