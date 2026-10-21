import { create } from 'zustand'

/** Plain serializable game state. Grows with each phase. */
export interface GameState {
  version: number
  seed: number
}

export const useGame = create<GameState>(() => ({ version: 1, seed: 1 }))
