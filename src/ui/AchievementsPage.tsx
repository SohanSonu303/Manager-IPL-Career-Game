import { ACHIEVEMENTS } from '@/sim/achievements'
import { useGame } from '@/state/store'
import { Icon } from './kit/Icon'
import { Screen } from './kit/kit'

/** The badge wall: every achievement, unlocked ones with the season they came in. */
export function AchievementsPage() {
  const career = useGame((s) => s.career)
  const got = career?.achievements ?? {}
  const count = ACHIEVEMENTS.filter((a) => got[a.id]).length
  return (
    <Screen>
      <h1>Achievements</h1>
      <p className="dim">
        {count} of {ACHIEVEMENTS.length} unlocked
      </p>
      <ul className="badges">
        {ACHIEVEMENTS.map((a) => {
          const when = got[a.id]
          return (
            <li key={a.id} className={when ? 'on' : ''}>
              <span className="badge-icon" aria-hidden>
                <Icon name="trophy" size={24} />
              </span>
              <span>
                <strong>{a.title}</strong>
                <small>{a.text}</small>
                {when && <small className="good">Unlocked in {when.year}</small>}
              </span>
            </li>
          )
        })}
      </ul>
    </Screen>
  )
}
