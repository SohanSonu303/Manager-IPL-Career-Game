import { useState } from 'react'
import type { CareerPlayer } from '@/sim/career'
import { TEAM_IDS } from '@/sim/game'
import {
  agentOf,
  askingPrice,
  formRaise,
  OFFER_MIN,
  offerBlocker,
  preferredYears,
  talksWith,
  type OfferAnswer,
} from '@/sim/market'
import { declineTerms, offerContract, useGame } from '@/state/store'
import { bidPrice } from './format'
import { Chip } from './kit/kit'

export const AGENT_TEXT = { Keen: 'keen to sign', Fair: 'fair', Tough: 'hard bargainer' } as const
export const AGENT_TONE = { Keen: 'good', Fair: 'plain', Tough: 'warn' } as const

const pct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.round(Math.abs(x) * 100)}%`

/**
 * Contract talks, kept simple: he names his price for each length, you may offer a little
 * less with the slider, and he either signs or makes one counter (take it or leave it).
 */
export function Negotiation({
  player,
  onSigned,
}: {
  player: CareerPlayer
  onSigned: (message: string) => void
}) {
  const career = useGame((s) => s.career)
  const [years, setYears] = useState(preferredYears(player.age))
  const [answer, setAnswer] = useState<OfferAnswer | null>(null)
  const askFor = (y: number) => (career ? askingPrice(career, player, y, TEAM_IDS) : 0)
  const [salary, setSalary] = useState(() => askFor(years))
  if (!career) return null
  const renewal = player.teamId === career.manager.teamId
  const agent = agentOf(career, player)
  const talks = talksWith(career, player.id)
  const ask = askFor(years)
  const min = Math.max(20, Math.ceil((ask * OFFER_MIN) / 5) * 5)
  const blocked = offerBlocker(career, player.id, { salary, years })
  const pick = (y: number) => {
    setYears(y)
    setSalary(askFor(y))
    setAnswer(null)
  }
  const submit = (s: number, y: number) => {
    const a = offerContract(player.id, { salary: s, years: y })
    if (a.kind === 'accept') {
      onSigned(
        renewal
          ? `${player.name} extends for ${y} more season${y > 1 ? 's' : ''} at ${bidPrice(s)}.`
          : `${player.name} signs for ${bidPrice(s)} a season, ${y} season${y > 1 ? 's' : ''}.`,
      )
    }
    setAnswer(a)
  }
  const raise = formRaise(player.form)
  return (
    <div className="card nego" style={{ marginTop: 10 }}>
      <div className="row-between">
        <strong>{renewal ? 'New contract' : 'Make an offer'}</strong>
        <Chip tone={AGENT_TONE[agent.label]}>Agent: {AGENT_TEXT[agent.label]}</Chip>
      </div>
      {renewal && (
        <span className="dim">
          Now {bidPrice(player.contract?.salary ?? 0)} a season. Form {Math.round(player.form)}: he
          asks {pct(raise)}
          {raise < 0 ? ' (a pay cut)' : ''}. The new seasons start after this one.
        </span>
      )}

      <div className="nego-lengths" role="radiogroup" aria-label="Contract length">
        {[1, 2, 3].map((y) => (
          <button
            key={y}
            role="radio"
            aria-checked={years === y}
            className={years === y ? 'on' : ''}
            onClick={() => pick(y)}
          >
            <b>
              {y} season{y > 1 ? 's' : ''}
            </b>
            <small>{bidPrice(askFor(y))}</small>
          </button>
        ))}
      </div>

      {answer?.kind === 'counter' ? (
        <div className="nego-counter final">
          <span>
            {answer.message} He'll sign for <b>{bidPrice(answer.salary)}</b> a season,{' '}
            {answer.years} season{answer.years > 1 ? 's' : ''}. Take it or leave it.
          </span>
          <div className="button-row">
            <button className="primary grow2" onClick={() => submit(answer.salary, answer.years)}>
              Accept {bidPrice(answer.salary)}
            </button>
            <button
              onClick={() => {
                declineTerms(player.id)
                setAnswer({ kind: 'reject', message: `${player.name} ends talks for now.` })
              }}
            >
              Decline
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="row-between nego-offer">
            <small className="dim">Your offer / season</small>
            <b className="money">{bidPrice(salary)}</b>
          </div>
          <input
            type="range"
            className="nego-slider"
            aria-label="Offer"
            min={min}
            max={ask}
            step={5}
            value={Math.min(ask, Math.max(min, salary))}
            onChange={(e) => setSalary(Number(e.target.value))}
          />
          <small className="dim">
            {salary >= ask
              ? 'His asking price: he signs.'
              : talks.final
                ? 'He has made his counter: offer less than it and he walks.'
                : 'Below his ask: he may sign, or come back once with a counter.'}
          </small>
          <button className="primary" onClick={() => submit(salary, years)} disabled={!!blocked}>
            Offer {bidPrice(salary)} × {years}
          </button>
          {blocked && <p className="warn">{blocked}</p>}
        </>
      )}

      {answer?.kind === 'reject' && (
        <p className={answer.ended ? 'bad' : 'warn'}>{answer.message}</p>
      )}
    </div>
  )
}
