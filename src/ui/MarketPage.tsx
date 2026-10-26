import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { teamById } from '@/data'
import { nextMegaSeason } from '@/sim/auction'
import type { Career, CareerPlayer } from '@/sim/career'
import { TEAM_IDS } from '@/sim/game'
import {
  askingPrice,
  capRoom,
  FREE_AGENT_MAX,
  freeAgents,
  isWindowOpen,
  marketAgents,
  offerBlocker,
  preferredYears,
  SQUAD_MAX,
  SQUAD_OVERSEAS_MAX,
  squadOf,
} from '@/sim/market'
import { transferNeeds, type NeedCard, type Target } from '@/sim/transfers'
import { offerContract, useGame } from '@/state/store'
import { bidPrice, crore, teamShort } from './format'
import { Chip, Screen } from './kit/kit'
import { ContractsPanel } from './ContractsPage'
import { FilterBar } from './FilterBar'
import { Negotiation } from './Negotiation'
import { PlayerRow, PlayerSheet } from './PlayerRow'
import { applyFilters, DEFAULT_FILTERS, type PlayerFilters } from './playerFilters'
import { TradeBuilder } from './TradeBuilder'
import { useNextAction } from './useNextAction'

type Tab = 'needs' | 'contracts' | 'trade' | 'log'
const TABS: Record<Tab, string> = {
  needs: 'Needs',
  contracts: 'Contracts',
  trade: 'Trade',
  log: 'Log',
}

/**
 * The transfer hub: what the squad needs (and who fits), contracts, trades, the log.
 * `?tab=` picks the tab; `get`/`give` start a trade with those players.
 */
export function MarketPage() {
  const career = useGame((s) => s.career)
  const next = useNextAction()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab | null) ?? 'needs'
  const setTab = (t: Tab, extra: Record<string, string> = {}) =>
    setParams({ tab: t, ...extra }, { replace: true })
  if (!career) return null
  const me = career.manager.teamId
  const squad = squadOf(career.players, me)
  const open = isWindowOpen(career)
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
            <Chip tone={open ? 'good' : 'warn'}>Trades {open ? 'open' : 'shut'}</Chip>
            <small>Preseason and after the season</small>
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
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? 'active' : ''}
            onClick={() => setTab(t)}
          >
            {TABS[t]}
          </button>
        ))}
      </div>
      {tab === 'needs' && <Needs career={career} onTrade={(id) => setTab('trade', { get: id })} />}
      {tab === 'contracts' && <ContractsPanel career={career} />}
      {tab === 'trade' && (
        <TradeBuilder
          key={`${params.get('get')}-${params.get('give')}`}
          career={career}
          initialGet={params.get('get') ?? undefined}
          initialGive={params.get('give') ?? undefined}
        />
      )}
      {tab === 'log' && <Log career={career} />}
    </Screen>
  )
}

type View = 'suggested' | 'free' | 'league'

