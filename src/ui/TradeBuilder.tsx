import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { teams } from '@/data'
import type { Career, CareerPlayer } from '@/sim/career'
import { evaluateTrade, isWindowOpen, squadOf, tradeValue } from '@/sim/market'
import { overallRating } from '@/sim/player'
import { suggestPackage, tradeBalance } from '@/sim/transfers'
import { proposeTrade } from '@/state/store'
import { roleLabel, teamShort } from './format'
import { Chip, RatingRing } from './kit/kit'
import { PlayerSheet } from './PlayerRow'

/**
 * Build a trade: pick a club, tap players on both sides, watch the balance bar and the
 * club's verdict live, let "Make it work" find a package, then propose.
 */
export function TradeBuilder({
  career,
  initialGet,
  initialGive,
}: {
  career: Career
  initialGet?: string
  initialGive?: string
}) {
  const navigate = useNavigate()
  const me = career.manager.teamId
  const others = teams.filter((t) => t.id !== me)
  const startClub = career.players.find((p) => p.id === initialGet)?.teamId ?? others[0]?.id ?? ''
  const [club, setClub] = useState(startClub)
  const [get, setGet] = useState<string[]>(initialGet ? [initialGet] : [])
  const [give, setGive] = useState<string[]>(initialGive ? [initialGive] : [])
  const [side, setSide] = useState<'theirs' | 'mine'>(
    initialGet || !initialGive ? 'theirs' : 'mine',
  )
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const open = isWindowOpen(career)
  const byId = (id: string) => career.players.find((p) => p.id === id)
  const mine = squadOf(career.players, me).sort((a, b) => tradeValue(b) - tradeValue(a))
  const theirs = squadOf(career.players, club).sort((a, b) => tradeValue(b) - tradeValue(a))
  const balance = tradeBalance(career, give, get)
  const verdict = give.length && get.length ? evaluateTrade(career, give, get) : null
  const pct = balance.target ? Math.min(100, (balance.give / balance.target) * 100) : 0
  const toggle = (ids: string[], set: (v: string[]) => void, id: string) => {
    setMessage(null)
    set(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])
  }
  const pickClub = (id: string) => {
    setClub(id)
    setGet([])
    setMessage(null)
  }
  const chips = (ids: string[], set: (v: string[]) => void) =>
    ids.length ? (
      ids.map((id) => (
        <button key={id} className="trade-chip" onClick={() => toggle(ids, set, id)}>
          {byId(id)?.name} <span aria-hidden>×</span>
        </button>
      ))
    ) : (
      <span className="dim">Nobody yet</span>
    )
  const shown = info ? byId(info) : undefined

  return (
    <>
      {!open && (
        <p className="warn">
          {career.mega
            ? 'Trades wait until the mega auction is over.'
            : 'The trade window is shut: trades run in the preseason and after the season. You can still plan one.'}
        </p>
      )}
      <div className="filters club-pick" role="radiogroup" aria-label="Club">
        {others.map((t) => (
          <button
            key={t.id}
            role="radio"
            aria-checked={club === t.id}
            className={club === t.id ? 'on' : ''}
            onClick={() => pickClub(t.id)}
          >
            {t.short}
          </button>
        ))}
      </div>

      <div className="card trade-deal">
        <div className="trade-side">
          <small>You get from {teamShort(club)}</small>
          <div className="trade-chips">{chips(get, setGet)}</div>
        </div>
        <div className="trade-side">
          <small>You give</small>
          <div className="trade-chips">{chips(give, setGive)}</div>
        </div>
        <div className={`trade-balance ${verdict?.ok ? 'ok' : ''}`}>
          <span className="meter">
            <span style={{ width: `${pct}%` }} />
          </span>
          <small className="dim">
            {get.length
              ? `Value: you offer ${Math.round(balance.give)} · they want ${Math.round(balance.target)}`
              : 'Pick who you want, then what you give.'}
          </small>
        </div>
        {verdict && (
          <span className={verdict.ok ? 'good' : 'warn'}>
            {verdict.ok ? `${teamShort(club)} would accept this.` : verdict.reason}
          </span>
        )}
        <div className="button-row">
          <button
            disabled={!get.length || !open}
            onClick={() => {
              const pack = suggestPackage(career, get)
              if (pack) {
                setGive(pack)
                setMessage(null)
              } else setMessage({ ok: false, text: 'No package of your players gets this done.' })
            }}
          >
            Make it work
          </button>
          <button
            className="primary grow2"
            disabled={!open || !verdict?.ok}
            onClick={() => {
              const r = proposeTrade(give, get)
              setMessage(r.ok ? { ok: true, text: 'Trade agreed!' } : { ok: false, text: r.reason })
              if (r.ok) {
                setGive([])
                setGet([])
              }
            }}
          >
            Propose trade
          </button>
        </div>
        {message && <p className={message.ok ? 'good' : 'warn'}>{message.text}</p>}
      </div>

      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={side === 'theirs'}
          className={side === 'theirs' ? 'active' : ''}
          onClick={() => setSide('theirs')}
        >
          {teamShort(club)} squad
        </button>
        <button
          role="tab"
          aria-selected={side === 'mine'}
          className={side === 'mine' ? 'active' : ''}
          onClick={() => setSide('mine')}
        >
          Your squad
        </button>
      </div>
      <ul className="plist trade-list">
        {(side === 'theirs' ? theirs : mine).map((p) => {
          const ids = side === 'theirs' ? get : give
          const set = side === 'theirs' ? setGet : setGive
          return (
            <li key={p.id}>
              <TradePick
                p={p}
                on={ids.includes(p.id)}
                listed={(career.market.listed ?? []).includes(p.id)}
                onToggle={() => toggle(ids, set, p.id)}
                onInfo={() => setInfo(p.id)}
              />
            </li>
          )
        })}
      </ul>
      <p className="dim">
        Clubs want a little more value than they give up. Young, high-potential players are worth
        more; players over 30 less. Offers for your listed players arrive in the{' '}
        <button className="linkish" onClick={() => navigate('/news')}>
          News
        </button>
        .
      </p>
      {shown && <PlayerSheet p={shown} onClose={() => setInfo(null)} />}
    </>
  )
}

function TradePick({
  p,
  on,
  listed,
  onToggle,
  onInfo,
}: {
  p: CareerPlayer
  on: boolean
  listed: boolean
  onToggle: () => void
  onInfo: () => void
}) {
  return (
    <div className={`trade-pick ${on ? 'on' : ''}`}>
      <button className="trade-pick-main" onClick={onToggle} aria-pressed={on}>
        <RatingRing value={overallRating(p)} size={38} />
        <span className="grow2">
          <strong>{p.name}</strong>
          <small>
            {roleLabel(p)} · {p.age}
            {p.overseas && ' · overseas'}
            {p.injury && ' · injured'}
          </small>
        </span>
        {listed && <Chip tone="blue">Listed</Chip>}
        <span className="trade-value">{Math.round(tradeValue(p))}</span>
      </button>
      <button className="icon-btn info-btn" aria-label={`Details: ${p.name}`} onClick={onInfo}>
        i
      </button>
    </div>
  )
}
