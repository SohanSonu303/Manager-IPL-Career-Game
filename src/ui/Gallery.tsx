import { players, shortName, teamById, teams } from '@/data'
import { overallRating } from '@/sim/player'
import { Avatar } from './identity/Avatar'
import { ringStatus } from './identity/avatarSpec'
import { Crest } from './identity/Crest'

/** Dev page: all crests and 100 avatars on one screen, to check variety and style. */
export function Gallery() {
  return (
    <div className="gallery">
      <h1>Identity gallery</h1>
      <h2>Crests</h2>
      <div className="crest-grid">
        {teams.map((t) => (
          <figure key={t.id}>
            <Crest crest={t.crest} colors={t.colors} size={64} title={t.name} />
            <figcaption>
              {t.short}
              <br />
              {t.name}
            </figcaption>
          </figure>
        ))}
      </div>

      <h2>Avatars (first 100 players)</h2>
      <div className="avatar-grid">
        {players.slice(0, 100).map((p, i) => {
          const team = p.teamId ? teamById.get(p.teamId) : undefined
          const kit = team?.colors ?? { primary: '#5b6070', secondary: '#c9ccd6' }
          return (
            <figure key={p.id}>
              <Avatar
                seed={p.id}
                nationality={p.nationality}
                age={p.age}
                kit={kit}
                size={64}
                ring={i % 4 === 0 ? ringStatus(overallRating(p)) : undefined}
                badge={team ? { crest: team.crest, colors: team.colors } : undefined}
                title={p.name}
              />
              <figcaption>{shortName(p.name)}</figcaption>
            </figure>
          )
        })}
      </div>
    </div>
  )
}
