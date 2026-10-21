import { describe, expect, it } from 'vitest'
import { createRng, gaussian, hashString, pick, pickWeighted, randInt } from './rng'

describe('createRng', () => {
  it('gives the same sequence for the same seed', () => {
    const a = createRng(42)
    const b = createRng(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('stays in [0, 1)', () => {
    const r = createRng(1)
    for (let i = 0; i < 1000; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('helpers', () => {
  it('hashString is stable and spreads', () => {
    expect(hashString('abc')).toBe(hashString('abc'))
    expect(hashString('abc')).not.toBe(hashString('abd'))
  })

  it('randInt covers the inclusive range', () => {
    const r = createRng(7)
    const seen = new Set<number>()
    for (let i = 0; i < 500; i++) seen.add(randInt(r, 1, 4))
    expect([...seen].sort()).toEqual([1, 2, 3, 4])
  })

  it('pick and pickWeighted return members', () => {
    const r = createRng(3)
    expect(['a', 'b']).toContain(pick(r, ['a', 'b']))
    for (let i = 0; i < 50; i++)
      expect(
        pickWeighted(r, [
          ['x', 1],
          ['y', 0],
        ]),
      ).toBe('x')
  })

  it('gaussian is centered near 0', () => {
    const r = createRng(9)
    let sum = 0
    for (let i = 0; i < 5000; i++) sum += gaussian(r)
    expect(Math.abs(sum / 5000)).toBeLessThan(0.05)
  })
})
