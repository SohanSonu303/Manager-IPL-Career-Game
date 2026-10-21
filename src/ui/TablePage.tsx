import { teamById } from '@/data'
import { isPlayed, schedule, stageName, standings } from '@/sim/game'
import type { FixtureResult } from '@/sim/league'
import { useGame } from '@/state/store'
import { Crest } from './identity/Crest'

const short = (id: string) => teamById.get(id)?.short ?? id

function score(r: FixtureResult) {
  return r.innings.length
    ? r.innings
        .slice(0, 2)
        .map((i) => `${short(i.teamId)} ${i.runs}/${i.wickets}`)
        .join(' · ')
    : 'walkover'
}

/** Points table, playoffs and the manager's fixtures. */
export function TablePage() {
  const career = useGame((s) => s.career)
  if (!career) return <p className="dim">Start a career first.</p>
  const me = career.manager.teamId
  const table = standings(career)
  const playoffs = career.season.results.filter((r) => r.stage !== 'league')
  const resultById = new Map(career.season.results.map((r) => [r.fixtureId, r]))
  const myFixtures = schedule(career).filter((f) => f.homeId === me || f.awayId === me)

  return (
    <>
      <h1>{career.calendar.year} table</h1>
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
                  {t && <Crest crest={t.crest} colors={t.colors} size={22} />}
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
          <ul className="fixtures">
            {playoffs.map((r) => (
              <li key={r.fixtureId}>
                <strong>{stageName(r.stage)}</strong>
                <span>{score(r)}</span>
                <span className="dim">
                  {r.winnerId ? `${teamById.get(r.winnerId)?.name} ${r.margin}` : 'No result'}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="section">Your fixtures</h2>
      <ul className="fixtures">
        {myFixtures.map((f) => {
          const r = resultById.get(f.id)
          const opp = f.homeId === me ? f.awayId : f.homeId
          return (
            <li key={f.id}>
              <strong>
                R{f.round} {f.homeId === me ? 'vs' : '@'} {teamById.get(opp)?.name}
              </strong>
              {isPlayed(career, f) && r ? (
                <>
                  <span>{score(r)}</span>
                  <span className={r.winnerId === me ? 'good' : 'warn'}>
                    {r.winnerId === me ? 'Won' : r.winnerId ? 'Lost' : 'No result'}
                    {r.winnerId ? ` · ${short(r.winnerId)} ${r.margin}` : ''}
                  </span>
                </>
              ) : (
                <span className="dim">To play</span>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
