import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { teamById, teams } from '@/data'
import {
  MEGA_EVERY,
  nextBid,
  nextMegaSeason,
  nextSetOfKind,
  progress,
  RETAIN_MAX,
  RETAIN_OVERSEAS_MAX,
  reserveFor,
  retentionPrices,
  retentionValue,
  suggestRetention,
  upNext,
  userBidBlocker,
  type MegaState,
  type SetKind,
} from '@/sim/auction'
import type { Career, CareerPlayer } from '@/sim/career'
import {
  askingSalary,
  IDEAL,
  SALARY_CAP,
  SQUAD_MAX,
  SQUAD_MIN,
  SQUAD_OVERSEAS_MAX,
  squadOf,
} from '@/sim/market'
import { overallRating } from '@/sim/player'
import {
  auctionAuto,
  auctionAutoBid,
  auctionBid,
  auctionFinish,
  auctionHammer,
  auctionNextLot,
  auctionPass,
  auctionRivalRaise,
  auctionSim,
  auctionShortlist,
  auctionStopForShortlist,
  auctionToggleStar,
  retainPlayers,
  useGame,
  type SimReport,
} from '@/state/store'
import { bidPrice, crore, roleLabel, TRAIT_LABEL, teamShort } from './format'
import { Avatar } from './identity/Avatar'
import { ringStatus } from './identity/avatarSpec'
import { Crest } from './identity/Crest'
import { Icon } from './kit/Icon'
import { Chip, RatingRing, Screen, Sheet } from './kit/kit'
import { PlayerRow, PlayerSheet } from './PlayerRow'

const SIM_KINDS: [SetKind, string][] = [
  ['bat', 'Batters'],
  ['ar', 'All-rounders'],
  ['wk', 'Keepers'],
  ['fast', 'Fast'],
  ['spin', 'Spin'],
]

/** The mega auction: keep up to five players, then buy the rest of the squad. */
export function AuctionPage() {
  const career = useGame((s) => s.career)
  if (!career) return null
  const m = career.mega
  if (!m) return <NoAuction career={career} />
  if (m.stage === 'retention') return <Retention career={career} m={m} />
  if (m.stage === 'auction') return <Auction career={career} m={m} />
  return <Finished career={career} m={m} />
}

function NoAuction({ career }: { career: Career }) {
  const navigate = useNavigate()
  const season = nextMegaSeason(career.calendar.year)
  const away = season - career.calendar.year + (career.season.review ? 0 : 1)
  return (
    <Screen back={{ label: 'Club', onClick: () => navigate('/') }}>
      <h1>Mega auction</h1>
      <div className="card">
        <strong>Every {MEGA_EVERY} years, after the season ends</strong>
        <p className="dim">
          You keep up to {RETAIN_MAX} players. Everyone else goes into one pool and your squad is
          rebuilt at the auction, in sets of batters, all-rounders, keepers and bowlers.
        </p>
        <p>
          The next one follows the <strong>{season}</strong> season
          {away > 0 ? ` (${away} season${away === 1 ? '' : 's'} away)` : ''}.
        </p>
      </div>
    </Screen>
  )
}

// --- Retention -----------------------------------------------------------------------

