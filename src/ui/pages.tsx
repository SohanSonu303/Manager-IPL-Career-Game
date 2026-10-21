import { Link } from 'react-router-dom'
import { setFictionalNames, useGame } from '@/state/store'

export function Home() {
  return <h1>Cricket Manager</h1>
}

export function Debug() {
  const seed = useGame((s) => s.seed)
  return (
    <>
      <h1>Sim debug (seed {seed})</h1>
      <p>
        <Link to="/gallery">Identity gallery</Link>
      </p>
    </>
  )
}

export function Settings() {
  const version = useGame((s) => s.version)
  const fictional = useGame((s) => s.settings.fictionalNames)
  return (
    <>
      <h1>Settings (save v{version})</h1>
      <label className="toggle">
        <input
          type="checkbox"
          checked={fictional}
          onChange={(e) => setFictionalNames(e.target.checked)}
        />
        Fictional player names
      </label>
    </>
  )
}
