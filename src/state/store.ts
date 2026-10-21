import { create } from 'zustand'

/** Plain serializable game state. Grows with each phase. */
export interface GameState {
  version: number
  seed: number
  settings: {
    /** Show made-up names instead of real player names (for public pitches). */
    fictionalNames: boolean
  }
}

export const useGame = create<GameState>(() => ({
  version: 1,
  seed: 1,
  settings: { fictionalNames: false },
}))

export const setFictionalNames = (on: boolean) =>
  useGame.setState((s) => ({ settings: { ...s.settings, fictionalNames: on } }))
