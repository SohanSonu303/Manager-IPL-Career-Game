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
  isProspect,
  isWindowOpen,
  marketAgents,
  offerBlocker,
  preferredYears,
  releaseBlocker,
  SQUAD_MAX,
  SQUAD_OVERSEAS_MAX,
  squadOf,
} from '@/sim/market'
import { contractOutlook } from '@/sim/contracts'
import { transferNeeds, type NeedCard, type Target } from '@/sim/transfers'
import { listPlayer, offerContract, release, useGame } from '@/state/store'
import { bidPrice, crore, teamShort } from './format'
import { fundsOf } from '@/sim/finance'
import { Assistant } from './identity/Assistant'
import { Icon, type IconName } from './kit/Icon'
import { Chip, HubButton, Screen } from './kit/kit'
import { RenewalPlanSheet } from './PAPlan'
import { ContractsPanel, OwnPlayerActions } from './ContractsPage'
import { FilterBar } from './FilterBar'
import { Negotiation } from './Negotiation'
import { PlayerRow, PlayerSheet } from './PlayerRow'
import { applyFilters, DEFAULT_FILTERS, type PlayerFilters } from './playerFilters'
import { TradeBuilder } from './TradeBuilder'
import { useNextAction } from './useNextAction'

type Tab = 'needs' | 'free' | 'squad' | 'contracts' | 'trade' | 'log'
const TABS: Record<Tab, string> = {
  needs: 'Needs',
  free: 'Free agents',
  squad: 'My squad',
  contracts: 'Contracts',
  trade: 'Trade',
  log: 'Log',
}

/** The six rooms around the PA; angles in degrees, 0 = right, clockwise. */
const RING: { tab: Tab; icon: IconName; angle: number }[] = [
  { tab: 'needs', icon: 'search', angle: -90 },
  { tab: 'free', icon: 'star', angle: -30 },
  { tab: 'squad', icon: 'squad', angle: 30 },
  { tab: 'contracts', icon: 'contract', angle: 90 },
  { tab: 'trade', icon: 'trade', angle: 150 },
  { tab: 'log', icon: 'log', angle: 210 },
]

/**
 * The transfer hub. Without `?tab=` it is the PA's room: the sections on a circle around
 * her and her advice below. `?tab=` opens a section; `get`/`give` start a trade with
 * those players, `view=free` opens the free agents.
 */
