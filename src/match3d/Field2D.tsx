import { useMemo } from 'react'
import { createRng } from '@/sim/rng'
import type { FieldProps } from './FieldProps'
import {
  BOWLER,
  fielderPositions,
  INNER_RING,
  KEEPER,
  NON_STRIKER,
  PITCH_LENGTH,
  PITCH_WIDTH,
  shotControl,
  shotEnd,
  STANDS_DEPTH,
  STANDS_GAP,
  STRIKER,
  type Point,
} from './geometry'

/**
 * 2D SVG field: the fallback for phones without WebGL or too slow for 3D. Same geometry
 * and the same ball events as the 3D view.
 */
export default function Field2D({
  radius,
  phase,
  event,
  eventKey,
  batColor,
  reducedMotion,
}: FieldProps) {
  const ext = radius + STANDS_GAP + STANDS_DEPTH - 2
  const inner = radius + STANDS_GAP
  const fielders = useMemo(() => fielderPositions(phase, radius), [phase, radius])
  const crowd = useMemo(() => {
    const rng = createRng(42)
    const palette = ['#f2f2f2', '#e5484d', '#f5c542', '#4b62a8', '#3cc26a', '#ff8a3d', '#9b5de5']
    const dots: { x: number; y: number; c: string }[] = []
    for (let r = 0; r < 5; r++) {
      const rr = inner + 2 + r * 2.9
      const n = Math.floor((2 * Math.PI * rr) / 3.2)
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2
        dots.push({
          x: Math.cos(a) * rr,
          y: Math.sin(a) * rr,
          c: palette[Math.floor(rng() * palette.length)] as string,
        })
      }
    }
    return dots
  }, [inner])
  const flight = event?.shot ? shotEnd(event.shot, event.boundary, radius) : null
  const ctrl = flight && event?.shot ? shotControl(STRIKER, flight, event.shot.aerial) : null
  const disc = (p: Point, fill: string, r = 1.5) => (
    <circle cx={p.x} cy={p.y} r={r} fill={fill} stroke="#1b2238" strokeWidth={0.5} />
  )
  const landAngle = flight ? Math.atan2(flight.y, flight.x) : 0
  const arcPt = (a: number) => `${Math.cos(a) * radius} ${Math.sin(a) * radius}`
  return (
    <svg
      className="field2d"
      viewBox={`${-ext} ${-ext} ${ext * 2} ${ext * 2}`}
      role="img"
      aria-label="Field view"
    >
      <defs>
        <pattern id="mow" width="12" height="12" patternUnits="userSpaceOnUse">
          <rect width="6" height="12" fill="#46ab53" />
          <rect x="6" width="6" height="12" fill="#3c9a48" />
        </pattern>
      </defs>
      <circle
        r={inner + STANDS_DEPTH / 2}
        fill="none"
        stroke="#8a5a3a"
        strokeWidth={STANDS_DEPTH}
      />
      {crowd.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={1.1} fill={d.c} />
      ))}
      <circle r={inner} fill="#e6d8bb" />
      <circle r={radius + 2.5} fill="url(#mow)" />
      <circle r={radius} fill="none" stroke="#fff" strokeWidth={0.7} />
      <circle
        r={INNER_RING}
        fill="none"
        stroke="#fff"
        strokeOpacity={0.75}
        strokeWidth={0.4}
        strokeDasharray="1.6 1.3"
      />
      <rect
        x={-PITCH_WIDTH / 2}
        y={-PITCH_LENGTH / 2 - 1.2}
        width={PITCH_WIDTH}
        height={PITCH_LENGTH + 2.4}
        fill="#c9a06a"
      />
      {fielders.map((f, i) => (
        <g key={i}>{disc(f, '#fff')}</g>
      ))}
      {disc(KEEPER, '#fff')}
      {disc(BOWLER, '#fff')}
      {disc(STRIKER, batColor, 1.6)}
      {disc(NON_STRIKER, batColor, 1.6)}
      {flight && ctrl && (
        <g key={eventKey}>
          <path
            d={`M${STRIKER.x} ${STRIKER.y} Q${ctrl.x} ${ctrl.y} ${flight.x} ${flight.y}`}
            fill="none"
            stroke="#f6e05e"
            strokeWidth={0.9}
            pathLength={1}
            strokeDasharray="1 1"
            className={reducedMotion ? '' : 'draw-arc'}
          />
          <circle cx={flight.x} cy={flight.y} r={0.9} fill="#fff" />
          {event?.boundary && (
            <path
              d={`M${arcPt(landAngle - 0.22)} A${radius} ${radius} 0 0 1 ${arcPt(landAngle + 0.22)}`}
              fill="none"
              stroke="#f6e05e"
              strokeWidth={2}
            />
          )}
        </g>
      )}
    </svg>
  )
}
