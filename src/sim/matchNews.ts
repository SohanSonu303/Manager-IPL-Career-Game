import { teams } from '../data'
import type { Career, CareerPlayer } from './career'
import type { Fixture } from './league'
import { gradeMatch } from './match/postMatch'
import type { MatchState } from './match/types'
import type { NewsItem } from './news'
import { overallRating } from './player'
import { pick, type Rng } from './rng'

type Draft = Omit<NewsItem, 'id' | 'year' | 'day'>

const short = (id: string) => teams.find((t) => t.id === id)?.short ?? id
const STAR = 78

/**
 * News from one match: the manager's result, milestones anywhere in the league,
 * injuries, players turning unhappy, social-media noise and transfer rumours.
 */
export function matchNews(
  before: Career,
  after: Career,
  f: Fixture,
  state: MatchState,
  rng: Rng,
): Draft[] {
  const me = before.manager.teamId
  const out: Draft[] = []
  const byId = new Map(after.players.map((p) => [p.id, p]))
  const was = new Map(before.players.map((p) => [p.id, p]))
  const grades = gradeMatch(state)
  const r = state.result
  const teamsIn = [f.homeId, f.awayId]

  // Result for the manager's club (and every playoff result).
  if (r && (teamsIn.includes(me) || f.stage !== 'league')) {
    const mine = grades.filter((g) => g.teamId === (teamsIn.includes(me) ? me : r.winnerId))
    const topBat = [...mine].sort((a, b) => (b.batting?.runs ?? 0) - (a.batting?.runs ?? 0))[0]
    const topBowl = [...mine].sort(
      (a, b) => (b.bowling?.wickets ?? 0) - (a.bowling?.wickets ?? 0),
    )[0]
    const name = (id?: string) => (id ? (byId.get(id)?.name ?? '') : '')
    const opp = teamsIn.find((t) => t !== me) ?? ''
    const head = !teamsIn.includes(me)
      ? `${f.stage === 'final' ? 'Final' : 'Playoffs'}: ${short(r.winnerId ?? '')} ${r.margin}.`
      : r.winnerId === me
        ? `${short(me)} beat ${short(opp)} — ${r.margin}.`
        : r.winnerId
          ? `${short(me)} lose to ${short(opp)}, who ${r.margin}.`
          : `${short(me)} and ${short(opp)} tie.`
    const stars = [
      topBat?.batting && topBat.batting.runs >= 30
        ? `${name(topBat.id)} ${topBat.batting.runs} (${topBat.batting.balls})`
        : '',
      topBowl?.bowling && topBowl.bowling.wickets >= 2
        ? `${name(topBowl.id)} ${topBowl.bowling.wickets}/${topBowl.bowling.runs}`
        : '',
    ].filter(Boolean)
    out.push({
      kind: 'result',
      teamIds: teamsIn.includes(me) ? [me, opp] : teamsIn,
      text: stars.length ? `${head} ${stars.join(', ')}.` : head,
    })
  }

  // Milestones anywhere.
  for (const g of grades) {
    const p = byId.get(g.id)
    if (!p) continue
    if (g.batting && g.batting.runs >= 100) {
      out.push({
        kind: 'milestone',
        teamIds: [g.teamId],
        playerId: p.id,
        text: `Century! ${p.name} hits ${g.batting.runs} off ${g.batting.balls} for ${short(g.teamId)}.`,
      })
    }
    if (g.bowling && g.bowling.wickets >= 5) {
      out.push({
        kind: 'milestone',
        teamIds: [g.teamId],
        playerId: p.id,
        text: `Five-for! ${p.name} takes ${g.bowling.wickets}/${g.bowling.runs} for ${short(g.teamId)}.`,
      })
    }
    // Social media.
    const star = overallRating(p) >= STAR
    if (star && g.batting?.out && g.batting.runs === 0 && rng() < 0.35) {
      out.push({
        kind: 'social',
        teamIds: [g.teamId],
        playerId: p.id,
        text: pick(rng, [
          `Fans troll ${p.name} after a duck: "Paid crores for this?"`,
          `Memes flood in after ${p.name}'s duck against ${short(teamsIn.find((t) => t !== g.teamId) ?? '')}.`,
          `${p.name} turns off comments after a first-ball dismissal.`,
        ]),
      })
    }
    if (
      overallRating(p) >= 72 &&
      g.batting &&
      g.batting.runs >= 50 &&
      g.batting.runs / Math.max(1, g.batting.balls) >= 1.8 &&
      rng() < 0.3
    ) {
      out.push({
        kind: 'social',
        teamIds: [g.teamId],
        playerId: p.id,
        text: pick(rng, [
          `${p.name}'s blitz (${g.batting.runs} off ${g.batting.balls}) is trending nationwide.`,
          `"Box office": fans can't get enough of ${p.name} after ${g.batting.runs} off ${g.batting.balls}.`,
        ]),
      })
    }
  }

  // Injuries: everyone at the manager's club, stars elsewhere.
  for (const p of after.players) {
    if (!p.teamId || !teamsIn.includes(p.teamId) || !p.injury || was.get(p.id)?.injury) continue
    if (p.teamId !== me && overallRating(p) < 75) continue
    out.push({
      kind: 'injury',
      teamIds: [p.teamId],
      playerId: p.id,
      text: `${p.name} (${short(p.teamId)}) is injured — out for ${p.injury.matchesOut} match${p.injury.matchesOut > 1 ? 'es' : ''}.`,
    })
  }

  // Players who just turned unhappy.
  for (const p of after.players) {
    const prev = was.get(p.id)
    if (!p.teamId || !teamsIn.includes(p.teamId) || !prev || prev.morale < 30 || p.morale >= 30)
      continue
    if (p.teamId === me) {
      out.push({
        kind: 'morale',
        teamIds: [me],
        playerId: p.id,
        text: `${p.name} is unhappy about his lack of game time.`,
        talk: { playerId: p.id, done: false },
      })
    } else if (overallRating(p) >= 68) {
      out.push({
        kind: 'morale',
        teamIds: [p.teamId],
        playerId: p.id,
        text: pick(rng, [
          `${p.name} unhappy at ${short(p.teamId)}; a trade request is rumoured.`,
          `Cracks at ${short(p.teamId)}: ${p.name} reportedly wants out.`,
        ]),
      })
    }
    if (rng() < 0.4) {
      out.push({
        kind: 'social',
        teamIds: [p.teamId],
        playerId: p.id,
        text: `${p.name} posts a cryptic story. Fans wonder about his future at ${short(p.teamId)}.`,
      })
    }
  }

  // Heavy defeat for the manager's club.
  if (
    r &&
    teamsIn.includes(me) &&
    r.winnerId &&
    r.winnerId !== me &&
    /(\d+) (run|wicket)/.test(r.margin)
  ) {
    const n = Number(r.margin.match(/(\d+)/)?.[1] ?? 0)
    if (((r.kind === 'runs' && n >= 40) || (r.kind === 'wickets' && n >= 8)) && rng() < 0.5) {
      out.push({
        kind: 'social',
        teamIds: [me],
        text: `Fans fume after the heavy defeat; #${short(me)}Out is trending.`,
      })
    }
  }

  // Transfer rumour.
  if (rng() < 0.05) {
    const others = after.players.filter(
      (p) => p.teamId && p.teamId !== me && overallRating(p) >= 74,
    )
    const target: CareerPlayer | undefined = others.length ? pick(rng, others) : undefined
    const suitor = pick(
      rng,
      teams.filter((t) => t.id !== target?.teamId),
    ).id
    if (target?.teamId) {
      out.push({
        kind: 'rumour',
        teamIds: [suitor, target.teamId],
        playerId: target.id,
        text: `Reports: ${short(suitor)} keen on ${short(target.teamId)}'s ${target.name}.`,
      })
    }
  }
  return out
}
