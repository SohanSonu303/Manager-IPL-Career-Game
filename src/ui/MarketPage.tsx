import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { teamById, teams } from '@/data'
import { nextMegaSeason } from '@/sim/auction'
import type { Career, CareerPlayer } from '@/sim/career'
import { TEAM_IDS } from '@/sim/game'
import {
  agentOf,
  capRoom,
  FREE_AGENT_MAX,
  freeAgents,
  isWindowOpen,
  marketAgents,
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
import { crore, teamShort } from './format'
import { Chip, Screen } from './kit/kit'
import { PlayerRow, PlayerSheet } from './PlayerRow'
import { FilterBar } from './FilterBar'
import { applyFilters, DEFAULT_FILTERS, type PlayerFilters } from './playerFilters'
import { useNextAction } from './useNextAction'

type Tab = 'free' | 'squad' | 'all' | 'trade' | 'log'

const AGENT_TEXT = { Keen: 'keen to sign', Fair: 'fair', Tough: 'hard bargainer' } as const
const AGENT_TONE = { Keen: 'good', Fair: 'plain', Tough: 'warn' } as const

/** Free agents (any time), renewals and trades (the off-season), releases, the transfer log. */
export function MarketPage() {
  const career = useGame((s) => s.career)
  const next = useNextAction()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('free')
  if (!career) return null
  const me = career.manager.teamId
  const squad = squadOf(career.players, me)
  const open = isWindowOpen(career)
  const agents = marketAgents(career)
  return (
    <Screen primary={next}>
      <h1>Market</h1>
      {career.mega ? (
        <button className="mega-banner" onClick={() => navigate('/auction')}>
          <span className="grow2">
            <strong>Mega auction under way</strong>
            <small>Signings, renewals and trades wait until it is over</small>
          </span>
          <span className="mega-go">Open</span>
        </button>
      ) : (
        <div className="market-status">
          <div>
            <Chip tone="good">Free agents</Chip>
            <small>Sign any time</small>
          </div>
          <div>
            <Chip tone={open ? 'good' : 'warn'}>Trade window {open ? 'open' : 'closed'}</Chip>
            <small>{open ? 'Trades and renewals' : 'Off-season only'}</small>
          </div>
          <div>
            <Chip>Mega auction</Chip>
            <small>After the {nextMegaSeason(career.calendar.year)} season</small>
          </div>
        </div>
      )}
      <p className="dim">
        {squad.length}/{SQUAD_MAX} · {squad.filter((p) => p.overseas).length}/{SQUAD_OVERSEAS_MAX}{' '}
        overseas · <span className="money">{crore(capRoom(career.players, me))}</span> room
      </p>
      <div className="tabs" role="tablist">
        {(['free', 'squad', 'all', 'trade', 'log'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? 'active' : ''}
            onClick={() => setTab(t)}
          >
            {
              { free: 'Free agents', squad: 'My squad', all: 'League', trade: 'Trade', log: 'Log' }[
                t
              ]
            }
          </button>
        ))}
      </div>
      {tab === 'free' && (
        <>
          <p className="dim">
            {agents.length} free agent{agents.length === 1 ? '' : 's'} this season (never more than{' '}
            {FREE_AGENT_MAX}). The list is redrawn every season;{' '}
            {freeAgents(career.players).length - agents.length} other unsigned player
            {freeAgents(career.players).length - agents.length === 1 ? ' is' : 's are'} playing
            elsewhere.
          </p>
          <Players career={career} players={agents} mode="sign" />
        </>
      )}
      {tab === 'squad' && <Players career={career} players={squad} mode="mine" />}
      {tab === 'all' && (
        <Players
          career={career}
          players={career.players.filter((p) => p.teamId !== null && p.teamId !== me)}
          mode="browse"
        />
      )}
      {tab === 'trade' && <Trade career={career} open={open} />}
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
  mode: 'sign' | 'mine' | 'browse'
}) {
  const [filters, setFilters] = useState<PlayerFilters>(DEFAULT_FILTERS)
  const [openId, setOpenId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  /** What this player wants from the manager's club, for his preferred length. */
  const demand = (p: CareerPlayer) => requiredSalary(career, p, preferredYears(p.age), TEAM_IDS)
  // Free agents are priced by what they want from you; everyone else by their salary.
  const sorted = applyFilters(players, filters, (p) =>
    mode === 'sign' ? demand(p) : (p.contract?.salary ?? 0),
  )
  const open = career.players.find((p) => p.id === openId)
  return (
    <>
      <FilterBar
        value={filters}
        onChange={setFilters}
        count={sorted.length}
        total={players.length}
        priceLabel={mode === 'sign' ? 'Asking price' : 'Salary'}
      />
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
                    {mode === 'browse' && <strong>{teamShort(p.teamId ?? '')} · </strong>}
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
            mode === 'browse' ? (
              <p className="dim">
                To get him, use the Trade tab (trades run in the off-season: the preseason and after
                the season).
              </p>
            ) : mode !== 'sign' && (open.contract?.years ?? 0) <= 1 && !isWindowOpen(career) ? (
              <>
                <p className="dim">
                  {career.mega
                    ? 'Renewals wait until the mega auction is over.'
                    : 'Contracts can be renewed in the off-season: the preseason or after the season.'}
                </p>
                {!career.mega && (
                  <ReleaseButton p={open} onDone={setMessage} close={() => setOpenId(null)} />
                )}
              </>
            ) : mode === 'sign' || (open.contract?.years ?? 0) <= 1 ? (
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
  const career = useGame((st) => st.career)
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
      <div className="row-between">
        <strong>{renewal ? 'Renew contract' : 'Make an offer'}</strong>
        {career && (
          <Chip tone={AGENT_TONE[agentOf(career, player).label]}>
            Agent: {AGENT_TEXT[agentOf(career, player).label]}
          </Chip>
        )}
      </div>
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

function Trade({ career, open }: { career: Career; open: boolean }) {
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
      {!open && (
        <p className="warn">
          {career.mega
            ? 'Trades wait until the mega auction is over.'
            : 'The trade window is closed. Trades run in the off-season: the preseason and after the season.'}
        </p>
      )}
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
        disabled={!open || !give || !get}
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