export function MarketPage() {
  const career = useGame((s) => s.career)
  const next = useNextAction()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') as Tab | null
  const setTab = (t: Tab | null, extra: Record<string, string> = {}) =>
    setParams(t ? { tab: t, ...extra } : {}, { replace: true })
  if (!career) return null
  const me = career.manager.teamId
  const squad = squadOf(career.players, me)
  const open = isWindowOpen(career)
  return (
    <Screen primary={next}>
      {tab ? (
        <div className="row-between market-head">
          <h1>{TABS[tab]}</h1>
          <button className="pa-back" onClick={() => setTab(null)}>
            <Icon name="back" size={16} /> PA
          </button>
        </div>
      ) : (
        <h1>Market</h1>
      )}
      {career.mega ? (
        <button className="mega-banner" onClick={() => navigate('/auction')}>
          <span className="grow2">
            <strong>Mega auction under way</strong>
            <small>Signings, renewals and trades wait until it is over</small>
          </span>
          <span className="mega-go">Open</span>
        </button>
      ) : (
        !tab && (
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
        )
      )}
      {!tab && <PAHub career={career} onTab={setTab} />}
      {tab && (
        <>
          <p className="dim">
            {squad.length}/{SQUAD_MAX} · {squad.filter((p) => p.overseas).length}/
            {SQUAD_OVERSEAS_MAX} overseas ·{' '}
            <span className="money">{crore(capRoom(career.players, me))}</span> room
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
        </>
      )}
      {(tab === 'needs' || tab === 'free') && (
        <Needs
          key={tab}
          career={career}
          initialView={tab === 'free' ? 'free' : 'suggested'}
          onTrade={(id) => setTab('trade', { get: id })}
        />
      )}
      {tab === 'squad' && (
        <MySquad career={career} onTrade={(id) => setTab('trade', { give: id })} />
      )}
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

/** The PA in the middle of the market's sections, and her advice underneath. */
function PAHub({
  career,
  onTab,
}: {
  career: Career
  onTab: (t: Tab, extra?: Record<string, string>) => void
}) {
  const navigate = useNavigate()
  const [planOpen, setPlanOpen] = useState(false)
  const me = career.manager.teamId
  const team = teamById.get(me)
  const squad = squadOf(career.players, me)
  const outlook = contractOutlook(career, TEAM_IDS)
  const undecided = career.mega || outlook.megaYear ? [] : outlook.undecided
  const needs = career.mega
    ? []
    : transferNeeds(career, TEAM_IDS).filter((n) => n.role !== 'upgrade')
  const agents = marketAgents(career)
  const young = agents.filter(isProspect).sort((a, b) => b.potential - a.potential)
  const offers = career.news.filter(
    (n) => n.offer?.status === 'pending' && n.teamIds.includes(me),
  ).length
  const open = isWindowOpen(career)
  const badge: Partial<Record<Tab, boolean>> = {
    needs: needs.length > 0,
    contracts: undecided.length > 0,
    trade: offers > 0,
  }
  return (
    <>
      <div className="hub pa-hub">
        <div className="hub-ring" />
        <div className="hub-ring inner" />
        <div className="hub-center pa-center">
          <Assistant kit={team?.colors ?? { primary: '#14904a', secondary: '#f5c542' }} />
          <strong>Your PA</strong>
        </div>
        {RING.map((h) => {
          const rad = (h.angle * Math.PI) / 180
          return (
            <div
              key={h.tab}
              className="hub-pos"
              style={{
                ['--x' as string]: `${50 + 37 * Math.cos(rad)}%`,
                ['--y' as string]: `${50 + 37 * Math.sin(rad)}%`,
              }}
            >
              <HubButton
                icon={h.icon}
                label={TABS[h.tab]}
                badge={!!badge[h.tab]}
                onClick={() => onTab(h.tab)}
              />
            </div>
          )
        })}
      </div>

      <div className="pa-says" aria-live="polite">
        <span className="pa-says-head">PA says</span>
        {career.mega ? (
          <PATip icon="market" title="The mega auction comes first">
            Signings, renewals and trades wait until it's over.
          </PATip>
        ) : (
          <>
            {needs.length ? (
              needs.slice(0, 2).map((n) => (
                <PATip
                  key={n.role}
                  icon="search"
                  title={`We need a ${n.title.toLowerCase()}`}
                  action={{ label: 'Show me', onClick: () => onTab('needs') }}
                >
                  {n.why}.{n.options[0] && ` ${n.options[0].p.name} would fit.`}
                </PATip>
              ))
            ) : (
              <PATip icon="squad" title="The squad looks balanced">
                No gaps for next season. Look for upgrades or young talent.
              </PATip>
            )}
            {undecided.length > 0 && (
              <PATip
                icon="contract"
                title={`${undecided.length} contract${undecided.length > 1 ? 's' : ''} to decide`}
                action={{ label: 'Let me handle it', onClick: () => setPlanOpen(true) }}
                second={{ label: "I'll do it", onClick: () => onTab('contracts') }}
              >
                {undecided
                  .slice(0, 3)
                  .map((p) => p.name)
                  .join(', ')}
                {undecided.length > 3 ? ` and ${undecided.length - 3} more` : ''} are in their final
                year. I can negotiate the renewals for you.
              </PATip>
            )}
            {young.length > 0 && (
              <PATip
                icon="star"
                title={`${young.length} young prospects available`}
                action={{
                  label: 'See free agents',
                  onClick: () => onTab('free'),
                }}
              >
                Most promising: {young[0]!.name}, {young[0]!.age}, potential {young[0]!.potential}.
                Other clubs are watching the youngsters too.
              </PATip>
            )}
            <PATip
              icon="trade"
              title={open ? 'The trade window is open' : 'The trade window is shut'}
              action={
                offers
                  ? {
                      label: `${offers} offer${offers > 1 ? 's' : ''}`,
                      onClick: () => navigate('/news'),
                    }
                  : open
                    ? { label: 'Build a trade', onClick: () => onTab('trade') }
                    : undefined
              }
            >
              {open
                ? 'Trade players and cash with any club.'
                : 'Trades run in the preseason and after the season.'}{' '}
              {squad.length}/{SQUAD_MAX} players, {crore(capRoom(career.players, me))} under the
              cap, {crore(fundsOf(career, me))} in club funds.
            </PATip>
          </>
        )}
      </div>
      {planOpen && <RenewalPlanSheet career={career} onClose={() => setPlanOpen(false)} />}
    </>
  )
}

function PATip({
  icon,
  title,
  children,
  action,
  second,
}: {
  icon: IconName
  title: string
  children: React.ReactNode
  action?: { label: string; onClick: () => void }
  second?: { label: string; onClick: () => void }
}) {
  return (
    <div className="pa-tip">
      <span className="pa-tip-icon" aria-hidden>
        <Icon name={icon} size={20} />
      </span>
      <div className="pa-tip-body">
        <strong>{title}</strong>
        <span>{children}</span>
        {(action || second) && (
          <span className="button-row">
            {action && (
              <button className="primary" onClick={action.onClick}>
                {action.label}
              </button>
            )}
            {second && <button onClick={second.onClick}>{second.label}</button>}
          </span>
        )}
      </div>
    </div>
  )
}

type View = 'suggested' | 'free' | 'league'

/** Needs: the squad's gaps with the best options, or every free agent / league player. */
function Needs({
  career,
  initialView,
  onTrade,
}: {
  career: Career
  initialView: View
  onTrade: (playerId: string) => void
}) {
  const [view, setView] = useState<View>(initialView)
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

/** Your squad with the moves you can make on each player: release, list, trade. */
function MySquad({ career, onTrade }: { career: Career; onTrade: (playerId: string) => void }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const me = career.manager.teamId
  const squad = squadOf(career.players, me).sort(
    (a, b) => (b.contract?.salary ?? 0) - (a.contract?.salary ?? 0),
  )
  const listed = new Set(career.market.listed ?? [])
  const open = squad.find((p) => p.id === openId)
  const blocked = releaseBlocker(career, squad[0]?.id ?? '')
  const done = (m: string) => {
    setMessage(m)
    setOpenId(null)
  }
  return (
    <>
      <p className="dim">
        Release a player to free his salary under the cap at once, put him on the transfer list for
        offers, or build a trade around him.
      </p>
      {blocked && <p className="warn">{blocked}</p>}
      {message && <p className="good">{message}</p>}
      <ul className="plist squad-moves">
        {squad.map((p) => (
          <li key={p.id}>
            <PlayerRow
              p={p}
              onClick={() => setOpenId(p.id)}
              extra={
                <>
                  <span className={(p.contract?.years ?? 0) <= 1 ? 'warn' : ''}>
                    {bidPrice(p.contract?.salary ?? 0)} · {p.contract?.years} yr
                  </span>{' '}
                  · Form {Math.round(p.form)}
                  {listed.has(p.id) && <Chip tone="blue">Listed</Chip>}
                </>
              }
            />
            <div className="squad-move-row">
              <button
                onClick={() => {
                  const n = listPlayer(p.id, !listed.has(p.id))
                  setMessage(
                    listed.has(p.id)
                      ? `${p.name} is off the transfer list.`
                      : n
                        ? `${p.name} is on the transfer list: ${n} offer${n > 1 ? 's' : ''} in the News.`
                        : `${p.name} is on the transfer list. Clubs make offers in the trade window.`,
                  )
                }}
              >
                {listed.has(p.id) ? 'Unlist' : 'List'}
              </button>
              <button onClick={() => onTrade(p.id)}>Trade</button>
              <button
                className="danger"
                disabled={!!blocked}
                onClick={() => {
                  if (
                    !confirm(
                      `Release ${p.name}? His ${bidPrice(p.contract?.salary ?? 0)} comes off your payroll.`,
                    )
                  )
                    return
                  setMessage(release(p.id) ?? `${p.name} released.`)
                }}
              >
                Release
              </button>
            </div>
          </li>
        ))}
      </ul>
      {open && (
        <PlayerSheet
          p={open}
          onClose={() => setOpenId(null)}
          actions={
            <OwnPlayerActions
              career={career}
              p={open}
              row={contractOutlook(career, TEAM_IDS).expiring.find((r) => r.p.id === open.id)}
              listed={listed.has(open.id)}
              onDone={done}
            />
          }
        />
      )}
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
