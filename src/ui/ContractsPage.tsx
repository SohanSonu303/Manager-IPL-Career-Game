import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { RETAIN_MAX } from '@/sim/auction'
import type { Career, CareerPlayer } from '@/sim/career'
import { contractOutlook, type ExpiringRow } from '@/sim/contracts'
import { TEAM_IDS } from '@/sim/game'
import { capRoom, SQUAD_MIN, squadOf } from '@/sim/market'
import { continueGame, letGo, listPlayer, release, useGame } from '@/state/store'
import { bidPrice, crore } from './format'
import { Chip, Screen } from './kit/kit'
import { AGENT_TONE } from './Negotiation'
import { Negotiation } from './Negotiation'
import { PlayerRow, PlayerSheet } from './PlayerRow'
import { useNextAction } from './useNextAction'

const RETIRE_LABEL = { retiring: 'Retiring', likely: 'Likely to retire', possible: 'May retire' }

/**
 * Contracts: who is in his final year (renew or let go), who is retiring, and what the
 * squad looks like next season. Also the "Before next season" check (`?confirm=1`).
 */
export function ContractsPage() {
  const career = useGame((s) => s.career)
  const next = useNextAction()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  if (!career) return null
  const confirmIt = params.get('confirm') === '1' && !!career.season.review && !career.mega
  const o = contractOutlook(career, TEAM_IDS)
  return (
    <Screen
      primary={
        confirmIt
          ? {
              label: o.megaYear ? 'Mega auction' : `Start ${career.calendar.year + 1}`,
              onClick: () => {
                continueGame()
                navigate(o.megaYear ? '/auction' : '/', { replace: true })
              },
            }
          : next
      }
    >
      <h1>{confirmIt ? 'Before next season' : 'Contracts'}</h1>
      {confirmIt && (
        <p className="dim">
          {o.megaYear
            ? 'The season is over. Next comes the mega auction.'
            : o.undecided.length
              ? `${o.undecided.length} player${o.undecided.length > 1 ? 's are' : ' is'} out of contract and still waiting to hear from you. Renew them now or they leave.`
              : 'Here is who leaves when the new season starts.'}
        </p>
      )}
      <ContractsPanel career={career} />
    </Screen>
  )
}

