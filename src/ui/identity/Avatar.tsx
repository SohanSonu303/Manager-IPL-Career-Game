import { useId, type ReactNode } from 'react'
import type { CrestSpec, Nationality } from '@/data/types'
import { Crest } from './Crest'
import {
  avatarSpec,
  HAIR_COLORS,
  HEAD_SHAPES,
  SKIN_TONES,
  type AvatarSpec,
  type FacialHair,
  type HairStyle,
  type RingStatus,
} from './avatarSpec'

/*
 * Style sheet: flat fills, no gradients, one 1.6 stroke weight for facial lines,
 * three shades per skin tone (base, shadow, highlight). Features are drawn for a
 * reference head (center 50,44, radii 20×24) and scaled to the chosen head shape.
 */

const INK = '#2a1d18'
/** Soft outline on every shape, for definition on dark backgrounds. */
const OUTLINE = {
  stroke: '#1a1416',
  strokeOpacity: 0.55,
  strokeWidth: 1.2,
  strokeLinejoin: 'round',
} as const
const RING_COLORS: Record<RingStatus, string> = {
  good: 'var(--money, #4cc38a)',
  ok: 'var(--warn, #f5b942)',
  poor: 'var(--danger, #ef6461)',
}

const SHORT_CAP =
  'M29 46 C26 24 38 15 50 15 C62 15 74 24 71 46 C70 38 67 32 62 30 C56 28 44 28 38 30 C33 32 30 38 29 46 Z'

function curls(): string[] {
  // Ring of curls hugging the top of the head.
  const out: string[] = []
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI + (Math.PI * i) / 8
    out.push(`${(50 + 21 * Math.cos(a)).toFixed(1)},${(40 + 23 * Math.sin(a)).toFixed(1)}`)
  }
  return out
}

function HairBack({ style, color }: { style: HairStyle; color: string }): ReactNode {
  if (style !== 'long') return null
  return (
    <path
      d="M27 44 C25 18 40 13 50 13 C60 13 75 18 73 44 L75 70 C70 72 66 72 64 70 L64 50 L36 50 L36 70 C34 72 30 72 25 70 Z"
      fill={color}
    />
  )
}

function HairFront({ style, color }: { style: HairStyle; color: string }): ReactNode {
  switch (style) {
    case 'buzz':
      return (
        <path
          d="M30 42 C29 25 39 18 50 18 C61 18 71 25 70 42 C68 35 64 31 59 30 C54 29 46 29 41 30 C36 31 32 35 30 42 Z"
          fill={color}
          opacity={0.7}
        />
      )
    case 'short':
    case 'long':
      return <path d={SHORT_CAP} fill={color} />
    case 'sidepart':
      return (
        <g fill={color}>
          <path d={SHORT_CAP} />
          <path d="M30 39 C33 26 47 21 67 28 C60 32 45 30 30 39 Z" />
        </g>
      )
    case 'quiff':
      return (
        <g fill={color}>
          <path d={SHORT_CAP} />
          <path d="M37 30 C35 16 50 7 62 12 C67 14 67 20 65 25 C58 20 47 22 37 30 Z" />
        </g>
      )
    case 'curly':
      return (
        <g fill={color}>
          <path d={SHORT_CAP} />
          {curls().map((pt) => {
            const [cx, cy] = pt.split(',').map(Number)
            return <circle key={pt} cx={cx} cy={cy} r={6} />
          })}
        </g>
      )
    case 'bald':
      return (
        <g fill={color}>
          <path d="M28.5 49 C27.5 43 28.5 37 31.5 35 L32.5 49 Z" />
          <path d="M71.5 49 C72.5 43 71.5 37 68.5 35 L67.5 49 Z" />
        </g>
      )
    case 'receding':
      return (
        <path
          d="M29 46 C26 26 38 16 50 16 C62 16 74 26 71 46 C70 38 68 32 64 31 C61 25 39 25 36 31 C32 32 30 38 29 46 Z"
          fill={color}
        />
      )
    case 'spiky':
      return (
        <path
          d="M29 44 L30 24 L35 27 L38 15 L44 22 L50 11 L56 22 L62 15 L65 27 L70 24 L71 44 C69 35 62 30 50 30 C38 30 31 35 29 44 Z"
          fill={color}
        />
      )
    case 'bun':
      return (
        <g fill={color}>
          <path d={SHORT_CAP} />
          <circle cx={50} cy={12} r={7} />
        </g>
      )
  }
}

const MOUSTACHE =
  'M42.5 58 C45 55 48 55.5 50 56.5 C52 55.5 55 55 57.5 58 C54 58.6 52 58 50 58.3 C48 58 46 58.6 42.5 58 Z'
const FULL_BEARD =
  'M29 44 C29 64 38 76 50 76 C62 76 71 64 71 44 C69 52 66 58 61 60 C57 65 43 65 39 60 C34 58 31 52 29 44 Z'

function FacialHairLayer({ kind, color }: { kind: FacialHair; color: string }): ReactNode {
  switch (kind) {
    case 'none':
      return null
    case 'stubble':
      return <path d={FULL_BEARD} fill={color} opacity={0.28} />
    case 'moustache':
      return <path d={MOUSTACHE} fill={color} />
    case 'goatee':
      return (
        <g fill={color}>
          <path d={MOUSTACHE} />
          <path d="M45 63.5 C46 70 54 70 55 63.5 C53 65 47 65 45 63.5 Z" />
        </g>
      )
    case 'short':
      return (
        <g fill={color}>
          <path d="M30 48 C31 63 40 71 50 71 C60 71 69 63 70 48 C68 55 65 59 61 61 C57 64 43 64 39 61 C35 59 32 55 30 48 Z" />
          <path d={MOUSTACHE} />
        </g>
      )
    case 'full':
      return (
        <g fill={color}>
          <path d={FULL_BEARD} />
          <path d={MOUSTACHE} />
        </g>
      )
  }
}

