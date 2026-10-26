import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { teams } from '@/data'
import type { Career, CareerPlayer } from '@/sim/career'
import { fundsOf } from '@/sim/finance'
import {
  isWindowOpen,
  squadOf,
  TRADE_ROUNDS,
  tradeRounds,
  tradeTally,
  tradeValue,
  type TradeDeal,
  type TradeReply,
} from '@/sim/market'
import { overallRating } from '@/sim/player'
import { suggestPackage } from '@/sim/transfers'
import { proposeTrade } from '@/state/store'
import { crore, roleLabel, teamShort } from './format'
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
  const [cash, setCash] = useState(0)
  const [reply, setReply] = useState<TradeReply | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const open = isWindowOpen(career)
  const byId = (id: string) => career.players.find((p) => p.id === id)
  const mine = squadOf(career.players, me).sort((a, b) => tradeValue(b) - tradeValue(a))
  const theirs = squadOf(career.players, club).sort((a, b) => tradeValue(b) - tradeValue(a))
  const deal: TradeDeal = { club, give, get, cash }
  const tally = tradeTally(career, deal)
  const myFunds = fundsOf(career, me)
  const theirFunds = fundsOf(career, club)
  const roundsLeft = TRADE_ROUNDS - tradeRounds(career, club)
  const pct = tally.progress * 100
  const changed = () => {
    setMessage(null)
    setReply(null)
  }
  const toggle = (ids: string[], set: (v: string[]) => void, id: string) => {
    changed()
    set(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])
  }
  const pickClub = (id: string) => {
    setClub(id)
    setGet([])
    setCash(0)
    changed()
  }
  const chips = (ids: string[], set: (v: string[]) => void, pays: number) =>
    ids.length || pays > 0 ? (
      <>
        {ids.map((id) => (
          <button key={id} className="trade-chip" onClick={() => toggle(ids, set, id)}>
            {byId(id)?.name} <span aria-hidden>×</span>
          </button>
        ))}
        {pays > 0 && <span className="trade-chip cash">{crore(pays)} cash</span>}
      </>
    ) : (
      <span className="dim">Nobody yet</span>
    )
  const shown = info ? byId(info) : undefined
  const propose = (d: TradeDeal) => {
    const r = proposeTrade(d)
    setReply(r.kind === 'accept' ? null : r)
    if (r.kind === 'accept') {
      setMessage({ ok: true, text: 'Trade agreed!' })
      setGive([])
      setGet([])
      setCash(0)
    } else setMessage(null)
  }
  const payer = cash < 0 ? 'them' : 'me'
  const cashMax = Math.max(0, Math.min(3000, payer === 'me' ? myFunds : theirFunds))

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
          <div className="trade-chips">{chips(get, setGet, -cash)}</div>
        </div>
        <div className="trade-side">
          <small>You give</small>
          <div className="trade-chips">{chips(give, setGive, cash)}</div>
        </div>

        <div className="trade-cash">
          <div className="row-between">
            <div className="seg two" role="radiogroup" aria-label="Who pays cash">
              <button
                role="radio"
                aria-checked={payer === 'me'}
                className={payer === 'me' ? 'on' : ''}
                onClick={() => {
                  changed()
                  setCash(Math.abs(cash))
                }}
              >
                You pay
              </button>
              <button
                role="radio"
                aria-checked={payer === 'them'}
                className={payer === 'them' ? 'on' : ''}
                onClick={() => {
                  changed()
                  setCash(-Math.abs(cash) || -5)
                }}
              >
                They pay
              </button>
            </div>
            <b className="money">{crore(Math.abs(cash))}</b>
          </div>
          <input
            type="range"
            className="nego-slider"
            aria-label="Cash"
            min={0}
            max={cashMax}
            step={5}
            value={Math.min(cashMax, Math.abs(cash))}
            onChange={(e) => {
              changed()
              const v = Number(e.target.value)
              setCash(payer === 'me' ? v : -v)
            }}
          />
          <small className="dim">
            Club funds: you {crore(myFunds)} · {teamShort(club)} {crore(theirFunds)}
          </small>
        </div>

        <div className={`trade-balance ${tally.progress >= 1 ? 'ok' : ''}`}>
          <span className="meter" aria-label={`Deal ${Math.round(pct)}% of what they want`}>
            <span style={{ width: `${pct}%` }} />
          </span>
          <small className="dim">
            {get.length || give.length
              ? tally.progress >= 1
                ? 'Enough value: propose it.'
                : `${Math.round(pct)}% of what ${teamShort(club)} want`
              : 'Pick who you want, then what you give: players, cash or both.'}
          </small>
        </div>

        {reply?.kind === 'counter' && (
          <div className="nego-counter">
            <span>
              {reply.message}
              {reply.final && ' Their final word.'}
            </span>
            <div className="button-row">
              {reply.cash !== undefined && (
                <button
                  className="primary grow2"
                  onClick={() => {
                    const d = { ...deal, cash: reply.cash as number }
                    setCash(d.cash)
                    propose(d)
                  }}
                >
                  {reply.cash > 0 ? `Pay ${crore(reply.cash)}` : `Take ${crore(-reply.cash)}`}
                </button>
              )}
              {reply.player && (
                <button
                  className={reply.cash === undefined ? 'primary grow2' : ''}
                  onClick={() => {
                    const d = { ...deal, give: [...give, reply.player as string] }
                    setGive(d.give)
                    propose(d)
                  }}
                >
                  Add {byId(reply.player)?.name}
                </button>
              )}
              <button onClick={() => setReply(null)}>Walk away</button>
            </div>
          </div>
        )}
        {reply?.kind === 'reject' && <p className="warn">{reply.message}</p>}

        <div className="button-row">
          <button
            disabled={!get.length || !open}
            onClick={() => {
              const pack = suggestPackage(career, get)
              changed()
              if (pack) setGive(pack)
              else setMessage({ ok: false, text: 'No package of your players gets this done.' })
            }}
          >
            Make it work
          </button>
          <button
            className="primary grow2"
            disabled={!open || (!get.length && !give.length) || roundsLeft <= 0}
            onClick={() => propose(deal)}
          >
            Propose
          </button>
        </div>
        <small className="dim">
          {roundsLeft > 0
            ? `${teamShort(club)} will counter up to ${roundsLeft} more time${roundsLeft > 1 ? 's' : ''} this season.`
            : `${teamShort(club)} have stopped talking until next season.`}
        </small>
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
        Clubs want a little more value than they give up, and count cash a little below players.
        Young, high-potential players are worth more; players over 30 less. Offers for your listed
        players arrive in the{' '}
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