function Retention({ career, m }: { career: Career; m: MegaState }) {
  const navigate = useNavigate()
  const me = career.manager.teamId
  const squad = squadOf(career.players, me).sort((a, b) => retentionValue(b) - retentionValue(a))
  const [picked, setPicked] = useState<string[]>(() => suggestRetention(career))
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const chosen = picked
    .map((id) => squad.find((p) => p.id === id))
    .filter((p): p is CareerPlayer => !!p)
  const prices = retentionPrices(chosen)
  const cost = Object.values(prices).reduce((s, v) => s + v, 0)
  const overseas = chosen.filter((p) => p.overseas).length
  const toggle = (p: CareerPlayer) => {
    setError(null)
    if (picked.includes(p.id)) return setPicked(picked.filter((id) => id !== p.id))
    if (picked.length >= RETAIN_MAX) return setError(`You can keep at most ${RETAIN_MAX} players.`)
    if (p.overseas && overseas >= RETAIN_OVERSEAS_MAX)
      return setError(`At most ${RETAIN_OVERSEAS_MAX} overseas players can be kept.`)
    setPicked([...picked, p.id])
  }
  const confirmIt = () => {
    if (
      chosen.length < RETAIN_MAX &&
      !confirm(
        `Keep only ${chosen.length} player${chosen.length === 1 ? '' : 's'}? The rest go into the auction.`,
      )
    )
      return
    const e = retainPlayers(picked)
    if (e) setError(e)
  }
  const open = squad.find((p) => p.id === info)
  return (
    <Screen
      back={{ label: 'Club', onClick: () => navigate('/') }}
      primary={{ label: 'Confirm retentions', onClick: confirmIt }}
    >
      <h1>Mega auction</h1>
      <p className="dim">
        The {m.year} season is over. Keep up to {RETAIN_MAX} players (at most {RETAIN_OVERSEAS_MAX}{' '}
        overseas) at a fixed price; everyone else goes into the auction pool. The priciest slab goes
        to your most valuable player.
      </p>

      <div className="ret-slots" aria-label="Retention slots">
        {Array.from({ length: RETAIN_MAX }, (_, i) => {
          const p = [...chosen].sort((a, b) => retentionValue(b) - retentionValue(a))[i]
          return (
            <div key={i} className={`ret-slot ${p ? 'full' : ''}`}>
              <small>{p ? crore(prices[p.id] ?? 0) : '+'}</small>
              <span>{p ? p.name.split(' ').slice(-1)[0] : 'Empty'}</span>
            </div>
          )
        })}
      </div>

      <div className="card ret-sum">
        <div className="row-between">
          <span>Keeping</span>
          <strong>
            {chosen.length}/{RETAIN_MAX} · {overseas}/{RETAIN_OVERSEAS_MAX} overseas
          </strong>
        </div>
        <div className="row-between">
          <span>Retention cost</span>
          <strong className="money">{crore(cost)}</strong>
        </div>
        <div className="row-between">
          <span>Auction purse</span>
          <strong className="money">{crore(SALARY_CAP - cost)}</strong>
        </div>
      </div>
      {error && <p className="warn">{error}</p>}

      <div className="button-row">
        <button onClick={() => setPicked(suggestRetention(career))}>Suggest</button>
        <button onClick={() => setPicked([])}>Clear</button>
      </div>

      <h2 className="section">Your squad</h2>
      <ul className="plist">
        {squad.map((p) => {
          const on = picked.includes(p.id)
          return (
            <li key={p.id}>
              <PlayerRow
                p={p}
                as="div"
                picked={on}
                onClick={() => toggle(p)}
                extra={
                  <>
                    Now {crore(p.contract?.salary ?? 0)}
                    {p.overseas && <Chip tone="blue">Overseas</Chip>}
                  </>
                }
                side={
                  <span className="ret-side">
                    <button
                      className="icon-btn info-btn"
                      aria-label={`Details: ${p.name}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setInfo(p.id)
                      }}
                    >
                      i
                    </button>
                    <span className={`ret-check ${on ? 'on' : ''}`}>
                      {on ? crore(prices[p.id] ?? 0) : 'Keep'}
                    </span>
                  </span>
                }
              />
            </li>
          )
        })}
      </ul>

      <h2 className="section">Or leave it to the captain</h2>
      <p className="dim">
        Sensible retentions, then the captain bids for you through the whole auction. You can review
        the result before the season starts.
      </p>
      <button
        onClick={() => {
          if (confirm('Run the whole auction automatically?')) auctionAuto()
        }}
      >
        Auto-run the auction
      </button>
      {open && <PlayerSheet p={open} onClose={() => setInfo(null)} />}
    </Screen>
  )
}

// --- The auction ---------------------------------------------------------------------

type Tab = 'live' | 'sets' | 'sold' | 'squad'

/** The auctioneer's call on the standing bid. */
type Call = 'open' | 'once' | 'twice'

interface Clock {
  call: Call
  /** How long until the clock's next move, in ms (drives the countdown bar). */
  wait: number
  /** Changes whenever the clock restarts, so the countdown can restart with it. */
  stamp: string
  running: boolean
}

/**
 * The auction clock, the only timer on the screen. Rivals take their turn a moment after
 * each bid; when nobody goes higher the auctioneer calls "going once", "going twice",
 * then the hammer falls and the next player comes up. Any bid restarts the calls.
 */
function useAuctionClock(m: MegaState, me: string, paused: boolean): Clock {
  const lot = m.lot
  const key = lot
    ? `${lot.playerId}:${lot.bid}:${lot.bidderId}:${lot.out}`
    : `none:${m.setIndex}:${m.lotIndex}`
  const [clock, setClock] = useState<{ key: string; call: Call }>({ key, call: 'open' })
  const call: Call = clock.key === key ? clock.call : 'open'
  const running = m.stage === 'auction' && !paused
  const leader = lot?.bidderId ?? null
  const hasLot = !!lot
  const justSold = !!m.last
  const wait = !hasLot
    ? justSold
      ? 1800
      : 400
    : call !== 'open'
      ? 2500
      : leader === me
        ? 1100
        : leader
          ? 600
          : 1200
  useEffect(() => {
    if (!running) return
    const t = setTimeout(() => {
      if (!hasLot) auctionNextLot()
      else if (call === 'open') {
        if (!auctionRivalRaise()) setClock({ key, call: 'once' })
      } else if (call === 'once') setClock({ key, call: 'twice' })
      else auctionHammer()
    }, wait)
    return () => clearTimeout(t)
  }, [key, call, running, hasLot, wait])
  return { call, wait, stamp: `${key}:${call}`, running }
}

type Status = 'live' | 'going' | 'sold' | 'unsold' | 'paused'

function statusOf(m: MegaState, clock: Clock, paused: boolean): Status {
  if (paused) return 'paused'
  if (!m.lot) return m.last ? (m.last.teamId ? 'sold' : 'unsold') : 'live'
  return clock.call === 'open' ? 'live' : 'going'
}

const STATUS_LABEL: Record<Status, string> = {
  live: 'Live',
  going: 'Going',
  sold: 'Sold',
  unsold: 'Unsold',
  paused: 'Paused',
}

function Auction({ career, m }: { career: Career; m: MegaState }) {
  const navigate = useNavigate()
  const me = career.manager.teamId
  const [tab, setTab] = useState<Tab>('live')
  const [report, setReport] = useState<SimReport | null>(null)
  const [sheet, setSheet] = useState<'ahead' | 'settings' | 'clubs' | null>(null)
  const [paused, setPaused] = useState(false)
  const clock = useAuctionClock(m, me, paused || sheet !== null)
  const status = statusOf(m, clock, paused)

  const sim = (toSet?: number | 'end') => () => {
    setSheet(null)
    setReport(auctionSim(toSet))
    setTab('live')
  }

  return (
    <Screen
      className="auction-screen auc-theme"
      bar={false}
      top={
        <AuctionHeader
          career={career}
          m={m}
          status={status}
          onBack={() => navigate('/')}
          onClubs={() => setSheet('clubs')}
        />
      }
      dock={
        <BidControlPanel
          career={career}
          m={m}
          clock={clock}
          paused={paused}
          onBid={() => {
            setReport(null)
            auctionBid()
          }}
          onSkip={() => {
            setReport(null)
            auctionPass()
          }}
          onPause={() => setPaused((v) => !v)}
          onAhead={() => setSheet('ahead')}
        />
      }
    >
      {report && <SimReportCard report={report} me={me} onClose={() => setReport(null)} />}

      <div className="auc-tabs" role="tablist">
        {(['live', 'sets', 'sold', 'squad'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? 'on' : ''}
            onClick={() => setTab(t)}
          >
            {{ live: 'Live', sets: 'Sets', sold: 'Sold', squad: 'My squad' }[t]}
          </button>
        ))}
      </div>

      {tab === 'live' && <Live career={career} m={m} clock={clock} status={status} />}
      {tab === 'sets' && <Sets career={career} m={m} onSim={sim} />}
      {tab === 'sold' && <Sold career={career} m={m} />}
      {tab === 'squad' && <SquadTab career={career} m={m} />}

      {sheet === 'ahead' && (
        <AheadSheet
          m={m}
          onSim={sim}
          onSettings={() => setSheet('settings')}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'settings' && <SettingsSheet m={m} onClose={() => setSheet(null)} />}
      {sheet === 'clubs' && (
        <Sheet title="Clubs and purses" onClose={() => setSheet(null)}>
          <Clubs career={career} m={m} />
        </Sheet>
      )}
    </Screen>
  )
}

/** Title, where the auction is, the status, and the clubs' purses in one strip. */
function AuctionHeader({
  career,
  m,
  status,
  onBack,
  onClubs,
}: {
  career: Career
  m: MegaState
  status: Status
  onBack: () => void
  onClubs: () => void
}) {
  const set = m.sets[m.setIndex]
  const { done, total } = progress(m)
  return (
    <header className="auc-header auc-theme">
      <div className="auc-bar">
        <button className="auc-back" aria-label="Back to the club" onClick={onBack}>
          <Icon name="back" />
        </button>
        <div className="auc-title">
          <strong>Mega Auction {m.year + 1}</strong>
          <small>
            {set
              ? `Set ${m.setIndex + 1}/${m.sets.length} · ${set.label} · Player ${Math.min(m.lotIndex + 1, set.ids.length)}/${set.ids.length}`
              : 'Final lots'}
          </small>
        </div>
        <span className={`auc-status ${status}`} role="status">
          <i aria-hidden />
          {STATUS_LABEL[status]}
        </span>
      </div>
      <div
        className="auc-progress"
        role="progressbar"
        aria-label="Auction progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
      <TeamPurseStrip career={career} m={m} onOpen={onClubs} />
    </header>
  )
}

/** Every club's purse at a glance: yours first, the standing bidder lit up. */
function TeamPurseStrip({
  career,
  m,
  onOpen,
}: {
  career: Career
  m: MegaState
  onOpen: () => void
}) {
  const me = career.manager.teamId
  const order = [...teams].sort((a, b) =>
    a.id === me ? -1 : b.id === me ? 1 : (m.purses[b.id] ?? 0) - (m.purses[a.id] ?? 0),
  )
  return (
    <div className="purse-strip" aria-label="Club purses">
      {order.map((t) => {
        const n = squadOf(career.players, t.id).length
        const leads = m.lot?.bidderId === t.id
        return (
          <button
            key={t.id}
            className={`purse-chip ${t.id === me ? 'mine' : ''} ${leads ? 'leads' : ''}`}
            onClick={onOpen}
            aria-label={`${t.name}: ${crore(m.purses[t.id] ?? 0)} left, ${n} players${leads ? ', highest bidder' : ''}`}
          >
            <Crest crest={t.crest} colors={t.colors} size={22} />
            <span>
              <b>{t.id === me ? 'YOU' : t.short}</b>
              <small>
                {crore(m.purses[t.id] ?? 0)} · {n}
              </small>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** What a sim just did, in plain words. */
function SimReportCard({
  report: r,
  me,
  onClose,
}: {
  report: SimReport
  me: string
  onClose: () => void
}) {
  return (
    <div className="auc-report" role="status">
      <button className="icon-btn report-x" aria-label="Dismiss" onClick={onClose}>
        ×
      </button>
      <strong>
        {r.stopped === 'target'
          ? 'Stopped: a player on your shortlist is up'
          : r.stopped === 'done'
            ? 'The auction is over'
            : `Simmed ${r.lots} lot${r.lots === 1 ? '' : 's'}`}
      </strong>
      {r.stopped !== 'done' && <span className="dim">Now at: {r.at}</span>}
      <span className={r.bought.length ? 'good' : 'dim'}>
        {r.bought.length ? `You signed ${r.bought.join(', ')}.` : 'You signed nobody.'}
      </span>
      {r.missed.length > 0 && <span className="warn">You missed {r.missed.join(', ')}.</span>}
      {r.biggest && (
        <span className="dim">
          Biggest sale: {r.biggest.name} to{' '}
          {r.biggest.teamId === me ? 'you' : teamShort(r.biggest.teamId)} for{' '}
          {bidPrice(r.biggest.price)}.
        </span>
      )}
    </div>
  )
}

/** Where to sim to, with the destination spelled out on every row. */
function AheadSheet({
  m,
  onSim,
  onSettings,
  onClose,
}: {
  m: MegaState
  onSim: (toSet?: number | 'end') => () => void
  onSettings: () => void
  onClose: () => void
}) {
  const next = m.setIndex + 1 < m.sets.length ? m.setIndex + 1 : null
  const row = (i: number, lead?: string) => {
    const s = m.sets[i]
    if (!s) return null
    return (
      <button key={`${lead}-${i}`} className="ahead-row" onClick={onSim(i)}>
        <span>
          <strong>{lead ?? `${i + 1}. ${s.label}`}</strong>
          <small className="dim">
            {lead ? `Set ${i + 1}: ${s.label}` : ''}
            {lead ? ' · ' : ''}
            {s.ids.length} players
          </small>
        </span>
        <span className="ahead-go">Sim to here</span>
      </button>
    )
  }
  return (
    <Sheet title="Sim ahead" onClose={onClose}>
      <p className="dim">
        Everything before the set you pick is simmed. Your shortlist is bought up to your max prices
        on the way.
      </p>
      <h3 className="section">Quick jumps</h3>
      <div className="ahead-list">
        {next !== null && row(next, 'Next set')}
        {SIM_KINDS.map(([kind, label]) => {
          const at = nextSetOfKind(m, kind)
          return at === null || at === next ? null : row(at, `Next ${label.toLowerCase()}`)
        })}
        <button className="ahead-row end" onClick={onSim('end')}>
          <span>
            <strong>Rest of the auction</strong>
            <small className="dim">Sim every remaining lot</small>
          </span>
          <span className="ahead-go">Sim all</span>
        </button>
      </div>
      <button className="dock-status" onClick={onSettings}>
        While simming your club bids for{' '}
        <strong>{Object.keys(m.shortlist).length} shortlisted</strong>
        {m.autoBid ? ' + players your squad needs' : ' only'} · change
      </button>
      <h3 className="section">Or pick any set</h3>
      <div className="ahead-list">
        {m.sets.map((s, i) =>
          i <= m.setIndex ? null : (
            <button key={i} className="ahead-row" onClick={onSim(i)}>
              <span>
                <strong>
                  {i + 1}. {s.label}
                </strong>
                <small className="dim">{s.ids.length} players</small>
              </span>
              <span className="ahead-go">Sim to here</span>
            </button>
          ),
        )}
      </div>
    </Sheet>
  )
}

/** How a sim bids for the manager. */
function SettingsSheet({ m, onClose }: { m: MegaState; onClose: () => void }) {
  return (
    <Sheet title="While simming" onClose={onClose}>
      <p>
        When you sim, your club always bids for the players on your <strong>shortlist</strong>, up
        to the max you set for each. It only pays as much as it takes to win.
      </p>
      <label className="toggle">
        <input
          type="checkbox"
          checked={m.autoBid}
          onChange={(e) => auctionAutoBid(e.target.checked)}
        />
        <span>
          <strong>Captain also buys players my squad needs</strong>
          <br />
          <small className="dim">
            Off: only your shortlist is bought, and you may end up short of players.
          </small>
        </span>
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={m.stopForShortlist}
          onChange={(e) => auctionStopForShortlist(e.target.checked)}
        />
        <span>
          <strong>Stop when a shortlisted player comes up</strong>
          <br />
          <small className="dim">So you can bid for him yourself instead of using his max.</small>
        </span>
      </label>
      <button className="primary" style={{ width: '100%', marginTop: 10 }} onClick={onClose}>
        Done
      </button>
    </Sheet>
  )
}

/** − ₹X + for a shortlisted player's max price. */
function MaxStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const step = (v: number) => (v < 500 ? 25 : 50)
  return (
    <span className="max-step">
      <button
        aria-label="Lower max"
        disabled={value <= 20}
        onClick={() => onChange(Math.max(20, value - step(value - 1)))}
      >
        −
      </button>
      <span>
        <small>MAX</small>
        <b>{bidPrice(value)}</b>
      </span>
      <button aria-label="Raise max" onClick={() => onChange(value + step(value))}>
        +
      </button>
    </span>
  )
}

/**
 * The bidding panel, pinned within thumb reach: what is happening, the next valid bid on
 * one big button, then skip, pause and sim ahead. A second tap within a moment is ignored,
 * so a double tap never places two bids.
 */
function BidControlPanel({
  career,
  m,
  clock,
  paused,
  onBid,
  onSkip,
  onPause,
  onAhead,
}: {
  career: Career
  m: MegaState
  clock: Clock
  paused: boolean
  onBid: () => void
  onSkip: () => void
  onPause: () => void
  onAhead: () => void
}) {
  const me = career.manager.teamId
  const lot = m.lot
  const lastTap = useRef(0)
  const youLead = lot?.bidderId === me
  const blocker = lot && !youLead && !lot.out ? userBidBlocker(career) : null
  const canBid = !!lot && !youLead && !lot.out && !blocker && !paused
  const leader = lot?.bidderId ? teamShort(lot.bidderId) : ''
  const outbid = !!lot && !youLead && !!lot.bidderId && lot.trail.some((t) => t.teamId === me)
  const going = clock.call === 'once' ? 'Going once!' : clock.call === 'twice' ? 'Going twice!' : ''
  const lastP = m.last && career.players.find((x) => x.id === m.last?.playerId)
  let tone: 'plain' | 'good' | 'warn' | 'bad' = 'plain'
  let msg: string
  if (paused) msg = 'Paused. Press Resume to carry on.'
  else if (!lot)
    msg =
      lastP && m.last
        ? m.last.teamId
          ? `${lastP.name} sold to ${m.last.teamId === me ? 'you' : teamShort(m.last.teamId)}. Next player coming up…`
          : `${lastP.name} unsold. Next player coming up…`
        : 'The first player is coming up…'
  else if (lot.out) msg = 'You skipped this player. The others are finishing.'
  else if (youLead) {
    tone = 'good'
    msg = going ? `You lead. ${going}` : 'Your bid is the highest. Waiting for the others…'
  } else if (blocker) {
    tone = 'warn'
    msg = blocker
  } else if (outbid) {
    tone = 'bad'
    msg = `Outbid by ${leader}.${going ? ` ${going}` : ''} Bid again to stay in.`
  } else if (!lot.bidderId) {
    tone = going ? 'warn' : 'plain'
    msg = going ? `No bids. ${going}` : `Opening at ${bidPrice(lot.base)}. Be the first to bid.`
  } else {
    tone = going ? 'warn' : 'plain'
    msg = `${leader} lead${going ? `. ${going}` : '.'} Next valid bid ${bidPrice(nextBid(lot))}.`
  }
  const tap = () => {
    const now = Date.now()
    if (!canBid || now - lastTap.current < 350) return
    lastTap.current = now
    try {
      navigator.vibrate?.(12)
    } catch {
      // Haptics are a nicety.
    }
    onBid()
  }
  return (
    <div className="dock auc-dock auc-theme">
      <div className="bcp-info">
        <span className={`bcp-msg ${tone}`} aria-live="polite">
          {msg}
        </span>
        <span className="bcp-purse">
          <small>Your purse</small>
          <b>{crore(m.purses[me] ?? 0)}</b>
        </span>
      </div>
      <button className={`bcp-bid ${youLead ? 'leading' : ''}`} disabled={!canBid} onClick={tap}>
        <small>
          {!lot ? 'Next player' : youLead ? 'You lead' : lot.out ? 'Skipped' : 'Place bid'}
        </small>
        <b>{lot ? bidPrice(youLead ? lot.bid : nextBid(lot)) : '—'}</b>
      </button>
      <div className="bcp-row">
        <button disabled={!lot || youLead || lot.out} onClick={onSkip}>
          Skip player
        </button>
        <button onClick={onPause} aria-pressed={paused}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button onClick={onAhead}>Sim ahead…</button>
      </div>
    </div>
  )
}

/** The live tab: the hammer countdown, the player on the block (or the result), the bids. */
function Live({
  career,
  m,
  clock,
  status,
}: {
  career: Career
  m: MegaState
  clock: Clock
  status: Status
}) {
  const [info, setInfo] = useState<string | null>(null)
  const infoP = info ? career.players.find((p) => p.id === info) : undefined
  return (
    <>
      <HammerMeter clock={clock} status={status} live={!!m.lot} />
      {m.lot ? (
        <Spotlight career={career} m={m} onInfo={setInfo} />
      ) : (
        <ResultCard career={career} m={m} onInfo={setInfo} />
      )}
      {m.lot && m.lot.trail.length > 0 && <RecentBids career={career} m={m} />}
      {infoP && <PlayerSheet p={infoP} onClose={() => setInfo(null)} />}
    </>
  )
}

const CALLS: { call: Call; label: string }[] = [
  { call: 'open', label: 'Bidding' },
  { call: 'once', label: 'Once' },
  { call: 'twice', label: 'Twice' },
]

/**
 * The hammer countdown: bidding, going once, going twice. The moving bar is the auction
 * clock's own wait (no second timer), so it is always in step with the real auction.
 */
function HammerMeter({ clock, status, live }: { clock: Clock; status: Status; live: boolean }) {
  const now = CALLS.findIndex((c) => c.call === clock.call)
  const label =
    status === 'paused'
      ? 'Paused'
      : status === 'sold'
        ? 'Sold'
        : status === 'unsold'
          ? 'Unsold'
          : clock.call === 'once'
            ? 'Going once…'
            : clock.call === 'twice'
              ? 'Going twice…'
              : 'Bidding open'
  const sub =
    status === 'paused'
      ? 'The clock is stopped'
      : !live
        ? 'Next player in a moment'
        : clock.call === 'open'
          ? 'Clubs are deciding'
          : 'The hammer falls if nobody bids'
  return (
    <div className={`hammer ${status} ${clock.call}`}>
      <div className="hammer-head">
        <strong>{label}</strong>
        <small>{sub}</small>
      </div>
      <div className="hammer-track" aria-hidden>
        {CALLS.map((c, i) => (
          <span
            key={c.call}
            className={`hm-seg ${!live || i < now ? 'done' : ''} ${live && i === now ? 'now' : ''}`}
          >
            {live && i === now && (
              <i
                key={clock.stamp}
                style={{
                  animationDuration: `${clock.wait}ms`,
                  animationPlayState: clock.running ? 'running' : 'paused',
                }}
              />
            )}
            <em>{c.label}</em>
          </span>
        ))}
      </div>
    </div>
  )
}

/** The player on the block: who he is, what he does, base price against the highest bid. */
function Spotlight({
  career,
  m,
  onInfo,
}: {
  career: Career
  m: MegaState
  onInfo: (id: string) => void
}) {
  const me = career.manager.teamId
  const lot = m.lot as NonNullable<MegaState['lot']>
  const p = career.players.find((x) => x.id === lot.playerId) as CareerPlayer
  const holder = lot.bidderId ? teamById.get(lot.bidderId) : undefined
  const youLead = lot.bidderId === me
  const starred = m.shortlist[p.id] !== undefined
  const prev = lot.trail.length >= 2 ? (lot.trail.at(-2)?.bid ?? lot.base) : lot.base
  const delta = holder ? lot.bid - prev : 0
  return (
    <article className={`spot ${youLead ? 'mine' : holder ? 'rival' : ''}`}>
      <div className="spot-top">
        <button
          className="spot-avatar"
          onClick={() => onInfo(p.id)}
          aria-label={`Details: ${p.name}`}
        >
          <Avatar
            seed={p.id}
            nationality={p.nationality}
            age={p.age}
            kit={holder?.colors ?? { primary: '#3a4257', secondary: '#c9ccd6' }}
            size={84}
            ring={ringStatus(p.fitness)}
            title={p.name}
          />
        </button>
        <div className="spot-id">
          <h2 className="spot-name">{p.name}</h2>
          <div className="spot-chips">
            <span className="sc role">{roleLabel(p)}</span>
            <span className="sc">{p.nationality}</span>
            {p.overseas && <span className="sc os">Overseas</span>}
            <span className="sc">Age {p.age}</span>
          </div>
          {p.traits.length > 0 && (
            <div className="spot-chips">
              {p.traits.slice(0, 2).map((t) => (
                <span key={t} className={`sc trait ${t === 'poor-vs-spin' ? 'weak' : ''}`}>
                  {TRAIT_LABEL[t]}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="spot-side">
          <RatingRing value={overallRating(p)} size={50} label={`Overall ${overallRating(p)}`} />
          <button
            className={`star-btn ${starred ? 'on' : ''}`}
            aria-pressed={starred}
            aria-label={starred ? 'Take off your shortlist' : 'Add to your shortlist'}
            onClick={() => auctionToggleStar(p.id)}
          >
            {starred ? '★' : '☆'}
          </button>
        </div>
      </div>

      <div className="price-board">
        <div className="pb-base">
          <small>Base price</small>
          <b>{bidPrice(lot.base)}</b>
        </div>
        <div className="pb-now" style={holder ? { borderColor: holder.colors.primary } : undefined}>
          <small>{holder ? (youLead ? 'Your bid · highest' : 'Highest bid') : 'No bids yet'}</small>
          <b key={`${lot.bid}-${lot.bidderId}`} className="pb-amount">
            {bidPrice(lot.bid)}
          </b>
          {delta > 0 && (
            <span key={`d-${lot.bid}`} className="pb-delta">
              ▲ {bidPrice(delta)}
            </span>
          )}
          <span className="pb-holder">
            {holder ? (
              <>
                <Crest crest={holder.crest} colors={holder.colors} size={22} />
                <span>{youLead ? 'You' : holder.name}</span>
              </>
            ) : (
              <span className="dim">Opening price</span>
            )}
          </span>
        </div>
      </div>
      <div className="spot-stats">
        <span>
          <small>Bat</small>
          <b>{p.ratings.batting}</b>
        </span>
        <span>
          <small>Bowl</small>
          <b>{p.ratings.bowling}</b>
        </span>
        <span>
          <small>Field</small>
          <b>{p.ratings.fielding}</b>
        </span>
        <span>
          <small>Worth</small>
          <b>{bidPrice(askingSalary(p))}</b>
        </span>
      </div>
    </article>
  )
}

/** The bids so far on this player (the last five), newest first. */
function RecentBids({ career, m }: { career: Career; m: MegaState }) {
  const me = career.manager.teamId
  const trail = [...(m.lot?.trail ?? [])].reverse()
  return (
    <details className="recent" open>
      <summary>
        Recent bids <span>{trail.length}</span>
      </summary>
      <ol>
        {trail.map((t, i) => {
          const team = teamById.get(t.teamId)
          return (
            <li
              key={`${t.teamId}-${t.bid}`}
              className={`${i === 0 ? 'top' : ''} ${t.teamId === me ? 'me' : ''}`}
            >
              {team && <Crest crest={team.crest} colors={team.colors} size={20} />}
              <span>{t.teamId === me ? 'You' : team?.name}</span>
              <b>{bidPrice(t.bid)}</b>
            </li>
          )
        })}
      </ol>
    </details>
  )
}

/** Between players: SOLD or UNSOLD on the last one, and who is next. */
function ResultCard({
  career,
  m,
  onInfo,
}: {
  career: Career
  m: MegaState
  onInfo: (id: string) => void
}) {
  const me = career.manager.teamId
  const last = m.last
  const p = last ? career.players.find((x) => x.id === last.playerId) : undefined
  const winner = last?.teamId ? teamById.get(last.teamId) : undefined
  const nextId = upNext(m)
  const next = nextId ? career.players.find((x) => x.id === nextId) : undefined
  return (
    <article
      className={`spot spot-result ${!p || !last ? 'begin' : last.teamId ? (last.teamId === me ? 'sold mine' : 'sold') : 'unsold'}`}
    >
      {p && last ? (
        <>
          <span className="stamp">{last.teamId ? 'Sold' : 'Unsold'}</span>
          <div className="spot-top">
            <button
              className="spot-avatar"
              onClick={() => onInfo(p.id)}
              aria-label={`Details: ${p.name}`}
            >
              <Avatar
                seed={p.id}
                nationality={p.nationality}
                age={p.age}
                kit={winner?.colors ?? { primary: '#3a4257', secondary: '#c9ccd6' }}
                size={72}
                title={p.name}
              />
            </button>
            <div className="spot-id">
              <h2 className="spot-name">{p.name}</h2>
              <div className="spot-chips">
                <span className="sc role">{roleLabel(p)}</span>
                <span className="sc">{overallRating(p)} overall</span>
              </div>
            </div>
          </div>
          {winner ? (
            <div className="result-win">
              <Crest crest={winner.crest} colors={winner.colors} size={36} />
              <span>
                <small>{last.teamId === me ? 'Yours for' : `${winner.name} for`}</small>
                <b>{bidPrice(last.price)}</b>
              </span>
            </div>
          ) : (
            <p className="dim result-none">
              Nobody bid. He may come back in the accelerated round.
            </p>
          )}
        </>
      ) : (
        <span className="stamp begin">The auction begins</span>
      )}
      {next && (
        <div className="result-next">
          <small>Next up</small>
          <strong>{next.name}</strong>
          <span className="dim">
            {roleLabel(next)} · {overallRating(next)}
          </span>
        </div>
      )}
    </article>
  )
}

/** Your squad so far and your shortlist, away from the live action. */
function SquadTab({ career, m }: { career: Career; m: MegaState }) {
  const [info, setInfo] = useState<string | null>(null)
  const me = career.manager.teamId
  const squad = squadOf(career.players, me)
  const count = (role: CareerPlayer['role']) => squad.filter((p) => p.role === role).length
  const gaps = (Object.keys(IDEAL) as CareerPlayer['role'][]).filter((r) => count(r) < IDEAL[r])
  const infoP = info ? career.players.find((p) => p.id === info) : undefined
  return (
    <>
      <div className="card">
        <div className="row-between">
          <strong>Your squad</strong>
          <span className="dim">
            {squad.length}/{SQUAD_MAX} · {squad.filter((p) => p.overseas).length}/
            {SQUAD_OVERSEAS_MAX} overseas
          </span>
        </div>
        <div className="auc-roles">
          <Chip>Bat {count('batter')}</Chip>
          <Chip>Keepers {count('wicketkeeper')}</Chip>
          <Chip>All-rounders {count('allrounder')}</Chip>
          <Chip>Bowlers {count('bowler')}</Chip>
        </div>
        {gaps.length > 0 && (
          <span className="dim">
            Short of:{' '}
            {gaps
              .map(
                (r) =>
                  ({
                    batter: 'batters',
                    wicketkeeper: 'keepers',
                    allrounder: 'all-rounders',
                    bowler: 'bowlers',
                  })[r],
              )
              .join(', ')}
            .
          </span>
        )}
        {squad.length < SQUAD_MIN && (
          <span className="warn">
            You need {SQUAD_MIN - squad.length} more to reach {SQUAD_MIN}. Keep{' '}
            {bidPrice(reserveFor(squad.length))} back for them.
          </span>
        )}
        <ul className="plist">
          {[...squad]
            .sort((a, b) => overallRating(b) - overallRating(a))
            .map((p) => (
              <li key={p.id}>
                <PlayerRow
                  p={p}
                  as="div"
                  onClick={() => setInfo(p.id)}
                  extra={<>{crore(p.contract?.salary ?? 0)}</>}
                />
              </li>
            ))}
        </ul>
      </div>
      <Shortlist career={career} m={m} onInfo={setInfo} />
      {infoP && <PlayerSheet p={infoP} onClose={() => setInfo(null)} />}
    </>
  )
}

function Shortlist({
  career,
  m,
  onInfo,
}: {
  career: Career
  m: MegaState
  onInfo: (id: string) => void
}) {
  const ids = Object.keys(m.shortlist)
  const sale = new Map(m.sold.map((x) => [x.playerId, x]))
  const rows = ids
    .map((id) => career.players.find((p) => p.id === id))
    .filter((p): p is CareerPlayer => !!p)
  const status = (p: CareerPlayer) => {
    const x = sale.get(p.id)
    if (x)
      return x.teamId === career.manager.teamId
        ? `Won ${bidPrice(x.price)}`
        : `Lost to ${teamShort(x.teamId)}`
    return m.unsold.includes(p.id) ? 'Unsold' : null
  }
  return (
    <div className="card">
      <strong>Your shortlist ({rows.length})</strong>
      <span className="dim">
        Star players to add them. When you sim, your club bids for each up to the max you set.
      </span>
      {rows.length === 0 && <span className="dim">Nobody yet. Tap ☆ on a player.</span>}
      <ul className="sl-list">
        {rows.map((p) => {
          const st = status(p)
          return (
            <li key={p.id} className="sl-row">
              <button className="sl-who" onClick={() => onInfo(p.id)}>
                <strong>{p.name}</strong>
                <small className="dim">
                  {roleLabel(p)} · {overallRating(p)} · worth {bidPrice(askingSalary(p))}
                </small>
              </button>
              {st ? (
                <Chip tone={st.startsWith('Won') ? 'good' : 'warn'}>{st}</Chip>
              ) : (
                <MaxStepper
                  value={m.shortlist[p.id] as number}
                  onChange={(v) => auctionShortlist(p.id, v)}
                />
              )}
              <button
                className="star-btn on"
                aria-label={`Remove ${p.name} from the shortlist`}
                onClick={() => auctionShortlist(p.id, null)}
              >
                ★
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Sets({
  career,
  m,
  onSim,
}: {
  career: Career
  m: MegaState
  onSim: (toSet?: number | 'end') => () => void
}) {
  const [open, setOpen] = useState<number | null>(m.setIndex)
  const [info, setInfo] = useState<string | null>(null)
  const saleOf = new Map(m.sold.map((s) => [s.playerId, s]))
  const unsold = new Set(m.unsold)
  const player = (id: string) => career.players.find((p) => p.id === id) as CareerPlayer
  const infoP = info ? career.players.find((p) => p.id === info) : undefined
  return (
    <>
      <ul className="set-list">
        {m.sets.map((s, i) => {
          const state = i < m.setIndex ? 'done' : i === m.setIndex ? 'now' : 'next'
          return (
            <li key={i} className={`set-item ${state}`}>
              <button className="set-head" onClick={() => setOpen(open === i ? null : i)}>
                <span className="set-no">{i + 1}</span>
                <span className="set-name">
                  <strong>{s.label}</strong>
                  <small className="dim">
                    {s.ids.length} players ·{' '}
                    {s.ids
                      .map(player)
                      .sort((a, b) => overallRating(b) - overallRating(a))
                      .slice(0, 2)
                      .map((p) => p.name.split(' ').slice(-1)[0])
                      .join(', ')}
                  </small>
                </span>
                {state === 'done' && <Chip tone="good">Done</Chip>}
                {state === 'now' && <Chip tone="blue">Now</Chip>}
                {state === 'next' && (
                  <span
                    className="set-go"
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSim(i)()
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.stopPropagation()
                        onSim(i)()
                      }
                    }}
                  >
                    Sim to here
                  </span>
                )}
              </button>
              {open === i && (
                <ul className="plist set-players">
                  {s.ids.map((id) => {
                    const p = player(id)
                    const sale = saleOf.get(id)
                    const starred = m.shortlist[id] !== undefined
                    const gone = !!sale || unsold.has(id)
                    return (
                      <li key={id}>
                        <PlayerRow
                          p={p}
                          as="div"
                          onClick={() => setInfo(id)}
                          extra={
                            sale ? (
                              <strong>
                                {teamShort(sale.teamId)} · {bidPrice(sale.price)}
                              </strong>
                            ) : unsold.has(id) ? (
                              <span className="warn">Unsold</span>
                            ) : (
                              <>Worth about {bidPrice(askingSalary(p))}</>
                            )
                          }
                          side={
                            gone ? undefined : (
                              <button
                                className={`star-btn ${starred ? 'on' : ''}`}
                                aria-pressed={starred}
                                aria-label={starred ? `Unstar ${p.name}` : `Star ${p.name}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  auctionToggleStar(id)
                                }}
                              >
                                {starred ? '★' : '☆'}
                              </button>
                            )
                          }
                        />
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
      {infoP && <PlayerSheet p={infoP} onClose={() => setInfo(null)} />}
    </>
  )
}

function Clubs({ career, m }: { career: Career; m: MegaState }) {
  const me = career.manager.teamId
  const rows = teams
    .map((t) => {
      const squad = squadOf(career.players, t.id)
      return {
        t,
        purse: m.purses[t.id] ?? 0,
        n: squad.length,
        overseas: squad.filter((p) => p.overseas).length,
        keep: (m.retained[t.id] ?? []).map(
          (id) => career.players.find((p) => p.id === id)?.name ?? '',
        ),
      }
    })
    .sort((a, b) => b.purse - a.purse)
  return (
    <ul className="club-list">
      {rows.map(({ t, purse, n, overseas, keep }) => (
        <li key={t.id} className={t.id === me ? 'mine' : ''}>
          <Crest crest={t.crest} colors={t.colors} size={36} />
          <span className="club-main">
            <strong>{t.name}</strong>
            <small className="dim">Kept: {keep.join(', ') || 'nobody'}</small>
          </span>
          <span className="club-nums">
            <b className="money">{crore(purse)}</b>
            <small>
              {n} players · {overseas} os
            </small>
          </span>
        </li>
      ))}
    </ul>
  )
}

function Sold({ career, m }: { career: Career; m: MegaState }) {
  const me = career.manager.teamId
  const [mine, setMine] = useState(false)
  const rows = [...m.sold].reverse().filter((s) => !mine || s.teamId === me)
  return (
    <>
      <div className="filters">
        <button className={!mine ? 'on' : ''} onClick={() => setMine(false)}>
          All sales
        </button>
        <button className={mine ? 'on' : ''} onClick={() => setMine(true)}>
          My signings
        </button>
      </div>
      {rows.length === 0 && <p className="dim">Nothing sold yet.</p>}
      <ul className="list sold-list">
        {rows.slice(0, 80).map((s) => {
          const p = career.players.find((x) => x.id === s.playerId)
          const t = teamById.get(s.teamId)
          return (
            <li key={s.playerId} className={s.teamId === me ? 'mine' : ''}>
              <span>
                <strong>{p?.name}</strong>
                <small className="dim">
                  {p ? roleLabel(p) : ''} · {p ? overallRating(p) : ''}
                </small>
              </span>
              <span className="sold-to">
                {t && <Crest crest={t.crest} colors={t.colors} size={22} />}
                <b>{bidPrice(s.price)}</b>
              </span>
            </li>
          )
        })}
      </ul>
      {m.unsold.length > 0 && (
        <p className="dim">
          {m.unsold.length} unsold so far; they come back in the accelerated round.
        </p>
      )}
    </>
  )
}

// --- The end -------------------------------------------------------------------------

function Finished({ career, m }: { career: Career; m: MegaState }) {
  const navigate = useNavigate()
  const me = career.manager.teamId
  const squad = squadOf(career.players, me).sort((a, b) => overallRating(b) - overallRating(a))
  const retained = new Set(m.retained[me] ?? [])
  const bought = m.sold.filter((s) => s.teamId === me)
  const spent = bought.reduce((s, x) => s + x.price, 0)
  const top = [...m.sold].sort((a, b) => b.price - a.price).slice(0, 5)
  const short = squad.length < SQUAD_MIN || !squad.some((p) => p.role === 'wicketkeeper')
  return (
    <Screen
      back={{ label: 'Club', onClick: () => navigate('/') }}
      primary={{
        label: 'Start the season',
        onClick: () => {
          auctionFinish()
          navigate('/')
        },
      }}
    >
      <h1>Auction complete</h1>
      <div className="card ret-sum">
        <div className="row-between">
          <span>Kept</span>
          <strong>{retained.size}</strong>
        </div>
        <div className="row-between">
          <span>Bought</span>
          <strong>
            {bought.length} for <span className="money">{crore(spent)}</span>
          </strong>
        </div>
        <div className="row-between">
          <span>Purse left</span>
          <strong className="money">{crore(m.purses[me] ?? 0)}</strong>
        </div>
        <div className="row-between">
          <span>Squad</span>
          <strong>{squad.length}</strong>
        </div>
      </div>
      {short && (
        <p className="warn">
          Your squad is short
          {squad.some((p) => p.role === 'wicketkeeper') ? '' : ' and has no keeper'}. The league
          tops it up from the unsigned players when you start the season; you can sign more free
          agents any time.
        </p>
      )}
      <h2 className="section">Biggest buys</h2>
      <ul className="list sold-list">
        {top.map((s) => {
          const p = career.players.find((x) => x.id === s.playerId)
          return (
            <li key={s.playerId} className={s.teamId === me ? 'mine' : ''}>
              <span>
                <strong>{p?.name}</strong>
                <small className="dim">{teamShort(s.teamId)}</small>
              </span>
              <b>{bidPrice(s.price)}</b>
            </li>
          )
        })}
      </ul>
      <h2 className="section">Your squad</h2>
      <ul className="plist">
        {squad.map((p) => (
          <li key={p.id}>
            <PlayerRow
              p={p}
              as="div"
              extra={
                <>
                  {retained.has(p.id) ? 'Kept' : 'Bought'} · {crore(p.contract?.salary ?? 0)} ×{' '}
                  {p.contract?.years}
                </>
              }
            />
          </li>
        ))}
      </ul>
    </Screen>
  )
}
