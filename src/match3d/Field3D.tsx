import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line, OrthographicCamera } from '@react-three/drei'
import * as THREE from 'three'
import { createRng } from '@/sim/rng'
import type { FieldProps } from './FieldProps'
import {
  bezier,
  BOWLER,
  fielderPositions,
  INNER_RING,
  KEEPER,
  nearest,
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

/*
 * Top-down stadium in three.js. Flat, unlit materials (no real-time shadows), instanced
 * crowd, device pixel ratio capped at 2. Everything here is our own procedural art.
 */

const FLIGHT_SECONDS = 0.9
/** Lift a 2D point onto the ground plane (x, height, y). */
const v3 = (p: Point, h = 0) => new THREE.Vector3(p.x, h, p.y)
const FLAT = -Math.PI / 2

function useCanvasTexture(
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  size = 1024,
) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = size
    c.height = size
    const ctx = c.getContext('2d')
    if (ctx) draw(ctx, size)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
    // Textures are drawn once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => () => tex.dispose(), [tex])
  return tex
}

function Camera({ radius }: { radius: number }) {
  const width = useThree((s) => s.size.width)
  const extent = radius + STANDS_GAP + STANDS_DEPTH - 2
  return (
    <OrthographicCamera
      makeDefault
      position={[0, 150, 0]}
      up={[0, 0, -1]}
      near={1}
      far={400}
      zoom={width / (2 * extent)}
      onUpdate={(c) => c.lookAt(0, 0, 0)}
    />
  )
}

