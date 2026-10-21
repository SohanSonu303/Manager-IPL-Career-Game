import { describe, expect, it } from 'vitest'
import { direction, fielderPositions, rayToCircle, shotEnd, STRIKER } from './geometry'

const len = (p: { x: number; y: number }) => Math.hypot(p.x, p.y)

describe('field geometry', () => {
  it('maps angles: straight down, off side left, leg side right', () => {
    expect(direction(0).y).toBeCloseTo(1)
    expect(direction(90).x).toBeCloseTo(-1)
    expect(direction(270).x).toBeCloseTo(1)
    expect(direction(180).y).toBeCloseTo(-1)
  })

  it('rays from the striker reach the rope exactly', () => {
    for (const a of [0, 45, 90, 200, 300]) {
      const d = direction(a)
      const t = rayToCircle(STRIKER, d, 70)
      expect(len({ x: STRIKER.x + d.x * t, y: STRIKER.y + d.y * t })).toBeCloseTo(70)
    }
  })

  it('fours end on the rope, sixes beyond it, others inside', () => {
    const shot = { angle: 30, distance: 85, aerial: true }
    expect(len(shotEnd(shot, 4, 70))).toBeCloseTo(70)
    expect(len(shotEnd(shot, 6, 70))).toBeGreaterThan(70)
    expect(len(shotEnd({ angle: 30, distance: 20, aerial: false }, null, 70))).toBeLessThan(70)
  })

  it('attacking fields bring riders in; defensive keeps them out', () => {
    const out = (f: { x: number; y: number }[]) => f.filter((p) => len(p) > 50).length
    expect(out(fielderPositions('death', 70, 'attacking'))).toBe(4)
    expect(out(fielderPositions('middle', 70, 'attacking'))).toBe(3)
    expect(out(fielderPositions('powerplay', 70, 'attacking'))).toBe(1)
    expect(out(fielderPositions('death', 70, 'defensive'))).toBe(5)
  })

  it('places nine fielders inside the rope, with the right number out', () => {
    for (const phase of ['powerplay', 'middle', 'death'] as const) {
      const f = fielderPositions(phase, 70)
      expect(f).toHaveLength(9)
      for (const p of f) expect(len(p)).toBeLessThan(70)
      const out = f.filter((p) => len(p) > 50).length
      expect(out).toBe(phase === 'powerplay' ? 2 : 5)
    }
  })
})
