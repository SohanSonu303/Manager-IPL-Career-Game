import { useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, type IconName } from './Icon'

/** Color band for a 1–99 rating. */
export function ratingColor(v: number): string {
  if (v >= 75) return 'var(--money)'
  if (v >= 60) return 'var(--accent)'
  if (v >= 45) return 'var(--warn)'
  return 'var(--danger)'
}

/** Ring that fills with the rating, number in the middle. */
export function RatingRing({
  value,
  size = 44,
  label,
}: {
  value: number
  size?: number
  label?: string
}) {
  const r = 20
  const c = 2 * Math.PI * r
  const fill = Math.max(0, Math.min(1, value / 99))
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={label ?? `Rating ${value}`}
      className="rating-ring"
    >
      <circle
        cx={24}
        cy={24}
        r={r}
        fill="var(--bg-deep)"
        stroke="var(--surface-2)"
        strokeWidth={4}
      />
      <circle
        cx={24}
        cy={24}
        r={r}
        fill="none"
        stroke={ratingColor(value)}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={`${c * fill} ${c}`}
        transform="rotate(-90 24 24)"
      />
      <text
        x={24}
        y={29}
        textAnchor="middle"
        fontSize={15}
        fontWeight={700}
        fill="var(--text)"
        fontFamily="var(--font-display)"
      >
        {value}
      </text>
    </svg>
  )
}

/** Segmented bar, e.g. batting intent (filled of total). */
export function StatBar({
  filled,
  total,
  hot = false,
}: {
  filled: number
  total: number
  hot?: boolean
}) {
  return (
    <span className={`statbar ${hot ? 'hot' : ''}`} aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < filled ? 'on' : ''} />
      ))}
    </span>
  )
}

/** Horizontal 0–100 bar with a label. */
export function Meter({ value, color = 'var(--accent)' }: { value: number; color?: string }) {
  return (
    <span className="meter" aria-hidden="true">
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </span>
  )
}

export function Chip({
  children,
  tone = 'plain',
}: {
  children: ReactNode
  tone?: 'plain' | 'good' | 'warn' | 'bad' | 'blue'
}) {
  return <span className={`chip ${tone}`}>{children}</span>
}

export interface Action {
  label: string
  onClick: () => void
  disabled?: boolean
}

/**
 * A screen: scrolling content plus the slanted bottom action bar
 * (Back on the left, the main action on the right).
 */
export function Screen({
  children,
  primary,
  back = true,
  className = '',
}: {
  children: ReactNode
  primary?: Action | null
  back?: boolean | Action
  className?: string
}) {
  const navigate = useNavigate()
  const left: Action | null =
    back === false ? null : back === true ? { label: 'Back', onClick: () => navigate(-1) } : back
  return (
    <>
      <div className={`screen ${className}`}>{children}</div>
      <div className="action-bar">
        {left ? (
          <button className="action-left" onClick={left.onClick} disabled={left.disabled}>
            {left.label}
          </button>
        ) : (
          <span className="action-left" />
        )}
        {primary && (
          <button className="action-primary" onClick={primary.onClick} disabled={primary.disabled}>
            <span>{primary.label}</span>
          </button>
        )}
      </div>
    </>
  )
}

/** Bottom sheet over the screen. Closes on backdrop tap or Escape. */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}

/** Square status tile with a blue caption band (Standings, Season, Alerts). */
export function Tile({
  caption,
  onClick,
  children,
}: {
  caption: string
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <button className="tile" onClick={onClick}>
      <span className="tile-body">{children}</span>
      <span className="tile-caption">{caption}</span>
    </button>
  )
}

/** Round hub button with an icon and a caption under it. */
export function HubButton({
  icon,
  label,
  onClick,
  badge,
}: {
  icon: IconName
  label: string
  onClick: () => void
  badge?: boolean
}) {
  return (
    <button className="hub-btn" onClick={onClick}>
      <span className="hub-circle">
        <Icon name={icon} size={34} />
        {badge && <span className="hub-badge" aria-label="Needs attention" />}
      </span>
      <span className="hub-label">{label}</span>
    </button>
  )
}

/** Big flat blue tab-style button (Board / Finances / Club). */
export function FlatButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="flat-btn" onClick={onClick}>
      {children}
    </button>
  )
}
