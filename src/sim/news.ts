import type { Career } from './career'

/*
 * The news feed: the manager's club and the rest of the league. Results, transfers and
 * trades, injuries, unhappy players, social-media drama, and items the manager can act
 * on (trade offers, a word with an unhappy player).
 */

export type NewsKind =
  | 'result'
  | 'milestone'
  | 'injury'
  | 'transfer'
  | 'trade'
  | 'offer'
  | 'morale'
  | 'social'
  | 'rumour'
  | 'board'
  | 'contract'

export interface TradeOffer {
  fromTeamId: string
  /** The manager's players the other club wants. */
  give: string[]
  /** The players offered in return. */
  get: string[]
  /** Lakh, as in a trade deal: negative when the club pays the manager. */
  cash?: number
  status: 'pending' | 'accepted' | 'declined' | 'expired'
}

export interface NewsItem {
  id: string
  year: number
  day: number
  kind: NewsKind
  /** Clubs involved (the first is the main subject). */
  teamIds: string[]
  text: string
  playerId?: string
  offer?: TradeOffer
  /** An unhappy player the manager can talk to. */
  talk?: { playerId: string; done: boolean }
}

export const MAX_NEWS = 250

/** Add news items (newest last), keeping the feed to a fixed size. */
export function addNews(career: Career, ...items: Omit<NewsItem, 'id' | 'year' | 'day'>[]): Career {
  if (!items.length) return career
  const { year, day } = career.calendar
  const start = career.news.length
  const added = items.map((n, i) => ({
    ...n,
    id: `${year}-${day}-${start + i}-${n.kind}`,
    year,
    day,
  }))
  return { ...career, news: [...career.news, ...added].slice(-MAX_NEWS) }
}

export function updateNews(career: Career, id: string, change: (n: NewsItem) => NewsItem): Career {
  return { ...career, news: career.news.map((n) => (n.id === id ? change(n) : n)) }
}

/** Is this item about the manager's club? */
export const isMyClub = (n: NewsItem, teamId: string) => n.teamIds.includes(teamId)

/** Items waiting for the manager (pending offers, unanswered unhappy players). */
export const needsAction = (n: NewsItem) => n.offer?.status === 'pending' || n.talk?.done === false
