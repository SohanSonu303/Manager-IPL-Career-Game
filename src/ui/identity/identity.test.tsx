import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { players, teamById, teams } from '@/data'
import { Avatar } from './Avatar'
import { avatarSpec, ringStatus } from './avatarSpec'
import { Crest } from './Crest'

describe('avatarSpec', () => {
  it('is stable per seed', () => {
    expect(avatarSpec('p123', 'IND', 25)).toEqual(avatarSpec('p123', 'IND', 25))
  })

  it('gives enough variety across the player pool', () => {
    const keys = new Set(players.map((p) => JSON.stringify(avatarSpec(p.id, p.nationality, p.age))))
    // Nearly every player should look different.
    expect(keys.size).toBeGreaterThan(players.length * 0.95)
  })

  it('ringStatus bands', () => {
    expect(ringStatus(90)).toBe('good')
    expect(ringStatus(50)).toBe('ok')
    expect(ringStatus(10)).toBe('poor')
  })
})

describe('rendering', () => {
  it('renders every crest', () => {
    for (const t of teams) {
      expect(renderToStaticMarkup(<Crest crest={t.crest} colors={t.colors} />)).toContain('<svg')
    }
  })

  it('renders every player avatar, with ring and badge', () => {
    for (const p of players) {
      const team = p.teamId ? teamById.get(p.teamId) : undefined
      const html = renderToStaticMarkup(
        <Avatar
          seed={p.id}
          nationality={p.nationality}
          age={p.age}
          kit={team?.colors ?? { primary: '#555', secondary: '#ccc' }}
          ring="good"
          badge={team && { crest: team.crest, colors: team.colors }}
        />,
      )
      expect(html).toContain('<svg')
      expect(html).not.toContain('NaN')
    }
  })

  it('uses the image slot when given', () => {
    const html = renderToStaticMarkup(
      <Avatar
        seed="x"
        nationality="IND"
        kit={{ primary: '#000', secondary: '#fff' }}
        imageUrl="/p.png"
      />,
    )
    expect(html).toContain('<image')
  })
})
