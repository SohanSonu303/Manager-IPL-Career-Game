import { create } from 'zustand'
import { careerAchievements, unlock } from '@/sim/achievements'
import {
  autoAuction,
  confirmRetention,
  nextLot,
  retentionBlocker,
  defaultMax,
  setAutoBid,
  setShortlist,
  setStopForShortlist,
  simAuction,
  type SimResult,
  hammer,
  placeBid,
  rivalRaise,
  userPass,
} from '@/sim/auction'
import { today } from '@/sim/calendar'
import type { Career, Lineup } from '@/sim/career'
import {
  continueCareer,
  ensureEleven,
  finishMega,
  playToday,
  quickSim,
  recordFixture,
  setupFixture,
  startCareer as newGame,
  talkToPlayer,
  TEAM_IDS,
  userFixtureToday,
} from '@/sim/game'
import type { Fixture } from '@/sim/league'
import {
  aiTradeOffers,
  answerTradeOffer,
  evaluateTrade,
  executeTrade,
  isWindowOpen,
  makeOffer,
  releaseBlocker,
  releasePlayer,
  setLetGo,
  setListed,
  type Offer,
  type OfferAnswer,
  type TradeAnswer,
} from '@/sim/market'
import type { Match } from '@/sim/match/engine'
import { applyPostMatch, type PlayerReport } from '@/sim/match/postMatch'
import type { MatchState } from '@/sim/match/types'
import { createRng, deriveSeed } from '@/sim/rng'
import { parseSave } from './save'
import { clearSave, readSave, writeSave } from './storage'

export interface GameState {
  /** The saved career (plain serializable data). */
  career: Career | null
  /** The manager's match in progress (memory only; replayable from its seed). */
  live: { fixture: Fixture; match: Match } | null
  /** Last save/load problem to show the player, or null. */
  notice: string | null
}

export const useGame = create<GameState>(() => ({ career: null, live: null, notice: null }))

/** Set the career (with any achievements it has now earned) and auto-save it. */
function commit(next: Career) {
  const career = unlock(next, careerAchievements(next))
  const result = writeSave(career)
  useGame.setState({ career, notice: result.ok ? null : result.error })
}

const current = () => useGame.getState().career

/** Load the saved career on app start. */
export function loadSavedCareer() {
  const r = readSave()
  switch (r.status) {
    case 'ok':
      useGame.setState({ career: r.career, notice: null })
      break
    case 'damaged':
      useGame.setState({
        notice: `Your saved career could not be loaded (${r.error}) It was kept aside; import a backup or start again.`,
      })
      break
    case 'unavailable':
      useGame.setState({
        notice: 'Saving is not available in this browser. Use Export to keep your career.',
      })
      break
    case 'empty':
      break
  }
}

function randomSeed(): number {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0] ?? 1
}

export function startCareer(teamId: string, managerName: string) {
  commit(newGame({ seed: randomSeed(), teamId, managerName: managerName.trim() || 'Manager' }))
}

/** Continue to the next event (other matches today are simulated on the way). */
export function continueGame() {
  const c = current()
  if (c) commit(continueCareer(c))
}

/** Simulate the manager's own match today without watching. */
export function quickSimMyMatch() {
  const c = current()
  const f = c && userFixtureToday(c)
  // The rest of today's round is played straight away, so the table is up to date.
  if (c && f) commit(playToday(quickSim(c, f)))
}

/** Start watching/playing the manager's match today. */
export function startMyMatch(): boolean {
  let c = current()
  const f = c && userFixtureToday(c)
  if (!c || !f) return false
  c = ensureEleven(ensureEleven(c, f.homeId), f.awayId)
  commit(c)
  const match = setupFixture(c, f)
  // The manager is watching: he calls the toss, reviews and timeouts himself.
  match.state.interactive = true
  useGame.setState({ live: { fixture: f, match } })
  return true
}

/** Record the finished live match and return to the club. */
export function finishMyMatch() {
  const { career, live } = useGame.getState()
  if (!career || !live?.match.state.result) return
  commit(playToday(recordFixture(career, live.fixture, live.match.state)))
  useGame.setState({ live: null })
}

/** Debug: play on (quick-simming the manager's matches) to the end of this season. */
export function simToSeasonEnd() {
  let c = current()
  if (!c) return
  for (
    let guard = 0;
    guard < 200 && c.status === 'active' && today(c.calendar).event?.type !== 'seasonEnd';
    guard++
  ) {
    const mine = userFixtureToday(c)
    c = mine ? quickSim(c, mine) : continueCareer(c)
  }
  commit(c)
}

/** Save the manager's XI, batting order, keeper and default intent. */
export function setLineup(lineup: Lineup | undefined) {
  const c = current()
  if (c) commit({ ...c, lineup })
}

// --- Market -----------------------------------------------------------------------

export function offerContract(playerId: string, offer: Offer): OfferAnswer {
  const c = current()
  if (!c) return { kind: 'reject', message: 'No career.' }
  const { career, answer } = makeOffer(c, playerId, offer, TEAM_IDS)
  commit(career)
  return answer
}

