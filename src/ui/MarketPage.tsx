import { useState } from 'react'
import { teamById, teams } from '@/data'
import type { Career, CareerPlayer } from '@/sim/career'
import {
  capRoom,
  freeAgents,
  isWindowOpen,
  preferredYears,
  requiredSalary,
  SQUAD_MAX,
  SQUAD_OVERSEAS_MAX,
  squadOf,
  tradeValue,
  type OfferAnswer,
} from '@/sim/market'
import { TEAM_IDS } from '@/sim/game'
import { overallRating } from '@/sim/player'
import { offerContract, proposeTrade, release, useGame } from '@/state/store'
import { crore } from './Home'
import { roleLabel } from './SquadList'

type Tab = 'free' | 'squad' | 'trade' | 'log'

/** Free agents, renewals and releases, trades, and the transfer log. */
export function MarketPage() {
  const career = useGame((s) => s.career)
  const [tab, setTab] = useState<Tab>('free')
  if (!career) return <p className="dim">Start a career first.</p>
  const me = career.manager.teamId
  const squad = squadOf(career.players, me)
  const open = isWindowOpen(career)

  return (
    <>
      <h1>Market</h1>
      <p className={open ? 'good' : 'warn'}>
        {open ? 'The market is open.' : 'The market is closed until the season ends.'}
      </p>
      <div className="dim">
        Cap room <span className="money">{crore(capRoom(career.players, me))}</span> ·{' '}
        {squad.length}/{SQUAD_MAX} players · {squad.filter((p) => p.overseas).length}/
        {SQUAD_OVERSEAS_MAX} overseas
      </div>
      <div className="tabs" role="tablist">
        {(['free', 'squad', 'trade', 'log'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? 'active' : ''}
            onClick={() => setTab(t)}
          >
            {{ free: 'Free agents', squad: 'My squad', trade: 'Trade', log: 'Log' }[t]}
          </button>
        ))}
      </div>
      {tab === 'free' && <PlayerTable players={freeAgents(career.players)} mode="sign" />}
      {tab === 'squad' && <PlayerTable players={squad} mode="mine" />}
      {tab === 'trade' && <Trade career={career} />}
      {tab === 'log' && <Log career={career} />}
    </>
  )
}