function Face({ spec, kit }: { spec: AvatarSpec; kit: { primary: string; secondary: string } }) {
  const [base, shadow, highlight] = SKIN_TONES[spec.skin] ?? SKIN_TONES[3]
  const hair = HAIR_COLORS[spec.hairColor]
  const [rx, ry] = HEAD_SHAPES[spec.head]
  const fit = `translate(50 44) scale(${rx / 20} ${ry / 24}) translate(-50 -44)`
  const browWidth = spec.brows === 'thick' ? 3.2 : 2
  const browColor = spec.hairColor === 'grey' || spec.hairColor === 'blonde' ? hair : INK
  return (
    <>
      <g transform={fit}>
        <g {...OUTLINE}>
          <HairBack style={spec.hair} color={hair} />
        </g>
      </g>
      <rect x={43} y={58} width={14} height={24} fill={shadow} />
      <path
        d="M8 100 C10 84 27 76 42 75 L50 83 L58 75 C73 76 90 84 92 100 Z"
        fill={kit.primary}
        {...OUTLINE}
      />
      <path
        d="M42 75 L50 83 L58 75"
        fill="none"
        stroke={kit.secondary}
        strokeWidth={3.5}
        strokeLinejoin="round"
      />
      <g transform={fit}>
        <ellipse cx={29.5} cy={47} rx={3.6} ry={5.5} fill={base} />
        <ellipse cx={70.5} cy={47} rx={3.6} ry={5.5} fill={base} />
        <ellipse cx={29.8} cy={47.5} rx={1.6} ry={3} fill={shadow} />
        <ellipse cx={70.2} cy={47.5} rx={1.6} ry={3} fill={shadow} />
        <ellipse cx={50} cy={44} rx={20} ry={24} fill={base} {...OUTLINE} />
        <ellipse cx={43} cy={30} rx={7} ry={4} fill={highlight} opacity={0.6} />
        <FacialHairLayer kind={spec.facialHair} color={hair} />
        <g fill="none" stroke={browColor} strokeWidth={browWidth} strokeLinecap="round">
          {spec.brows === 'arched' ? (
            <>
              <path d="M37.5 41.5 Q41.5 38 46 40" />
              <path d="M54 40 Q58.5 38 62.5 41.5" />
            </>
          ) : (
            <>
              <path d="M37.5 40.6 L46 39.6" />
              <path d="M54 39.6 L62.5 40.6" />
            </>
          )}
        </g>
        <ellipse cx={42} cy={46.5} rx={3.4} ry={2.7} fill="#f4efe9" />
        <ellipse cx={58} cy={46.5} rx={3.4} ry={2.7} fill="#f4efe9" />
        <ellipse cx={42} cy={46.5} rx={2.2} ry={2.6} fill={INK} />
        <ellipse cx={58} cy={46.5} rx={2.2} ry={2.6} fill={INK} />
        <circle cx={42.7} cy={45.6} r={0.7} fill="#fff" />
        <circle cx={58.7} cy={45.6} r={0.7} fill="#fff" />
        <path
          d="M50 47.5 C49 51 48 53 48.6 54.6 C49.6 55.4 51 55.4 52 54.7"
          fill="none"
          stroke={shadow}
          strokeWidth={1.6}
          strokeLinecap="round"
        />
        <path
          d={spec.smile ? 'M44.5 61 Q50 65.5 55.5 61' : 'M45.5 62 Q50 63.2 54.5 62'}
          fill="none"
          stroke={INK}
          strokeWidth={1.6}
          strokeLinecap="round"
        />
        <g {...OUTLINE}>
          <HairFront style={spec.hair} color={hair} />
        </g>
      </g>
    </>
  )
}

export interface AvatarProps {
  /** Player id; the face is derived from it. */
  seed: string
  nationality: Nationality
  age?: number
  kit: { primary: string; secondary: string }
  size?: number
  /** Form/fitness ring around the avatar. */
  ring?: RingStatus
  /** Small team crest in the corner. */
  badge?: { crest: CrestSpec; colors: { primary: string; secondary: string } }
  /** Future portrait (AI or photo); replaces the drawn face when set. */
  imageUrl?: string
  background?: string
  title?: string
}

export function Avatar({
  seed,
  nationality,
  age,
  kit,
  size = 56,
  ring,
  badge,
  imageUrl,
  background = '#4a5163',
  title,
}: AvatarProps) {
  const clip = `av${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const inner = ring ? 44 : 50
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title}>
      {title && <title>{title}</title>}
      <defs>
        <clipPath id={clip}>
          <circle cx={50} cy={50} r={inner} />
        </clipPath>
      </defs>
      <circle cx={50} cy={50} r={inner} fill={background} />
      <g clipPath={`url(#${clip})`}>
        {imageUrl ? (
          <image
            href={imageUrl}
            x={0}
            y={0}
            width={100}
            height={100}
            preserveAspectRatio="xMidYMid slice"
          />
        ) : (
          <g
            transform={
              ring
                ? 'translate(50 54) scale(1.04) translate(-50 -50)'
                : 'translate(50 56) scale(1.16) translate(-50 -50)'
            }
          >
            <Face spec={avatarSpec(seed, nationality, age)} kit={kit} />
          </g>
        )}
      </g>
      {ring && (
        <circle cx={50} cy={50} r={47} fill="none" stroke={RING_COLORS[ring]} strokeWidth={5} />
      )}
      {badge && (
        <g transform="translate(68 68)">
          <Crest crest={badge.crest} colors={badge.colors} size={30} />
        </g>
      )}
    </svg>
  )
}
