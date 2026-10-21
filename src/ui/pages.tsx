import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { SAVE_VERSION } from '@/state/save'
import { downloadSave } from '@/state/storage'
import { importSave, resetCareer, simToSeasonEnd, useGame } from '@/state/store'
import { Screen } from './kit/kit'
import { MatchDebug } from './match/MatchDebug'
import { readViewMode, VIEW_KEY, type ViewMode } from './MatchPage'

export function Debug() {
  const career = useGame((s) => s.career)
  return (
    <Screen>
      <h1>Sim debug</h1>
      <p>
        <Link to="/gallery">Identity gallery</Link>
      </p>
      {career && (
        <>
          <p className="dim">
            Seed {career.seed} · {career.calendar.year} day {career.calendar.day}
          </p>
          <button onClick={simToSeasonEnd}>Quick-sim to the end of this season</button>
        </>
      )}
      <MatchDebug />
    </Screen>
  )
}

export function Settings() {
  const career = useGame((s) => s.career)
  const [paste, setPaste] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [view, setView] = useState<ViewMode>(readViewMode)
  const chooseView = (v: ViewMode) => {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      // Per-device preference only; fine to lose.
    }
  }

  const doImport = (text: string) => {
    const error = importSave(text)
    setMessage(error ?? 'Career imported.')
    if (!error) setPaste('')
  }

  return (
    <Screen>
      <h1>Settings</h1>
      <p>
        <Link to="/debug">Sim debug</Link> · <Link to="/gallery">Identity gallery</Link>
      </p>
      <p className="dim">
        Save format v{SAVE_VERSION}. Your career saves automatically in this browser.
      </p>

      <h2 className="section">Match view</h2>
      <div className="filters">
        {(
          [
            ['auto', 'Auto'],
            ['3d', '3D stadium'],
            ['2d', '2D (lighter)'],
          ] as const
        ).map(([v, label]) => (
          <button key={v} className={view === v ? 'on' : ''} onClick={() => chooseView(v)}>
            {label}
          </button>
        ))}
      </div>
      <p className="dim">Auto uses 3D and drops to 2D if your phone struggles.</p>

      <h2 className="section">Backup</h2>
      <div className="button-row">
        <button disabled={!career} onClick={() => career && downloadSave(career)}>
          Export to file
        </button>
        <button onClick={() => fileInput.current?.click()}>Import from file</button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (file) doImport(await file.text())
            e.target.value = ''
          }}
        />
      </div>
      <label className="field">
        Or paste a save
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4} />
      </label>
      <button disabled={!paste.trim()} onClick={() => doImport(paste)}>
        Import pasted save
      </button>
      {message && <p className="dim">{message}</p>}

      <h2 className="section">Danger zone</h2>
      <button
        className="danger"
        disabled={!career}
        onClick={() => {
          if (confirm('Delete this career? Export it first if you want to keep it.')) resetCareer()
        }}
      >
        Reset career
      </button>
      <p className="dim" style={{ marginTop: 24 }}>
        Prototype build · {__APP_VERSION__}
      </p>
    </Screen>
  )
}
