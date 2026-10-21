import { useState } from 'react'
import { teamById, teams } from '@/data'
import type { Career, CareerPlayer } from '@/sim/career'
import { TEAM_IDS } from '@/sim/game'
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
import { overallRating } from '@/sim/player'
import { offerContract, proposeTrade, release, useGame } from '@/state/store'
import { crore } from './format'
import { Chip, Screen } from './kit/kit'
import { PlayerRow, PlayerSheet } from './PlayerRow'
import { FilterChips, FILTERS, type Filter } from './SquadPage'
import { useNextAction } from './useNextAction'

type Tab = 'free' | 'squad' | 'trade' | 'log'

/** Free agents, renewals and releases, trades, and the transfer log. */
export function MarketPage() {
  const career = useGame((s) => s.career)
  const next = useNextAction()
  const [tab, setTab] = useState<Tab>('free')
  if (!career) return null
  const me = career.manager.teamId
  const squad = squadOf(career.players, me)
  const open = isWindowOpen(career)
  return (
    <Screen primary={next}>
      <h1>Market</h1>
      <div className="row-between">
        <Chip tone={open ? 'good' : 'warn'}>{open ? 'Window open' : 'Window closed'}</Chip>
        <span className="dim">
          {squad.length}/{SQUAD_MAX} · {squad.filter((p) => p.overseas).length}/{SQUAD_OVERSEAS_MAX}{' '}
          overseas · <span className="money">{crore(capRoom(career.players, me))}</span>
        </span>
      </div>
      {!open && (
        <p className="dim">Sign, release and trade in the preseason or once the season ends.</p>
      )}
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
      {tab === 'free' && (
        <Players career={career} players={freeAgents(career.players)} mode="sign" />
      )}
      {tab === 'squad' && <Players career={career} players={squad} mode="mine" />}
      {tab === 'trade' && <Trade career={career} />}
      {tab === 'log' && <Log career={career} />}
    </Screen>
  )
}

function Players({
  career,
  players,
  mode,
}: {
  career: Career
  players: CareerPlayer[]
  mode: 'sign' | 'mine'
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const test = FILTERS.find(([f]) => f === filter)?.[2] ?? (() => true)
  const sorted = players.filter(test).sort((a, b) => overallRating(b) - overallRating(a))
  /** What this player wants from the manager's club, for his preferred length. */
  const demand = (p: CareerPlayer) => requiredSalary(career, p, preferredYears(p.age), TEAM_IDS)
  const open = career.players.find((p) => p.id === openId)
  return (
    <>
      <FilterChips value={filter} onChange={setFilter} />
      {message && <p className="good">{message}</p>}
      <ul className="plist">
        {sorted.length === 0 && <li className="dim">Nobody here right now.</li>}
        {sorted.map((p) => (
          <li key={p.id}>
            <PlayerRow
              p={p}
              onClick={() => setOpenId(p.id)}
              extra={
                mode === 'sign' ? (
                  <>
                    Wants <span className="money">{crore(demand(p))}</span>
                  </>
                ) : (
                  <span className={(p.contract?.years ?? 0) <= 1 ? 'warn' : ''}>
                    {crore(p.contract?.salary ?? 0)} · {p.contract?.years} yr left
                  </span>
                )
              }
            />
          </li>
        ))}
      </ul>
      {open && (
        <PlayerSheet
          p={open}
          onClose={() => setOpenId(null)}
          actions={
            mode === 'sign' || (open.contract?.years ?? 0) <= 1 ? (
              <>
                <Negotiation
                  player={open}
                  start={demand(open)}
                  onSigned={(m) => {
                    setMessage(m)
                    setOpenId(null)
                  }}
                />
                {mode === 'mine' && (
                  <ReleaseButton p={open} onDone={setMessage} close={() => setOpenId(null)} />
                )}
              </>
            ) : (
              <ReleaseButton p={open} onDone={setMessage} close={() => setOpenId(null)} />
            )
          }
        />
      )}
    </>
  )
}

function ReleaseButton({
  p,
  onDone,
  close,
}: {
  p: CareerPlayer
  onDone: (m: string) => void
  close: () => void
}) {
  return (
    <button
      className="danger"
      style={{ width: '100%', marginTop: 10 }}
      onClick={() => {
        if (!confirm(`Release ${p.name}?`)) return
        onDone(release(p.id) ?? `${p.name} released.`)
        close()
      }}
    >
      Release
    </button>
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
  const renewal = !!player.teamId
  const submit = (s: number, y: number) => {
    const a = offerContract(player.id, { salary: s, years: y })
    if (a.kind === 'accept') {
      onSigned(
        `${player.name} ${renewal ? 're-signs' : 'signs'} for ${crore(s)} a season, ${y} season${y > 1 ? 's' : ''}.`,
      )
    }
    setAnswer(a)
  }
  return (
    <div className="card" style={{ marginTop: 10 }}>
      <strong>{renewal ? 'Renew contract' : 'Make an offer'}</strong>
      <label className="field">
        Salary per season (lakh) — wants {crore(start)}
        <input
          type="number"
          min={20}
          step={5}
          value={salary}
          onChange={(e) => setSalary(Number(e.target.value))}
        />
      </label>
      <div className="filters">
        {[1, 2, 3].map((y) => (
          <button key={y} className={years === y ? 'on' : ''} onClick={() => setYears(y)}>
            {y} season{y > 1 ? 's' : ''}
          </button>
        ))}
      </div>
      <button className="primary" onClick={() => submit(salary, years)}>
        Offer {crore(salary)} × {years}
      </button>
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
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const label = (p: CareerPlayer) => `${p.name} (${overallRating(p)}, ${p.age})`
  return (
    <div className="card">
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
          setMessage(r.ok ? { ok: true, text: 'Trade agreed!' } : { ok: false, text: r.reason })
          if (r.ok) {
            setGive('')
            setGet('')
          }
        }}
      >
        Propose trade
      </button>
      {message && <p className={message.ok ? 'good' : 'warn'}>{message.text}</p>}
    </div>
  )
}

function Log({ career }: { career: Career }) {
  const name = (id: string) => career.players.find((p) => p.id === id)?.name ?? 'Retired player'
  const entries = [...career.market.log].reverse().slice(0, 40)
  if (!entries.length) return <p className="dim">No moves yet.</p>
  return (
    <ul className="list">
      {entries.map((e, i) => (
        <li key={i}>
          <strong>
            {e.kind[0]?.toUpperCase() + e.kind.slice(1)} · {name(e.playerId)}
          </strong>
          <span className="dim">
            {e.year} · {e.kind === 'released' ? 'by' : 'to'} {teamById.get(e.teamId)?.name}
            {e.salary ? ` · ${crore(e.salary)}` : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}