/** The contracts desk (also the Market's Contracts tab). */
export function ContractsPanel({ career }: { career: Career }) {
  const o = contractOutlook(career, TEAM_IDS)
  const me = career.manager.teamId
  const [openId, setOpenId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const open = career.players.find((p) => p.id === openId)
  const row = o.expiring.find((r) => r.p.id === openId)
  const ending = o.expiring.filter((r) => r.status !== 'retiring')
  const all = squadOf(career.players, me).sort(
    (a, b) =>
      (a.contract?.years ?? 0) - (b.contract?.years ?? 0) ||
      (b.contract?.salary ?? 0) - (a.contract?.salary ?? 0),
  )
  const listed = new Set(career.market.listed ?? [])
  const done = (m: string) => {
    setMessage(m)
    setOpenId(null)
  }
  return (
    <>
      {o.megaYear ? (
        <div className="card contracts-mega">
          <strong>Mega auction after this season</strong>
          <span className="dim">
            Contracts don't matter this year: you keep up to {RETAIN_MAX} players at the retention,
            and everyone else goes into the auction. Retirements still happen.
          </span>
        </div>
      ) : (
        <div className="card contracts-sum">
          <div className="row-between">
            <span>Contracts ending this season</span>
            <strong className={ending.length ? 'warn' : ''}>{ending.length}</strong>
          </div>
          <div className="row-between">
            <span>Still to decide</span>
            <strong className={o.undecided.length ? 'warn' : 'good'}>
              {o.undecided.length || 'None'}
            </strong>
          </div>
          <div className="row-between">
            <span>Squad next season (as things stand)</span>
            <strong className={o.squadAfter < SQUAD_MIN ? 'warn' : ''}>
              {o.squadAfter} of {o.squadNow}
            </strong>
          </div>
          <div className="row-between">
            <span>Cap room</span>
            <strong className="money">{crore(capRoom(career.players, me))}</strong>
          </div>
          {o.keepersAfter === 0 && <span className="warn">No wicketkeeper left next season.</span>}
          {o.squadAfter < SQUAD_MIN && (
            <span className="warn">
              Below the {SQUAD_MIN}-player minimum: renew, or sign replacements in Needs.
            </span>
          )}
        </div>
      )}
      {message && <p className="good">{message}</p>}

      {!o.megaYear && (
        <>
          <h2 className="section">Final year</h2>
          {ending.length === 0 && <p className="dim">Nobody's contract ends this season.</p>}
          <ul className="plist">
            {ending.map((r) => (
              <li key={r.p.id}>
                <ExpiringPlayer row={r} onOpen={() => setOpenId(r.p.id)} />
              </li>
            ))}
          </ul>
        </>
      )}

      {o.retiring.length > 0 && (
        <>
          <h2 className="section">Retirements</h2>
          <ul className="plist">
            {o.retiring.map(({ p, outlook }) => (
              <li key={p.id}>
                <PlayerRow
                  p={p}
                  onClick={() => setOpenId(p.id)}
                  extra={
                    <Chip tone={outlook === 'possible' ? 'plain' : 'bad'}>
                      {RETIRE_LABEL[outlook]}
                    </Chip>
                  }
                />
              </li>
            ))}
          </ul>
          <p className="dim">
            Retirements are decided at the end of the season. Plan replacements in Needs.
          </p>
        </>
      )}

      {o.renewed.length > 0 && (
        <>
          <h2 className="section">Renewed this season</h2>
          <ul className="list">
            {o.renewed.map((p) => (
              <li key={p.id} className="row-between">
                <span>
                  <Chip tone="good">✓</Chip> {p.name}
                </span>
                <span className="dim">
                  {bidPrice(p.contract?.salary ?? 0)} · {p.contract?.years} seasons left
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <details className="contracts-all">
        <summary>All contracts ({all.length})</summary>
        <ul className="list">
          {all.map((p) => (
            <li key={p.id}>
              <button className="contracts-line" onClick={() => setOpenId(p.id)}>
                <span>
                  {p.name}
                  {listed.has(p.id) && <Chip tone="blue">Listed</Chip>}
                </span>
                <span className={(p.contract?.years ?? 0) <= 1 ? 'warn' : 'dim'}>
                  {bidPrice(p.contract?.salary ?? 0)} · {p.contract?.years} yr
                </span>
              </button>
            </li>
          ))}
        </ul>
      </details>

      {open && (
        <PlayerSheet
          p={open}
          onClose={() => setOpenId(null)}
          actions={
            <OwnPlayerActions
              career={career}
              p={open}
              row={row}
              listed={listed.has(open.id)}
              onDone={done}
            />
          }
        />
      )}
    </>
  )
}

function ExpiringPlayer({ row, onOpen }: { row: ExpiringRow; onOpen: () => void }) {
  const { p, status } = row
  return (
    <PlayerRow
      p={p}
      as="div"
      onClick={onOpen}
      extra={
        <>
          {bidPrice(p.contract?.salary ?? 0)} → asks{' '}
          <span className="money">{bidPrice(row.ask)}</span>
          <Chip tone={AGENT_TONE[row.agent.label]}>{row.agent.label}</Chip>
          {row.rescued && status !== 'open' && <Chip>Kept 1 yr (squad minimum)</Chip>}
        </>
      }
      side={
        status === 'open' ? (
          <span className="ret-check on renew-btn">Renew</span>
        ) : (
          <Chip tone={status === 'letGo' ? 'warn' : 'bad'}>
            {status === 'letGo' ? 'Leaving' : 'Talks off'}
          </Chip>
        )
      }
    />
  )
}

/** Renew, let go, list for trade or release one of your players. */
export function OwnPlayerActions({
  career,
  p,
  row,
  listed,
  onDone,
}: {
  career: Career
  p: CareerPlayer
  row?: ExpiringRow
  listed: boolean
  onDone: (message: string) => void
}) {
  const navigate = useNavigate()
  const finalYear = (p.contract?.years ?? 0) <= 1
  if (career.mega) return <p className="dim">Contracts wait until the mega auction is over.</p>
  return (
    <>
      {finalYear && row?.status !== 'retiring' && (
        <>
          {row?.status === 'letGo' ? (
            <p className="warn">You've decided to let him go when his contract ends.</p>
          ) : (
            <Negotiation player={p} onSigned={onDone} />
          )}
          <button
            style={{ width: '100%', marginTop: 10 }}
            onClick={() => {
              letGo(p.id, row?.status !== 'letGo')
              onDone(
                row?.status === 'letGo'
                  ? `You can talk to ${p.name} about a new deal again.`
                  : `${p.name} will leave when his contract ends.`,
              )
            }}
          >
            {row?.status === 'letGo' ? 'Reopen talks' : "Don't renew: let him go"}
          </button>
        </>
      )}
      {!finalYear && (
        <p className="dim">
          Under contract for {p.contract?.years} more seasons. You can extend his deal in his final
          year.
        </p>
      )}
      <div className="button-row" style={{ marginTop: 10 }}>
        <button
          onClick={() => {
            const offers = listPlayer(p.id, !listed)
            onDone(
              listed
                ? `${p.name} is off the transfer list.`
                : offers
                  ? `${p.name} is on the transfer list: ${offers} offer${offers > 1 ? 's' : ''} in the News.`
                  : `${p.name} is on the transfer list. Clubs make offers in the trade window.`,
            )
          }}
        >
          {listed ? 'Take off the list' : 'Transfer list'}
        </button>
        <button onClick={() => navigate(`/market?tab=trade&give=${p.id}`)}>Trade him</button>
        <button
          className="danger"
          onClick={() => {
            if (!confirm(`Release ${p.name}? His salary comes off your payroll.`)) return
            onDone(release(p.id) ?? `${p.name} released.`)
          }}
        >
          Release
        </button>
      </div>
    </>
  )
}
