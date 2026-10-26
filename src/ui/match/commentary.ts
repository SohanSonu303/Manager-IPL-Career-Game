import type { BallEvent, BowlingDelivery, MatchState, ShotKind } from '@/sim/match/types'

/** How a delivery reads in commentary, when it is worth a mention. */
const DELIVERY_LEAD: Partial<Record<BowlingDelivery, string>> = {
  yorker: 'Yorker',
  fulltoss: 'Full toss',
  longhop: 'Short and wide',
  bouncer: 'Bouncer',
  slower: 'Slower one',
  wideline: 'Wide outside off',
}

const FOUR: Record<ShotKind, string> = {
  drive: '{bat} drives it through the covers. Four.',
  cut: '{bat} cuts hard past point. Four.',
  pull: '{bat} pulls it in front of square for four.',
  hook: '{bat} hooks it fine for four.',
  flick: '{bat} flicks it off the pads for four.',
  glance: 'Fine glance from {bat}, runs away for four.',
  sweep: '{bat} sweeps it fine for four.',
  edge: 'Thick edge from {bat}, and it races away to third man for four.',
  loft: '{bat} lofts it over the infield. One bounce, four.',
  slog: '{bat} slogs it through midwicket for four.',
  scoop: '{bat} scoops it over the keeper for four!',
  push: '{bat} pushes it into the gap and it beats the field. Four.',
  defend: '{bat} gets an inside edge and it runs away for four.',
}

const SIX: Record<ShotKind, string> = {
  loft: '{bat} lofts it straight back over the bowler. Six!',
  pull: '{bat} pulls it away over midwicket. Six!',
  hook: '{bat} hooks it over fine leg. Six!',
  sweep: '{bat} slog-sweeps it into the stands. Six!',
  slog: '{bat} clears the front leg and launches it over cow corner. Six!',
  scoop: 'Outrageous! {bat} scoops it over the keeper for six!',
  drive: '{bat} drives it over extra cover. Six!',
  cut: '{bat} upper-cuts it over third man. Six!',
  flick: '{bat} flicks it over square leg. Six!',
  glance: '{bat} helps it on its way over fine leg. Six!',
  edge: 'Top edge from {bat}... and it carries all the way for six!',
  push: '{bat} muscles it over long-on. Six!',
  defend: '{bat} gets it off the middle and it sails for six!',
}

const SINGLE: Partial<Record<ShotKind, string>> = {
  push: '{bat} pushes it for a single.',
  drive: '{bat} drives it to long-off for one.',
  cut: '{bat} cuts it to deep point for a single.',
  pull: '{bat} pulls it to deep square leg for one.',
  flick: '{bat} flicks it to square leg for one.',
  glance: '{bat} tucks it off the hip for a single.',
}

/** One line of commentary for a delivery, from its commentary key. */
export function commentary(e: BallEvent, state: MatchState): string {
  const name = (id: string | null | undefined) => (id ? (state.players[id]?.name ?? '') : '')
  const bat = name(e.batterId)
  const bowl = name(e.bowlerId)
  const key = e.commentary.replace(/^noball\./, '')
  const fill = (t: string) => t.replaceAll('{bat}', bat)
  let line: string
  if (key.startsWith('four.')) line = fill(FOUR[key.slice(5) as ShotKind] ?? FOUR.edge)
  else if (key.startsWith('six.')) line = fill(SIX[key.slice(4) as ShotKind] ?? SIX.loft)
  else
    switch (key) {
      case 'run.1':
        line = SINGLE[e.shot?.kind ?? 'push'] ?? SINGLE.push ?? ''
        line = fill(line)
        break
      case 'run.2':
        line = `${bat} finds the gap and they come back for two.`
        break
      case 'run.3':
        line = `${bat} places it well, they run three.`
        break
      case 'dot.defended':
        line =
          e.delivery?.actual === 'yorker'
            ? `Yorker from ${bowl}, ${bat} digs it out. No run.`
            : `${bat} defends. No run.`
        break
      case 'dot.beaten':
        line =
          e.delivery?.actual === 'bouncer'
            ? `Bouncer from ${bowl}, ${bat} ducks under it.`
            : e.delivery?.actual === 'slower'
              ? `Slower ball, and ${bat} is through his shot too early. No run.`
              : `${bowl} beats the bat. No run.`
        break
      case 'appeal':
        line = `Big appeal for lbw from ${bowl}... not out.`
        break
      case 'review.notout':
        line = `${bat} is given out, but reviews. Not out! The decision is overturned.`
        break
      case 'wide':
        line =
          e.total === 5
            ? `Wide from ${bowl}, and it runs away for five wides.`
            : `Wide from ${bowl}.`
        break
      case 'legbye':
        line = 'Off the pad, they take a leg-bye.'
        break
      case 'bye':
        line = 'Past the keeper, they scamper a bye.'
        break
      case 'drop': {
        const f = name(e.fumble?.fielderId)
        line = `Dropped! ${bat} skies it and ${f} puts it down. ${bowl} can't believe it.`
        if (e.runs === 1) line += ' They scramble a single.'
        break
      }
      case 'misfield':
        line = `${bat} pushes into the ring, ${name(e.fumble?.fielderId)} fumbles and they come back for two.`
        break
      case 'wicket.bowled':
        line = `Bowled! ${bowl} knocks back ${bat}'s stumps.`
        break
      case 'wicket.caught': {
        const f = e.wicket?.fielderId
        line =
          f === e.bowlerId
            ? `Caught and bowled! ${bowl} holds on to it.`
            : !e.shot
              ? `Caught behind! ${bat} feathers it to ${name(f)} off ${bowl}.`
              : `Out! ${bat} is caught by ${name(f)} off ${bowl}.`
        break
      }
      case 'wicket.lbw':
        line = `LBW! ${bowl} traps ${bat} in front.`
        break
      case 'wicket.stumped':
        line = `Stumped! ${bat} is out of the crease and ${name(e.wicket?.fielderId)} whips the bails off.`
        break
      case 'wicket.runOut':
        line = `Run out! ${name(e.wicket?.playerOutId)} is short of the crease.`
        break
      case 'wicket.hitWicket':
        line = `Hit wicket! ${bat} treads on the stumps.`
        break
      default:
        line = key
    }
  // What was bowled, when it made the difference.
  const lead = e.delivery ? DELIVERY_LEAD[e.delivery.actual] : undefined
  // A boundary off a bad ball, or a wicket off a good one.
  const actual = e.delivery?.actual
  const bad = actual === 'fulltoss' || actual === 'longhop' || actual === 'wideline'
  const good = actual === 'yorker' || actual === 'bouncer' || actual === 'slower'
  const notable = (e.boundary && bad) || (e.wicket && good && e.wicket.kind !== 'runOut')
  if (lead && notable && e.extra?.kind !== 'wide') line = `${lead}. ${line}`
  // A review that kept the umpire's call, or overturned a not-out.
  if (e.review && key !== 'review.notout') {
    const who = e.review.call === 'out' ? bat : `${bowl}'s side`
    line = e.review.overturned
      ? `Not out on the field, ${who} review... it's hitting! ${line}`
      : e.review.umpiresCall
        ? `${who} reviews... umpire's call! The decision stands, but the review is kept. ${line}`
        : `${who} reviews... no doubt about it, the decision stands. ${line}`
  }
  if (e.commentary.startsWith('noball.')) line = `No-ball from ${bowl}! ${line} Free hit next.`
  if (e.freeHit) line = `Free hit. ${line}`
  return line
}
