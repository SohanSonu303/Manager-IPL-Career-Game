import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { teamById, teams } from '@/data'
import { describeEvent, today } from '@/sim/calendar'
import { SAVE_VERSION } from '@/state/save'
import { downloadSave } from '@/state/storage'
import {
  advanceDays,
  continueToNextEvent,
  importSave,
  resetCareer,
  startCareer,
  useGame,
} from '@/state/store'
import { Crest } from './identity/Crest'
import { MatchDebug } from './match/MatchDebug'
import { SquadList } from './SquadList'

const PHASE_LABEL = {
  preseason: 'Preseason',
  league: 'League',
  playoffs: 'Playoffs',
  offseason: 'Offseason',
}

export function Home() {
  const career = useGame((s) => s.career)
  return career ? <ClubHome /> : <NewCareer />
}

function NewCareer() {
  const [name, setName] = useState('')
  return (
    <>
      <h1>New career</h1>
      <label className="field">
        Manager name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
      </label>
      <h2 className="section">Choose your club</h2>
      <ul className="team-pick">
        {teams.map((t) => (
          <li key={t.id}>
            <button onClick={() => startCareer(t.id, name)}>
              <Crest crest={t.crest} colors={t.colors} size={44} />
              <span>
                <strong>{t.name}</strong>
                <small>
                  {t.ground}, {t.city}
                </small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function ClubHome() {
  const career = useGame((s) => s.career)
  if (!career) return null
  const team = teamById.get(career.manager.teamId)
  const day = today(career.calendar)
  const squad = career.players.filter((p) => p.teamId === career.manager.teamId)
  return (
    <>
      <header className="club-head">
        {team && <Crest crest={team.crest} colors={team.colors} size={56} />}
        <div>
          <h1>{team?.name}</h1>
          <p className="dim">Manager: {career.manager.name}</p>
        </div>
      </header>
      <section className="card">
        <div className="dim">
          {career.calendar.year} · Week {day.week} · {PHASE_LABEL[day.phase]}
        </div>
        <div className="today">{day.event ? describeEvent(day.event) : 'No match today'}</div>
        <button className="primary" onClick={continueToNextEvent}>
          Continue
        </button>
      </section>
      <h2 className="section">Squad ({squad.length})</h2>
      <SquadList players={squad} />
    </>
  )
}

export function Debug() {
  const career = useGame((s) => s.career)
  return (
    <>
      <h1>Sim debug</h1>
      <p>
        <Link to="/gallery">Identity gallery</Link>
      </p>
      {career && (
        <>
          <p className="dim">
            Seed {career.seed} · {career.calendar.year} day {career.calendar.day}
          </p>
          <div className="button-row">
            <button onClick={() => advanceDays(1)}>+1 day</button>
            <button onClick={() => advanceDays(7)}>+7 days</button>
            <button onClick={() => advanceDays(100)}>+100 days</button>
          </div>
        </>
      )}
      <MatchDebug />
    </>
  )
}

export function Settings() {
  const career = useGame((s) => s.career)
  const [paste, setPaste] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const doImport = (text: string) => {
    const error = importSave(text)
    setMessage(error ?? 'Career imported.')
    if (!error) setPaste('')
  }

  return (
    <>
      <h1>Settings</h1>
      <p className="dim">
        Save format v{SAVE_VERSION}. Your career saves automatically in this browser.
      </p>

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
    </>
  )
}
