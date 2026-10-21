import type { Role, Trait } from '@/data'
import type { CareerPlayer } from '@/sim/career'
import { overallRating } from '@/sim/player'

/** Filters for any list of players (market, squad, browse). Pure data, easy to test. */
export interface PlayerFilters {
  search: string
  role: Role | 'any'
  origin: 'any' | 'domestic' | 'overseas'
  bowling: 'any' | 'pace' | 'spin'
  age: 'any' | 'u23' | '23-28' | '29-33' | '34+'
  minOverall: number
  skill: Trait | 'any'
  /** Price band by the player's price (his demand, or his salary for signed players), in crore. */
  price: 'any' | 'u1' | '1-5' | '5-15' | '15+'
  availability: 'any' | 'fit' | 'injured'
  sort: 'overall' | 'age' | 'price' | 'form' | 'potential' | 'name'
}

export const DEFAULT_FILTERS: PlayerFilters = {
  search: '',
  role: 'any',
  origin: 'any',
  bowling: 'any',
  age: 'any',
  minOverall: 0,
  skill: 'any',
  price: 'any',
  availability: 'any',
  sort: 'overall',
}

/** How many filters (not search or sort) differ from the default. */
export function activeCount(f: PlayerFilters): number {
  const d = DEFAULT_FILTERS
  return (
    (['role', 'origin', 'bowling', 'age', 'skill', 'price', 'availability'] as const).filter(
      (k) => f[k] !== d[k],
    ).length +
    (f.minOverall !== d.minOverall ? 1 : 0) +
    (f.search.trim() ? 1 : 0)
  )
}

const AGE: Record<PlayerFilters['age'], (a: number) => boolean> = {
  any: () => true,
  u23: (a) => a < 23,
  '23-28': (a) => a >= 23 && a <= 28,
  '29-33': (a) => a >= 29 && a <= 33,
  '34+': (a) => a >= 34,
}

const PRICE: Record<PlayerFilters['price'], (cr: number) => boolean> = {
  any: () => true,
  u1: (c) => c < 1,
  '1-5': (c) => c >= 1 && c < 5,
  '5-15': (c) => c >= 5 && c < 15,
  '15+': (c) => c >= 15,
}

const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')

/**
 * Filter and sort players. `price` gives a player's price in lakh (his demand for free
 * agents, his salary for signed players); it drives the price band and price sort.
 */
export function applyFilters(
  players: CareerPlayer[],
  f: PlayerFilters,
  price: (p: CareerPlayer) => number = (p) => p.contract?.salary ?? 0,
): CareerPlayer[] {
  const q = plain(f.search.trim())
  const out = players.filter((p) => {
    if (q && !plain(p.name).includes(q)) return false
    if (f.role !== 'any' && p.role !== f.role) return false
    if (f.origin === 'domestic' && p.overseas) return false
    if (f.origin === 'overseas' && !p.overseas) return false
    if (
      f.bowling !== 'any' &&
      !(p.bowlingType === f.bowling && p.role !== 'batter' && p.role !== 'wicketkeeper')
    )
      return false
    if (!AGE[f.age](p.age)) return false
    if (overallRating(p) < f.minOverall) return false
    if (f.skill !== 'any' && !p.traits.includes(f.skill)) return false
    if (!PRICE[f.price](price(p) / 100)) return false
    if (f.availability === 'fit' && p.injury) return false
    if (f.availability === 'injured' && !p.injury) return false
    return true
  })
  const key: Record<PlayerFilters['sort'], (p: CareerPlayer) => number | string> = {
    overall: (p) => -overallRating(p),
    age: (p) => p.age,
    price: (p) => -price(p),
    form: (p) => -p.form,
    potential: (p) => -p.potential,
    name: (p) => p.name,
  }
  const k = key[f.sort]
  return out.sort((a, b) => {
    const x = k(a)
    const y = k(b)
    const c = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)
    // Ties: better overall first, then name.
    return c || overallRating(b) - overallRating(a) || a.name.localeCompare(b.name)
  })
}
