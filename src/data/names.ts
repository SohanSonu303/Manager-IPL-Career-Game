import { createRng, hashString, pick } from '../sim/rng'
import pools from './name-pools.json'
import type { Nationality, Player } from './types'

type Pools = Record<Nationality, { first: string[]; last: string[] }>
const namePools = pools as Pools

/** Deterministic made-up name for a seed string, from the nationality's name pool. */
export function fictionalName(seed: string, nationality: Nationality): string {
  const rng = createRng(hashString(`name:${seed}`))
  const pool = namePools[nationality]
  return `${pick(rng, pool.first)} ${pick(rng, pool.last)}`
}

/**
 * Name to show in the UI. With the fictional-names toggle on, real players get a stable
 * made-up name; generated players already have one.
 */
export function displayName(
  p: Pick<Player, 'id' | 'name' | 'real' | 'nationality'>,
  fictional: boolean,
): string {
  return fictional && p.real ? fictionalName(p.id, p.nationality) : p.name
}

/** "Virat Kohli" -> "V Kohli". Keeps single-word names as they are. */
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/)
  if (parts.length < 2) return full
  const last = parts.pop() as string
  return `${parts.map((w) => w[0]).join('')} ${last}`
}
