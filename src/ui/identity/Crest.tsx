import { useId, type ReactNode } from 'react'
import type { CrestGlyph, CrestShape, CrestSpec } from '@/data/types'

/** Outlines in a 100×100 box. */
const SHAPES: Record<CrestShape, string> = {
  shield: 'M50 5 L88 16 V46 C88 72 72 87 50 95 C28 87 12 72 12 46 V16 Z',
  circle: 'M50 6 A44 44 0 1 1 49.99 6 Z',
  hexagon: 'M50 5 L89 27.5 V72.5 L50 95 L11 72.5 V27.5 Z',
  diamond: 'M50 4 L94 50 L50 96 L6 50 Z',
  pennant: 'M12 8 H88 V66 L50 94 L12 66 Z',
}

/** Shift and scale so the glyph sits in the visual center of each outline. */
const GLYPH_FIT: Record<CrestShape, string> = {
  shield: 'translate(0 -2)',
  circle: '',
  hexagon: '',
  diamond: 'translate(50 50) scale(0.8) translate(-50 -50)',
  pennant: 'translate(0 -6)',
}

function starPoints(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = (Math.PI / 5) * i - Math.PI / 2
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`)
  }
  return pts.join(' ')
}

function Glyph({ glyph, fg, bg }: { glyph: CrestGlyph; fg: string; bg: string }): ReactNode {
  switch (glyph) {
    case 'star':
      return <polygon points={starPoints(50, 51, 21, 9)} fill={fg} />
    case 'bolt':
      return <path d="M55 26 L37 55 H49 L44 74 L64 44 H52 L58 26 Z" fill={fg} />
    case 'wave':
      return (
        <g fill="none" stroke={fg} strokeWidth={5} strokeLinecap="round">
          <path d="M30 43 q5 -8 10 0 t10 0 t10 0 t10 0" />
          <path d="M30 58 q5 -8 10 0 t10 0 t10 0 t10 0" />
        </g>
      )
    case 'peak':
      return (
        <g>
          <path d="M27 67 L44 37 L52 50 L58 41 L73 67 Z" fill={fg} />
          <path d="M44 37 L39 46 L44 44 L48 47 Z" fill={bg} />
        </g>
      )
    case 'wing':
      return (
        <path
          d="M29 62 C38 38 58 31 73 32 C67 38 64 42 56 44 C63 46 61 51 53 53 C57 57 51 62 44 62 Z"
          fill={fg}
        />
      )
    case 'sun': {
      const rays = Array.from({ length: 8 }, (_, i) => {
        const a = (Math.PI / 4) * i
        return (
          <line
            key={i}
            x1={50 + 14 * Math.cos(a)}
            y1={50 + 14 * Math.sin(a)}
            x2={50 + 21 * Math.cos(a)}
            y2={50 + 21 * Math.sin(a)}
          />
        )
      })
      return (
        <g stroke={fg} strokeWidth={4} strokeLinecap="round">
          <circle cx={50} cy={50} r={9} fill={fg} stroke="none" />
          {rays}
        </g>
      )
    }
    case 'flame':
      return (
        <path
          d="M50 27 C58 39 64 46 64 56 C64 66 57 73 50 73 C43 73 36 66 36 56 C36 48 42 44 44 36 C46 43 50 46 50 46 C52 40 50 34 50 27 Z"
          fill={fg}
        />
      )
    case 'leaf':
      return (
        <g>
          <path d="M31 68 C31 45 45 32 70 32 C70 56 56 69 33 69 Z" fill={fg} />
          <path d="M35 65 L60 41" stroke={bg} strokeWidth={2.5} strokeLinecap="round" />
        </g>
      )
  }
}

export interface CrestProps {
  crest: CrestSpec
  colors: { primary: string; secondary: string }
  size?: number
  title?: string
}

/** Team crest: outline + optional band + glyph, in the team's two colors. */
export function Crest({ crest, colors, size = 48, title }: CrestProps) {
  const clip = `crest${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const outline = SHAPES[crest.shape]
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title}>
      {title && <title>{title}</title>}
      <defs>
        <clipPath id={clip}>
          <path d={outline} />
        </clipPath>
      </defs>
      <path d={outline} fill={colors.primary} />
      {crest.band && (
        // Clip on the group, not the rotated rect, so the clip outline is not rotated too.
        <g clipPath={`url(#${clip})`}>
          <rect
            x={-20}
            y={41}
            width={140}
            height={18}
            transform="rotate(-35 50 50)"
            fill={colors.secondary}
            opacity={0.28}
          />
        </g>
      )}
      <g transform={GLYPH_FIT[crest.shape]}>
        <Glyph glyph={crest.glyph} fg={colors.secondary} bg={colors.primary} />
      </g>
      <path
        d={outline}
        fill="none"
        stroke={colors.secondary}
        strokeWidth={4}
        strokeLinejoin="round"
      />
    </svg>
  )
}
