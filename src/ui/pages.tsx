import { useGame } from '@/state/store'

export function Home() {
  return <h1>Cricket Manager</h1>
}

export function Debug() {
  const seed = useGame((s) => s.seed)
  return <h1>Sim debug (seed {seed})</h1>
}

export function Settings() {
  const version = useGame((s) => s.version)
  return <h1>Settings (save v{version})</h1>
}