/** Needs: the squad's gaps with the best options, or every free agent / league player. */
function Needs({ career, onTrade }: { career: Career; onTrade: (playerId: string) => void }) {
  const [view, setView] = useState<View>('suggested')
  const [openId, setOpenId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const me = career.manager.teamId
  const agents = marketAgents(career)
  const open = career.players.find((p) => p.id === openId)
  const signed = (m: string) => {
    setMessage(m)
    setOpenId(null)
  }
  const signAtAsk = (t: Target) => {
    if (!confirm(`Sign ${t.p.name} for ${bidPrice(t.price)} a season, ${t.years} seasons?`)) return
    const a = offerContract(t.p.id, { salary: t.price, years: t.years })
    setMessage(
      a.kind === 'accept'
        ? `${t.p.name} signs for ${bidPrice(t.price)} a season.`
        : a.kind === 'reject'
          ? a.message
          : `${t.p.name} wants more: open his card to negotiate.`,
    )
  }
  return (
    <>
      <div className="filters" role="radiogroup" aria-label="Show">
        {(
          [
            ['suggested', 'For your needs'],
            ['free', `Free agents (${agents.length})`],
            ['league', 'Other clubs'],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            role="radio"
            aria-checked={view === v}
            className={view === v ? 'on' : ''}
            onClick={() => setView(v)}
          >
            {label}
          </button>
        ))}
      </div>
      {message && <p className="good">{message}</p>}
      {view === 'suggested' && (
        <NeedCards career={career} onOpen={setOpenId} onSign={signAtAsk} onTrade={onTrade} />
      )}
      {view === 'free' && (
        <>
          <p className="dim">
            Up to {FREE_AGENT_MAX} free agents each season (the list is redrawn every year);{' '}
            {freeAgents(career.players).length - agents.length} other unsigned players are playing
            elsewhere.
          </p>
          <Players career={career} players={agents} mode="sign" onOpen={setOpenId} />
        </>
      )}
      {view === 'league' && (
        <Players
          career={career}
          players={career.players.filter((p) => p.teamId !== null && p.teamId !== me)}
          mode="browse"
          onOpen={setOpenId}
        />
      )}
      {open && (
        <PlayerSheet
          p={open}
          onClose={() => setOpenId(null)}
          actions={
            open.teamId === null ? (
              <Negotiation player={open} onSigned={signed} />
            ) : open.teamId !== me ? (
              <button
                className="primary"
                style={{ width: '100%' }}
                onClick={() => onTrade(open.id)}
              >
                Trade for him
              </button>
            ) : null
          }
        />
      )}
    </>
  )
}

function NeedCards({
  career,
  onOpen,
  onSign,
  onTrade,
}: {
  career: Career
  onOpen: (id: string) => void
  onSign: (t: Target) => void
  onTrade: (id: string) => void
}) {
  const needs: NeedCard[] = transferNeeds(career, TEAM_IDS)
  if (!needs.length)
    return (
      <div className="card">
        <strong>Your squad covers every role</strong>
        <span className="dim">Browse the free agents or other clubs for an upgrade.</span>
      </div>
    )
  return (
    <>
      {needs.map((n) => (
        <section key={n.role} className="card need-card">
          <div className="row-between">
            <strong>{n.title}</strong>
            <small className="dim">{n.why}</small>
          </div>
          {n.options.length === 0 && (
            <span className="dim">Nobody better on the market right now.</span>
          )}
          {(() => {
            const t = n.options.find((o) => o.kind === 'free')
            const why = t && offerBlocker(career, t.p.id, { salary: t.price, years: t.years })
            return why ? <span className="warn">{why} Release or trade someone first.</span> : null
          })()}
          <ul className="plist">
            {n.options.map((t) => {
              const blocked =
                t.kind === 'free' &&
                offerBlocker(career, t.p.id, { salary: t.price, years: t.years })
              return (
                <li key={t.p.id}>
                  <PlayerRow
                    p={t.p}
                    as="div"
                    onClick={() => onOpen(t.p.id)}
                    extra={
                      t.kind === 'free' ? (
                        <>
                          <Chip tone="good">Free agent</Chip> asks{' '}
                          <span className="money">{bidPrice(t.price)}</span>
                        </>
                      ) : (
                        <>
                          <Chip>{teamShort(t.p.teamId ?? '')}</Chip> trade value {t.price}
                        </>
                      )
                    }
                    side={
                      <button
                        className={`need-go ${t.kind === 'free' ? 'primary' : ''}`}
                        disabled={!!blocked}
                        title={blocked || undefined}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (t.kind === 'free') onSign(t)
                          else onTrade(t.p.id)
                        }}
                      >
                        {t.kind === 'free' ? `Sign ${bidPrice(t.price)}` : 'Trade'}
                      </button>
                    }
                  />
                </li>
              )
            })}
          </ul>
        </section>
      ))}
      <p className="dim">
        "Sign" pays what he asks, and he signs on the spot. Open a player to negotiate a lower
        price.
      </p>
    </>
  )
}

function Players({
  career,
  players,
  mode,
  onOpen,
}: {
  career: Career
  players: CareerPlayer[]
  mode: 'sign' | 'browse'
  onOpen: (id: string) => void
}) {
  const [filters, setFilters] = useState<PlayerFilters>(DEFAULT_FILTERS)
  /** What this player asks of the manager's club, for his preferred length. */
  const ask = (p: CareerPlayer) => askingPrice(career, p, preferredYears(p.age), TEAM_IDS)
  // Free agents are priced by what they ask of you; everyone else by their salary.
  const sorted = applyFilters(players, filters, (p) =>
    mode === 'sign' ? ask(p) : (p.contract?.salary ?? 0),
  )
  return (
    <>
      <FilterBar
        value={filters}
        onChange={setFilters}
        count={sorted.length}
        total={players.length}
        priceLabel={mode === 'sign' ? 'Asking price' : 'Salary'}
      />
      <ul className="plist">
        {sorted.length === 0 && <li className="dim">Nobody here right now.</li>}
        {sorted.map((p) => (
          <li key={p.id}>
            <PlayerRow
              p={p}
              onClick={() => onOpen(p.id)}
              extra={
                mode === 'sign' ? (
                  <>
                    Asks <span className="money">{bidPrice(ask(p))}</span>
                  </>
                ) : (
                  <span>
                    <strong>{teamShort(p.teamId ?? '')} · </strong>
                    {crore(p.contract?.salary ?? 0)} · {p.contract?.years} yr left
                  </span>
                )
              }
            />
          </li>
        ))}
      </ul>
    </>
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
