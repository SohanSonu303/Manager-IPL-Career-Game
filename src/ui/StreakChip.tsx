import type { Condition } from '@/sim/player'
import { Chip } from './kit/kit'

/** "Hot ×2" / "Cold" chip for a player on a streak; nothing when he's level. */
export function StreakChip({ p }: { p: Pick<Condition, 'streak'> }) {
  const s = p.streak ?? 0
  if (!s) return null
  const n = Math.abs(s) > 1 ? ` ×${Math.abs(s)}` : ''
  return (
    <span className="streak-chip">
      <Chip tone={s > 0 ? 'warn' : 'blue'}>{s > 0 ? `🔥 Hot${n}` : `❄ Cold${n}`}</Chip>
    </span>
  )
}