export function release(playerId: string): string | null {
  const c = current()
  if (!c) return 'No career.'
  const blocked = releaseBlocker(c, playerId)
  if (blocked) return blocked
  commit(releasePlayer(c, playerId))
  return null
}

/** Decide not to renew a final-year player (or change your mind). */
export function letGo(playerId: string, on: boolean) {
  const c = current()
  if (c) commit(setLetGo(c, playerId, on))
}

/**
 * Put a player on the transfer list (or take him off). In the window, clubs answer
 * straight away; otherwise they make their offers when it opens. Returns the offers made.
 */
export function listPlayer(playerId: string, on: boolean): number {
  const c = current()
  if (!c) return 0
  let next = setListed(c, playerId, on)
  if (on && isWindowOpen(next)) {
    const rng = createRng(deriveSeed(c.seed, 'listed', playerId, c.calendar.year, c.calendar.day))
    next = aiTradeOffers(next, TEAM_IDS, rng, 2, playerId)
  }
  commit(next)
  const offers = (x: Career) =>
    x.news.filter((n) => n.offer?.status === 'pending' && n.offer.give.includes(playerId)).length
  return offers(next) - offers(c)
}

/** Accept or decline an AI club's trade offer from the news feed. */
export function respondToOffer(newsId: string, accept: boolean): string {
  const c = current()
  if (!c) return 'No career.'
  const { career, message } = answerTradeOffer(c, newsId, accept)
  commit(career)
  return message
}

/** Have a word with an unhappy player. */
export function talkTo(newsId: string) {
  const c = current()
  if (c) commit(talkToPlayer(c, newsId))
}

export function proposeTrade(give: string[], get: string[]): TradeAnswer {
  const c = current()
  if (!c) return { ok: false, reason: 'No career.' }
  const answer = evaluateTrade(c, give, get)
  if (answer.ok) commit(executeTrade(c, give, get))
  return answer
}

// --- Mega auction -----------------------------------------------------------------

/** Run a pure auction step on the saved career and save the result. */
function auctionStep(step: (c: Career) => Career) {
  const c = current()
  if (c?.mega) commit(step(c))
}

/** Lock in the manager's retentions (the AI clubs keep theirs) and open the auction. */
export function retainPlayers(ids: string[]): string | null {
  const c = current()
  if (!c) return 'No career.'
  const blocked = retentionBlocker(c, ids)
  if (blocked) return blocked
  commit(nextLot(confirmRetention(c, ids)))
  return null
}

export const auctionNextLot = () => auctionStep(nextLot)
/** The manager raises; the rivals answer on the auction clock. */
export const auctionBid = () => auctionStep(placeBid)
export const auctionPass = () => auctionStep(userPass)
export const auctionHammer = () => auctionStep(hammer)

/** One rival's turn on the clock. True if someone raised. */
export function auctionRivalRaise(): boolean {
  const c = current()
  if (!c?.mega?.lot) return false
  const r = rivalRaise(c)
  if (r.raised) commit(r.career)
  return r.raised
}
/** Shortlist a player with the most he may cost (null: take him off). */
export const auctionShortlist = (playerId: string, max: number | null) =>
  auctionStep((c) => setShortlist(c, playerId, max))
/** Star or unstar a player; a new star starts at a little over his market value. */
export function auctionToggleStar(playerId: string) {
  auctionStep((c) => {
    const p = c.players.find((x) => x.id === playerId)
    if (!p) return c
    return setShortlist(
      c,
      playerId,
      c.mega?.shortlist[playerId] === undefined ? defaultMax(p) : null,
    )
  })
}
export const auctionAutoBid = (on: boolean) => auctionStep((c) => setAutoBid(c, on))
export const auctionStopForShortlist = (on: boolean) =>
  auctionStep((c) => setStopForShortlist(c, on))

export type SimReport = Omit<SimResult, 'career'>

/** Sim on: just this lot (no argument), up to a set, or to the end. */
export function auctionSim(toSet?: number | 'end'): SimReport | null {
  const c = current()
  if (!c?.mega) return null
  const { career, ...report } = simAuction(c, toSet)
  commit(career)
  return report
}

/** Hands-off: sensible retentions, the captain bids, to the end. */
export function auctionAuto() {
  auctionStep(autoAuction)
}

/** Close the auction: squads are topped up and the new season can start. */
export function auctionFinish() {
  auctionStep(finishMega)
}

// --- Debug friendlies and saves ------------------------------------------------------

/** Apply a debug friendly to the career (fitness, form, injuries, ratings). */
export function applyMatchToCareer(match: MatchState): PlayerReport[] {
  const c = current()
  if (!c || !match.result) return []
  const { players, reports } = applyPostMatch(
    c.players,
    match,
    deriveSeed(c.seed, 'friendly', match.seed),
  )
  commit({ ...c, players })
  return reports
}

/** Import a save file's text. Returns an error message, or null on success. */
export function importSave(text: string): string | null {
  const parsed = parseSave(text)
  if (!parsed.ok) return parsed.error
  commit(parsed.save.career)
  useGame.setState({ live: null })
  return null
}

export function resetCareer() {
  clearSave()
  useGame.setState({ career: null, live: null, notice: null })
}

export const dismissNotice = () => useGame.setState({ notice: null })
