import { teamById } from '@/data'
import { isPlayed, schedule, stageName, standings } from '@/sim/game'
import type { FixtureResult } from '@/sim/league'
import { useGame } from '@/state/store'
import { teamShort } from './format'
import { Crest } from './identity/Crest'
import { Chip, Screen } from './kit/kit'
import { useNextAction } from './useNextAction'

export function scoreLine(r: FixtureResult) {
  return r.innings.length
    ? r.innings
        .slice(0, 2)
        .map((i) => `${teamShort(i.teamId)} ${i.runs}/${i.wickets}`)
        .join(' · ')
    : 'walkover'
}

/** Points table and playoffs. */
export function TablePage() {
  const career = useGame((s) => s.career)
  const next = useNextAction()
  if (!career) return null
  const me = career.manager.teamId
  const table = standings(career)
  const playoffs = career.season.results.filter((r) => r.stage !== 'league')
  return (
    <Screen primary={next}>
      <h1>{career.calendar.year} standings</h1>
      <table className="standings">
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th>P</th>
            <th>W</th>
            <th>L</th>
            <th>Pts</th>
            <th>NRR</th>
          </tr>
        </thead>
        <tbody>
          {table.map((r, i) => {
            const t = teamById.get(r.teamId)
            return (
              <tr
                key={r.teamId}
                className={`${r.teamId === me ? 'mine' : ''} ${i === 3 ? 'cut' : ''}`}
              >
                <td>{i + 1}</td>
                <td className="team-cell">
                  {t && <Crest crest={t.crest} colors={t.colors} size={26} />}
                  {t?.short}
                </td>
                <td>{r.played}</td>
                <td>{r.won}</td>
                <td>{r.lost}</td>
                <td>
                  <strong>{r.points}</strong>
                </td>
                <td>{(r.nrr >= 0 ? '+' : '') + r.nrr.toFixed(3)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="dim">Top four reach the playoffs.</p>
      {playoffs.length > 0 && (
        <>
          <h2 className="section">Playoffs</h2>
          <ul className="list">
            {playoffs.map((r) => (
              <li key={r.fixtureId}>
                <strong>{stageName(r.stage)}</strong>
                <span>{scoreLine(r)}</span>
                <span className="dim">
                  {r.winnerId ? `${teamById.get(r.winnerId)?.name} ${r.margin}` : 'No result'}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Screen>
  )
}

/** The manager's fixtures and results. */
export function FixturesPage() {
  const career = useGame((s) => s.career)
  const next = useNextAction()
  if (!career) return null
  const me = career.manager.teamId
  const resultById = new Map(career.season.results.map((r) => [r.fixtureId, r]))
  const mine = schedule(career).filter((f) => f.homeId === me || f.awayId === me)
  return (
    <Screen primary={next}>
      <h1>{career.calendar.year} fixtures</h1>
      <ul className="list">
        {mine.map((f) => {
          const r = resultById.get(f.id)
          const opp = f.homeId === me ? f.awayId : f.homeId
          const t = teamById.get(opp)
          return (
            <li key={f.id}>
              <div className="row-between">
                <span className="team-cell">
                  {t && <Crest crest={t.crest} colors={t.colors} size={30} />}
                  <span>
                    <strong>
                      R{f.round} {f.homeId === me ? 'vs' : '@'} {t?.name}
                    </strong>
                    <br />
                    <span className="dim">{teamById.get(f.homeId)?.ground}</span>
                  </span>
                </span>
                {isPlayed(career, f) && r ? (
                  <Chip tone={r.winnerId === me ? 'good' : r.winnerId ? 'bad' : 'plain'}>
                    {r.winnerId === me ? 'WON' : r.winnerId ? 'LOST' : 'N/R'}
                  </Chip>
                ) : (
                  <Chip>To play</Chip>
                )}
              </div>
              {r && (
                <span className="dim">
                  {scoreLine(r)} ·{' '}
                  {r.winnerId ? `${teamShort(r.winnerId)} ${r.margin}` : 'no result'}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </Screen>
  )
}
