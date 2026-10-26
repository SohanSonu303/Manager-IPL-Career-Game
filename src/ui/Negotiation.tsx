import { useState } from 'react'
import type { CareerPlayer } from '@/sim/career'
import { TEAM_IDS } from '@/sim/game'
import {
  agentOf,
  askingPrice,
  LOWBALL,
  offerBlocker,
  offerZone,
  preferredYears,
  talksWith,
  type OfferAnswer,
  type OfferZone,
} from '@/sim/market'
import { offerContract, useGame } from '@/state/store'
import { bidPrice } from './format'
import { Chip } from './kit/kit'

export const AGENT_TEXT = { Keen: 'keen to sign', Fair: 'fair', Tough: 'hard bargainer' } as const
export const AGENT_TONE = { Keen: 'good', Fair: 'plain', Tough: 'warn' } as const

const ZONE: Record<OfferZone, { label: string; tone: string }> = {
  deal: { label: 'Meets his ask: he signs', tone: 'good' },
  close: { label: 'Close: he may sign, or counter', tone: 'good' },
  low: { label: 'Low: expect a counter', tone: 'warn' },
  insult: { label: 'Insulting: costs patience, no counter', tone: 'bad' },
}

/** Salary step in lakh (₹0.25 cr). */
const STEP = 25

/**
 * Contract talks: pick a length (each shows his ask), set a salary with the stepper or
 * slider while the meter shows how it will land, then offer. His counters and the
 * offers he has left are always on show.
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
  const askFor = (y: number) =>
    career
      ? (talksWith(career, player.id).asks?.[y] ?? askingPrice(career, player, y, TEAM_IDS))
      : 0
  const [salary, setSalary] = useState(() => askFor(years))
  if (!career) return null
  const renewal = player.teamId === career.manager.teamId
  const agent = agentOf(career, player)
  const talks = talksWith(career, player.id)
  const ask = askFor(years)
  const zone = offerZone(salary, ask)
  const blocked = offerBlocker(career, player.id, { salary, years })
  const min = Math.max(20, Math.floor((ask * 0.5) / 5) * 5)
  const max = Math.ceil((ask * 1.1) / 5) * 5
  const pick = (y: number) => {
    setYears(y)
    setSalary(askFor(y))
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
    if (a.kind === 'counter') {
      setYears(a.years)
      setSalary(a.salary)
    }
    setAnswer(a)
  }
  return (
    <div className="card nego" style={{ marginTop: 10 }}>
      <div className="row-between">
        <strong>{renewal ? 'Extend his contract' : 'Make an offer'}</strong>
        <Chip tone={AGENT_TONE[agent.label]}>Agent: {AGENT_TEXT[agent.label]}</Chip>
      </div>
      {renewal && (
        <span className="dim">
          Now {bidPrice(player.contract?.salary ?? 0)} a season. The new seasons start after this
          one.
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

      <div className="nego-stepper">
        <button aria-label="Lower the offer" onClick={() => setSalary(Math.max(20, salary - STEP))}>
          −
        </button>
        <span>
          <small>Your offer / season</small>
          <b className="money">{bidPrice(salary)}</b>
        </span>
        <button aria-label="Raise the offer" onClick={() => setSalary(salary + STEP)}>
          +
        </button>
      </div>
      <input
        type="range"
        className="nego-slider"
        aria-label="Offer"
        min={min}
        max={max}
        step={5}
        value={Math.min(max, Math.max(min, salary))}
        onChange={(e) => setSalary(Number(e.target.value))}
      />
      <div className={`nego-meter ${ZONE[zone].tone}`}>
        <span className="nego-track">
          <span style={{ left: `${(LOWBALL * 100) / 1.1}%` }} className="nego-mark" />
          <span style={{ left: `${100 / 1.1}%` }} className="nego-mark ask" />
          <span
            className="nego-fill"
            style={{ width: `${Math.min(100, (salary / ask / 1.1) * 100)}%` }}
          />
        </span>
        <span className="row-between">
          <small>{ZONE[zone].label}</small>
          <small className="dim">Asks {bidPrice(ask)}</small>
        </span>
      </div>

      <div className="row-between nego-patience">
        <small className="dim">Patience</small>
        <span aria-label={`${Math.max(0, agent.patience - talks.rounds)} offers left`}>
          {Array.from({ length: agent.patience }, (_, i) => (
            <i key={i} className={i < agent.patience - talks.rounds ? 'on' : ''} />
          ))}
        </span>
      </div>

      <div className="button-row">
        <button
          className="primary grow2"
          onClick={() => submit(salary, years)}
          disabled={!!blocked}
        >
          Offer {bidPrice(salary)} × {years}
        </button>
        {salary !== ask && <button onClick={() => submit(ask, years)}>Meet his ask</button>}
      </div>
      {blocked && <p className="warn">{blocked}</p>}

      {answer?.kind === 'reject' && (
        <p className={answer.ended ? 'bad' : 'warn'}>
          {answer.message}
          {answer.roundsLeft !== undefined && !answer.ended
            ? ` ${answer.roundsLeft} offer${answer.roundsLeft === 1 ? '' : 's'} left before his final word.`
            : ''}
        </p>
      )}
      {answer?.kind === 'counter' && (
        <div className={`nego-counter ${answer.final ? 'final' : ''}`}>
          <span>
            {answer.message} He asks <b>{bidPrice(answer.salary)}</b> for {answer.years} season
            {answer.years > 1 ? 's' : ''}.
          </span>
          <button className="primary" onClick={() => submit(answer.salary, answer.years)}>
            Accept {bidPrice(answer.salary)} × {answer.years}
          </button>
        </div>
      )}
    </div>
  )
}
