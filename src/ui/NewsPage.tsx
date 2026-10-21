import { useState } from 'react'
import { SEASON } from '@/sim/calendar'
import { isMyClub, needsAction, type NewsItem, type NewsKind } from '@/sim/news'
import { respondToOffer, talkTo, useGame } from '@/state/store'
import { Chip, Screen } from './kit/kit'
import { useNextAction } from './useNextAction'

const KIND: Record<NewsKind, [string, 'plain' | 'good' | 'warn' | 'bad' | 'blue']> = {
  result: ['Result', 'blue'],
  milestone: ['Milestone', 'good'],
  injury: ['Injury', 'bad'],
  transfer: ['Transfer', 'plain'],
  trade: ['Trade', 'blue'],
  offer: ['Trade offer', 'warn'],
  morale: ['Dressing room', 'warn'],
  social: ['Social', 'plain'],
  rumour: ['Rumour', 'plain'],
  board: ['Board', 'blue'],
  contract: ['Contract', 'plain'],
}

const when = (n: NewsItem) => `${n.year} · Week ${SEASON[n.day]?.week ?? 1}`

/** Club and league news: results, transfers, trades, offers, drama. */
export function NewsPage() {
  const career = useGame((s) => s.career)
  const next = useNextAction()
  const [tab, setTab] = useState<'mine' | 'league'>('mine')
  const [message, setMessage] = useState<string | null>(null)
  if (!career) return null
  const me = career.manager.teamId
  const items = [...career.news]
    .reverse()
    .filter((n) => (tab === 'mine' ? isMyClub(n, me) : !isMyClub(n, me)))
  const pending = career.news.filter((n) => isMyClub(n, me) && needsAction(n)).length
  return (
    <Screen primary={next}>
      <h1>News</h1>
      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'mine'}
          className={tab === 'mine' ? 'active' : ''}
          onClick={() => setTab('mine')}
        >
          My club{pending ? ` (${pending})` : ''}
        </button>
        <button
          role="tab"
          aria-selected={tab === 'league'}
          className={tab === 'league' ? 'active' : ''}
          onClick={() => setTab('league')}
        >
          League
        </button>
      </div>
      {message && <p className="good">{message}</p>}
      {items.length === 0 && <p className="dim">Nothing yet. Play some matches.</p>}
      <ul className="list news">
        {items.map((n) => {
          const [label, tone] = KIND[n.kind]
          return (
            <li key={n.id} className={needsAction(n) ? 'action' : ''}>
              <span className="row-between">
                <Chip tone={tone}>{label}</Chip>
                <span className="dim">{when(n)}</span>
              </span>
              <span>{n.text}</span>
              {n.offer && n.offer.status === 'pending' && (
                <span className="button-row">
                  <button
                    className="primary"
                    onClick={() => setMessage(respondToOffer(n.id, true))}
                  >
                    Accept
                  </button>
                  <button onClick={() => setMessage(respondToOffer(n.id, false))}>Decline</button>
                </span>
              )}
              {n.offer && n.offer.status !== 'pending' && (
                <span className="dim">Offer {n.offer.status}.</span>
              )}
              {n.talk && !n.talk.done && (
                <button
                  onClick={() => {
                    talkTo(n.id)
                    setMessage('You had a word. He feels a bit better.')
                  }}
                >
                  Talk to him
                </button>
              )}
              {n.talk?.done && <span className="dim">You spoke to him.</span>}
            </li>
          )
        })}
      </ul>
    </Screen>
  )
}