function Ground({ radius }: { radius: number }) {
  const grass = useCanvasTexture((ctx, s) => {
    const bands = 16
    for (let i = 0; i < bands; i++) {
      ctx.fillStyle = i % 2 ? '#3c9a48' : '#46ab53'
      ctx.fillRect((i * s) / bands, 0, s / bands + 1, s)
    }
    const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.1, s / 2, s / 2, s / 2)
    g.addColorStop(0, 'rgba(255,255,255,0.06)')
    g.addColorStop(1, 'rgba(0,0,0,0.12)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
  })
  const pitch = useCanvasTexture((ctx, s) => {
    ctx.fillStyle = '#c9a06a'
    ctx.fillRect(0, 0, s, s)
    const rng = createRng(7)
    ctx.strokeStyle = 'rgba(110,70,30,0.55)'
    ctx.lineWidth = 3
    for (let i = 0; i < 70; i++) {
      let x = rng() * s
      let y = rng() * s
      ctx.beginPath()
      ctx.moveTo(x, y)
      for (let k = 0; k < 4; k++) {
        x += (rng() - 0.5) * 90
        y += (rng() - 0.5) * 90
        ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  }, 512)
  const crease = (y: number, half: number) => [
    new THREE.Vector3(-half, 0.05, y),
    new THREE.Vector3(half, 0.05, y),
  ]
  const pop = PITCH_LENGTH / 2 - 1.22
  const ring = useMemo(
    () =>
      Array.from({ length: 121 }, (_, i) =>
        v3(
          {
            x: Math.cos((i / 120) * Math.PI * 2) * INNER_RING,
            y: Math.sin((i / 120) * Math.PI * 2) * INNER_RING,
          },
          0.03,
        ),
      ),
    [],
  )
  return (
    <group>
      <mesh rotation-x={FLAT}>
        <circleGeometry args={[radius + 2.5, 128]} />
        <meshBasicMaterial map={grass} />
      </mesh>
      <mesh rotation-x={FLAT} position-y={0.01}>
        <ringGeometry args={[radius + 2.5, radius + STANDS_GAP, 128]} />
        <meshBasicMaterial color="#e6d8bb" />
      </mesh>
      <mesh rotation-x={FLAT} position-y={0.02}>
        <ringGeometry args={[radius - 0.35, radius + 0.35, 180]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <Line
        points={ring}
        color="#ffffff"
        lineWidth={1.5}
        dashed
        dashSize={1.6}
        gapSize={1.3}
        transparent
        opacity={0.75}
      />
      <mesh rotation-x={FLAT} position-y={0.02}>
        <planeGeometry args={[PITCH_WIDTH, PITCH_LENGTH + 2.4]} />
        <meshBasicMaterial map={pitch} />
      </mesh>
      {[pop, -pop].map((y) => (
        <Line key={y} points={crease(y, 1.83)} color="#ffffff" lineWidth={1.5} />
      ))}
      {[PITCH_LENGTH / 2, -PITCH_LENGTH / 2].map((y) => (
        <mesh key={y} rotation-x={FLAT} position={[0, 0.04, y]}>
          <planeGeometry args={[0.5, 0.25]} />
          <meshBasicMaterial color="#3b2a1a" />
        </mesh>
      ))}
    </group>
  )
}

function Stands({ radius }: { radius: number }) {
  const inner = radius + STANDS_GAP
  const outer = inner + STANDS_DEPTH
  const crowd = useRef<THREE.InstancedMesh>(null)
  const rows = 6
  const count = useMemo(() => {
    let n = 0
    for (let r = 0; r < rows; r++) n += Math.floor((2 * Math.PI * (inner + 1.6 + r * 2.4)) / 1.9)
    return n
  }, [inner])
  useLayoutEffect(() => {
    const mesh = crowd.current
    if (!mesh) return
    const rng = createRng(42)
    const palette = [
      '#f2f2f2',
      '#e5484d',
      '#f5c542',
      '#4b62a8',
      '#3cc26a',
      '#ff8a3d',
      '#9b5de5',
      '#2ec4b6',
      '#1d1d1d',
    ]
    const m = new THREE.Matrix4()
    const c = new THREE.Color()
    let i = 0
    for (let r = 0; r < rows; r++) {
      const rr = inner + 1.6 + r * 2.4
      const n = Math.floor((2 * Math.PI * rr) / 1.9)
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rng() * 0.02
        // Circles lie flat to face the top-down camera.
        m.makeRotationX(FLAT).setPosition(Math.cos(a) * rr, 0.1, Math.sin(a) * rr)
        mesh.setMatrixAt(i, m)
        mesh.setColorAt(i, c.set(palette[Math.floor(rng() * palette.length)] as string))
        i++
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [count, inner])
  const sections = useMemo(
    () =>
      Array.from({ length: 15 }, (_, i) => {
        const a = (i / 15) * Math.PI * 2
        return [
          new THREE.Vector3(Math.cos(a) * inner, 0.2, Math.sin(a) * inner),
          new THREE.Vector3(Math.cos(a) * outer, 0.2, Math.sin(a) * outer),
        ]
      }),
    [inner, outer],
  )
  return (
    <group>
      <mesh rotation-x={FLAT}>
        <ringGeometry args={[inner, outer, 128]} />
        <meshBasicMaterial color="#8a5a3a" />
      </mesh>
      <instancedMesh ref={crowd} args={[undefined, undefined, count]} frustumCulled={false}>
        <circleGeometry args={[0.75, 6]} />
        <meshBasicMaterial />
      </instancedMesh>
      {sections.map((pts, i) => (
        <Line key={i} points={pts} color="#e6d8bb" lineWidth={2} />
      ))}
    </group>
  )
}

function Floodlights({ radius }: { radius: number }) {
  const r = radius + STANDS_GAP + STANDS_DEPTH - 3
  const cone = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(0, 0)
    s.lineTo(-9, -radius * 0.9)
    s.lineTo(9, -radius * 0.9)
    s.closePath()
    return s
  }, [radius])
  return (
    <group>
      {[45, 135, 225, 315].map((deg) => {
        const a = (deg * Math.PI) / 180
        return (
          <group
            key={deg}
            position={[Math.cos(a) * r, 0.3, Math.sin(a) * r]}
            rotation-y={-a - Math.PI / 2}
          >
            <mesh rotation-x={FLAT} position-y={0}>
              <shapeGeometry args={[cone]} />
              <meshBasicMaterial
                color="#ffffff"
                transparent
                opacity={0.07}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
            {[-2.6, 0, 2.6].flatMap((x) =>
              [0, -2.4].map((z) => (
                <mesh key={`${x}-${z}`} rotation-x={FLAT} position={[x, 0.5, z]}>
                  <circleGeometry args={[1.1, 12]} />
                  <meshBasicMaterial color="#fffbe6" />
                </mesh>
              )),
            )}
          </group>
        )
      })}
    </group>
  )
}

function AdBoards({ radius }: { radius: number }) {
  const tex = useCanvasTexture((ctx, s) => {
    ctx.fillStyle = 'rgba(235, 226, 110, 0.9)'
    ctx.fillRect(0, s * 0.36, s, s * 0.28)
    ctx.fillStyle = '#3a3a2a'
    ctx.font = `700 ${s * 0.085}px "Barlow Condensed", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('YOUR SPONSOR HERE', s / 2, s / 2)
  }, 512)
  return (
    <>
      {[radius - 13, -(radius - 13)].map((y) => (
        <mesh key={y} rotation-x={FLAT} position={[0, 0.05, y]}>
          <planeGeometry args={[18, 18]} />
          <meshBasicMaterial map={tex} transparent depthWrite={false} />
        </mesh>
      ))}
    </>
  )
}

function Disc({
  at,
  color,
  ring = '#1b2238',
  r = 1.5,
}: {
  at: Point
  color: string
  ring?: string
  r?: number
}) {
  return (
    <group position={[at.x, 0.3, at.y]}>
      <mesh rotation-x={FLAT}>
        <circleGeometry args={[r + 0.35, 24]} />
        <meshBasicMaterial color={ring} />
      </mesh>
      <mesh rotation-x={FLAT} position-y={0.01}>
        <circleGeometry args={[r, 24]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  )
}

/** Fielders, batters, ball and shot arc for the latest delivery. */
function Play({ radius, phase, field, event, eventKey, batColor, reducedMotion }: FieldProps) {
  const fielders = useMemo(() => fielderPositions(phase, radius, field), [phase, radius, field])
  const flight = useMemo(() => {
    if (!event?.shot) return null
    const end = shotEnd(event.shot, event.boundary, radius)
    const ctrl = shotControl(STRIKER, end, event.shot.aerial)
    const pts = Array.from({ length: 33 }, (_, i) => v3(bezier(STRIKER, ctrl, end, i / 32), 0.6))
    const length = pts.reduce(
      (s, p, i) => (i ? s + p.distanceTo(pts[i - 1] as THREE.Vector3) : 0),
      0,
    )
    return { end, ctrl, pts, length, chaser: nearest(fielders, end) }
  }, [event, radius, fielders])

  const ball = useRef<THREE.Mesh>(null)
  const chaser = useRef<THREE.Group>(null)
  const arc = useRef<{ material: { dashOffset: number } } | null>(null)
  const t = useRef(0)
  useEffect(() => {
    t.current = reducedMotion ? FLIGHT_SECONDS : 0
  }, [eventKey, reducedMotion])

  useFrame((_, dt) => {
    if (!flight) return
    t.current = Math.min(FLIGHT_SECONDS, t.current + dt)
    const p = t.current / FLIGHT_SECONDS
    const at = bezier(STRIKER, flight.ctrl, flight.end, p)
    if (ball.current) {
      // Aerial shots grow as they rise and shrink as they come down (top-down view).
      const lift = event?.shot?.aerial ? 1 + Math.sin(p * Math.PI) * 0.9 : 1
      ball.current.position.set(at.x, 1, at.y)
      ball.current.scale.setScalar(lift)
    }
    if (chaser.current) {
      const home = fielders[flight.chaser] as Point
      const k = Math.min(1, p * 0.6)
      chaser.current.position.set(
        (flight.end.x - home.x) * k * 0.4,
        0,
        (flight.end.y - home.y) * k * 0.4,
      )
    }
    if (arc.current) arc.current.material.dashOffset = flight.length * (1 - p)
  })

  const landAngle = flight ? Math.atan2(-flight.end.y, flight.end.x) : 0
  return (
    <group>
      {fielders.map((f, i) =>
        flight && i === flight.chaser ? (
          <group key={i} ref={chaser}>
            <Disc at={f} color="#ffffff" />
          </group>
        ) : (
          <Disc key={i} at={f} color="#ffffff" />
        ),
      )}
      <Disc at={KEEPER} color="#ffffff" />
      <Disc at={BOWLER} color="#ffffff" />
      <Disc at={STRIKER} color={batColor} ring="#0d3b3a" r={1.6} />
      <Disc at={NON_STRIKER} color={batColor} ring="#0d3b3a" r={1.6} />
      {flight && (
        <>
          <Line
            key={eventKey}
            ref={arc as never}
            points={flight.pts}
            color="#f6e05e"
            lineWidth={3}
            dashed
            dashSize={flight.length}
            gapSize={flight.length}
            dashOffset={reducedMotion ? 0 : flight.length}
          />
          <mesh ref={ball} rotation-x={FLAT} position={[STRIKER.x, 1, STRIKER.y]}>
            <circleGeometry args={[0.7, 16]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          {event?.boundary && (
            <mesh rotation-x={FLAT} position-y={0.06}>
              <ringGeometry args={[radius - 1.1, radius + 1.1, 48, 1, landAngle - 0.22, 0.44]} />
              <meshBasicMaterial color="#f6e05e" />
            </mesh>
          )}
        </>
      )}
    </group>
  )
}

/** Calls `onSlow` if the frame rate stays under 25 fps for three seconds. */
function FpsWatch({ onSlow }: { onSlow?: () => void }) {
  const acc = useRef({ frames: 0, time: 0, warm: 0 })
  useFrame((_, dt) => {
    const a = acc.current
    a.warm += dt
    if (a.warm < 2) return // ignore start-up hitches
    a.frames++
    a.time += dt
    if (a.time >= 3) {
      if (a.frames / a.time < 25) onSlow?.()
      a.frames = 0
      a.time = 0
    }
  })
  return null
}

export default function Field3D(props: FieldProps) {
  return (
    <Canvas
      dpr={[1, 2]}
      flat
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
    >
      <Camera radius={props.radius} />
      <Stands radius={props.radius} />
      <Floodlights radius={props.radius} />
      <Ground radius={props.radius} />
      <AdBoards radius={props.radius} />
      <Play {...props} />
      <FpsWatch onSlow={props.onSlow} />
    </Canvas>
  )
}
