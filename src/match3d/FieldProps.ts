import type { BallEvent, FieldSetting, Phase } from '@/sim/match/types'

/** What both field renderers (3D and 2D) draw. */
export interface FieldProps {
  /** Boundary radius in metres. */
  radius: number
  phase: Phase
  /** The bowling side's field setting. */
  field: FieldSetting
  /** The latest delivery (null before the first ball). */
  event: BallEvent | null
  /** Changes on every delivery, to restart the animation. */
  eventKey: number
  batColor: string
  bowlColor: string
  reducedMotion: boolean
  /** Called when the frame rate stays too low (3D only). */
  onSlow?: () => void
}

/** True if this browser can create a WebGL context. */
export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'))
  } catch {
    return false
  }
}
