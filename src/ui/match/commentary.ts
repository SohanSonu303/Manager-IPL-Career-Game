import type { BallEvent, MatchState } from '@/sim/match/types'

/** One line of commentary for a delivery, from its commentary key. */
export function commentary(e: BallEvent, state: MatchState): string {
  const name = (id: string | null | undefined) => (id ? (state.players[id]?.name ?? '') : '')
  const bat = name(e.batterId)
  const bowl = name(e.bowlerId)
  const key = e.commentary.replace(/^noball\./, '')
  let line: string
  switch (key) {
    case 'six.lofted':
      line = `${bat} lofts it straight into the stands. Six!`
      break
    case 'six.pull':
      line = `${bat} pulls it away over midwicket. Six!`
      break
    case 'four.off':
      line = `${bat} drives through the off side. Four.`
      break
    case 'four.leg':
      line = `${bat} works it through the leg side for four.`
      break
    case 'four.fine':
      line = `Fine glance from ${bat}, runs away for four.`
      break
    case 'four.edge':
      line = `Thick edge from ${bat}, and it races away for four.`
      break
    case 'run.1':
      line = `${bat} pushes it for a single.`
      break
    case 'run.2':
      line = `${bat} finds the gap and they come back for two.`
      break
    case 'run.3':
      line = `${bat} places it well, they run three.`
      break
    case 'dot.defended':
      line = `${bat} defends. No run.`
      break
    case 'dot.beaten':
      line = `${bowl} beats the bat. No run.`
      break
    case 'wide':
      line =
        e.total === 5 ? `Wide from ${bowl}, and it runs away for five wides.` : `Wide from ${bowl}.`
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
  if (e.commentary.startsWith('noball.')) line = `No-ball from ${bowl}! ${line} Free hit next.`
  if (e.freeHit) line = `Free hit. ${line}`
  return line
}
