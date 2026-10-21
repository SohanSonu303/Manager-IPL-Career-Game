import { create } from 'zustand'
import { today } from '@/sim/calendar'
import type { Career, Lineup } from '@/sim/career'
import {
  continueCareer,
  ensureEleven,
  playToday,
  quickSim,
  recordFixture,
  setupFixture,
  startCareer as newGame,
  TEAM_IDS,
  userFixtureToday,
} from '@/sim/game'
import type { Fixture } from '@/sim/league'
import {
  evaluateTrade,
  executeTrade,
  makeOffer,
  releaseBlocker,
  releasePlayer,
  type Offer,
  type OfferAnswer,
  type TradeAnswer,
} from '@/sim/market'
import type { Match } from '@/sim/match/engine'
import { applyPostMatch, type PlayerReport } from '@/sim/match/postMatch'
import type { MatchState } from '@/sim/match/types'
import { deriveSeed } from '@/sim/rng'
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

/** Set the career and auto-save it. */
function commit(career: Career) {
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
  useGame.setState({ live: { fixture: f, match: setupFixture(c, f) } })
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

export function proposeTrade(give: string[], get: string[]): TradeAnswer {
  const c = current()
  if (!c) return { ok: false, reason: 'No career.' }
  const answer = evaluateTrade(c, give, get)
  if (answer.ok) commit(executeTrade(c, give, get))
  return answer
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