function PlayerTable({ players, mode }: { players: CareerPlayer[]; mode: 'sign' | 'mine' }) {
  const career = useGame((s) => s.career) as Career
  /** What this player wants from the manager's club, for his preferred length. */
  const demand = (p: CareerPlayer) => requiredSalary(career, p, preferredYears(p.age), TEAM_IDS)
  const [openId, setOpenId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const sorted = [...players].sort((a, b) => overallRating(b) - overallRating(a))
  return (
    <ul className="market-list">
      {message && <li className="good">{message}</li>}
      {!sorted.length && <li className="dim">Nobody here right now.</li>}
      {sorted.map((p) => {
        const expiring = (p.contract?.years ?? 0) <= 1
        return (
          <li key={p.id}>
            <div className="row-between">
              <div>
                <div className="squad-name">{p.name}</div>
                <div className="squad-meta">
                  {roleLabel(p)} · {p.age} {p.overseas && <span className="chip">Overseas</span>}
                  {p.injury && <span className="chip bad">Injured</span>}
                </div>
                <div className="squad-meta">
                  {mode === 'sign'
                    ? `Wants ${crore(demand(p))} from you`
                    : `${crore(p.contract?.salary ?? 0)} · ${p.contract?.years} season${p.contract?.years === 1 ? '' : 's'} left`}
                </div>
              </div>
              <div className="squad-ovr">{overallRating(p)}</div>
            </div>
            <div className="button-row">
              {(mode === 'sign' || expiring) && (
                <button onClick={() => setOpenId(openId === p.id ? null : p.id)}>
                  {mode === 'sign' ? 'Negotiate' : 'Renew'}
                </button>
              )}
              {mode === 'mine' && (
                <button
                  className="danger"
                  onClick={() => {
                    if (confirm(`Release ${p.name}?`))
                      setMessage(release(p.id) ?? `${p.name} released.`)
                  }}
                >
                  Release
                </button>
              )}
            </div>
            {openId === p.id && (
              <Negotiation player={p} start={demand(p)} onSigned={(m) => setMessage(m)} />
            )}
          </li>
        )
      })}
    </ul>
  )
}

function Negotiation({
  player,
  start,
  onSigned,
}: {
  player: CareerPlayer
  start: number
  onSigned: (message: string) => void
}) {
  const [salary, setSalary] = useState(start)
  const [years, setYears] = useState(preferredYears(player.age))
  const [answer, setAnswer] = useState<OfferAnswer | null>(null)
  const submit = (s: number, y: number) => {
    const a = offerContract(player.id, { salary: s, years: y })
    // On success the row leaves the list, so the confirmation is shown above it.
    if (a.kind === 'accept') {
      onSigned(`${player.name} signs for ${crore(s)} a season, ${y} season${y > 1 ? 's' : ''}.`)
    }
    setAnswer(a)
  }
  return (
    <div className="negotiate">
      <label className="field">
        Salary per season (lakh)
        <input
          type="number"
          min={20}
          step={5}
          value={salary}
          onChange={(e) => setSalary(Number(e.target.value))}
        />
      </label>
      <label className="field">
        Seasons
        <select value={years} onChange={(e) => setYears(Number(e.target.value))}>
          {[1, 2, 3].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      <button className="primary" onClick={() => submit(salary, years)}>
        Offer {crore(salary)} for {years} season{years > 1 ? 's' : ''}
      </button>
      {answer?.kind === 'accept' && <p className="good">{player.name} signs!</p>}
      {answer?.kind === 'reject' && <p className="warn">{answer.message}</p>}
      {answer?.kind === 'counter' && (
        <>
          <p>
            {answer.message} He asks {crore(answer.salary)} for {answer.years} season
            {answer.years > 1 ? 's' : ''}.
          </p>
          <button
            onClick={() => {
              setSalary(answer.salary)
              setYears(answer.years)
              submit(answer.salary, answer.years)
            }}
          >
            Accept his terms
          </button>
        </>
      )}
    </div>
  )
}

function Trade({ career }: { career: Career }) {
  const me = career.manager.teamId
  const mine = squadOf(career.players, me).sort((a, b) => tradeValue(b) - tradeValue(a))
  const others = teams.filter((t) => t.id !== me)
  const [club, setClub] = useState(others[0]?.id ?? '')
  const theirs = squadOf(career.players, club).sort((a, b) => tradeValue(b) - tradeValue(a))
  const [give, setGive] = useState(mine[0]?.id ?? '')
  const [get, setGet] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const label = (p: CareerPlayer) => `${p.name} (${overallRating(p)}, ${p.age})`
  return (
    <div className="trade">
      <label className="field">
        You give
        <select value={give} onChange={(e) => setGive(e.target.value)}>
          {mine.map((p) => (
            <option key={p.id} value={p.id}>
              {label(p)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Club
        <select
          value={club}
          onChange={(e) => {
            setClub(e.target.value)
            setGet('')
          }}
        >
          {others.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        You get
        <select value={get} onChange={(e) => setGet(e.target.value)}>
          <option value="">Choose a player</option>
          {theirs.map((p) => (
            <option key={p.id} value={p.id}>
              {label(p)}
            </option>
          ))}
        </select>
      </label>
      <button
        className="primary"
        disabled={!give || !get}
        onClick={() => {
          const r = proposeTrade([give], [get])
          setMessage(r.ok ? 'Trade agreed!' : r.reason)
          if (r.ok) {
            setGive('')
            setGet('')
          }
        }}
      >
        Propose trade
      </button>
      {message && <p className={message === 'Trade agreed!' ? 'good' : 'warn'}>{message}</p>}
    </div>
  )
}

function Log({ career }: { career: Career }) {
  const name = (id: string) => career.players.find((p) => p.id === id)?.name ?? 'Retired player'
  const entries = [...career.market.log].reverse().slice(0, 40)
  if (!entries.length) return <p className="dim">No moves yet.</p>
  return (
    <ul className="fixtures">
      {entries.map((e, i) => (
        <li key={i}>
          <strong>
            {e.year} · {e.kind[0]?.toUpperCase() + e.kind.slice(1)} {name(e.playerId)}
          </strong>
          <span className="dim">
            {e.kind === 'released' ? 'by' : 'to'} {teamById.get(e.teamId)?.name}
            {e.salary ? ` · ${crore(e.salary)}` : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}
