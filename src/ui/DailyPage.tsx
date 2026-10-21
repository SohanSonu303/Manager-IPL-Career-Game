import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { players, teamById } from '@/data'
import {
  challengeAsk,
  dailyChallenge,
  gradeChallenge,
  localDateKey,
  shareText,
  streak,
  type ChallengeInfo,
} from '@/sim/challenge'
import type { Match } from '@/sim/match/engine'
import { readDaily, saveDaily, type DailyRecord } from '@/state/daily'
import { Crest } from './identity/Crest'
import { Screen } from './kit/kit'
import { LiveMatch, type Person } from './match/LiveMatch'

const people: Map<string, Person> = new Map(players.map((p) => [p.id, { ...p, fitness: 100 }]))

const starLine = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n)

/** Share or copy the result text. Returns what happened, for a short notice. */
async function share(text: string): Promise<string> {
  try {
    if (navigator.share) {
      await navigator.share({ text })
      return 'Shared'
    }
    await navigator.clipboard.writeText(text)
    return 'Copied to clipboard'
  } catch {
    return 'Could not share. Long-press the text to copy it.'
  }
}

/** The Daily Challenge: today's scenario, its result and the streak. */
export function DailyPage() {
  const navigate = useNavigate()
  const today = localDateKey()
  const [records, setRecords] = useState(readDaily)
  const [game, setGame] = useState<{ info: ChallengeInfo; match: Match; practice: boolean } | null>(
    null,
  )
  const preview = useMemo(() => dailyChallenge(today).info, [today])
  const done = records[today]
  const run = streak(Object.keys(records), today)

  if (game) {
    const { info, match, practice } = game
    const result = match.state.result ? gradeChallenge(info, match.state) : null
    return (
      <LiveMatch
        match={match}
        me={info.me}
        title={`Daily #${info.number}${practice ? ' · practice' : ''} · ${teamById.get(info.homeId)?.ground}`}
        people={people}
        back={{ label: 'Back', onClick: () => setGame(null) }}
        finish={{ label: 'Done', onClick: () => setGame(null) }}
        brief={
          <p className="daily-brief">
            <strong>{challengeAsk(info)}</strong> with {info.wicketsLeft} wicket
            {info.wicketsLeft === 1 ? '' : 's'} left. You{' '}
            {info.role === 'chase' ? 'are batting' : 'are bowling'}.
          </p>
        }
        after={
          result && (
            <ResultCard
              record={{
                ...result,
                share: shareText(info, match.state, result),
              }}
              practice={practice}
            />
          )
        }
        onChange={() => {
          const s = match.state
          if (!s.result || practice) return
          const r = gradeChallenge(info, s)
          setRecords(saveDaily(info.dateKey, { ...r, share: shareText(info, s, r) }))
        }}
      />
    )
  }

  const opp = preview.me === preview.homeId ? preview.awayId : preview.homeId
  const mine = teamById.get(preview.me)
  // The chasing side on the left, as in the line under the crests.
  const [left, right] = (preview.role === 'chase' ? [preview.me, opp] : [opp, preview.me]).map(
    (id) => teamById.get(id),
  )
  return (
    <Screen
      back={{ label: 'Back', onClick: () => navigate('/') }}
      primary={{
        label: done ? 'Practice again' : 'Play',
        onClick: () => setGame({ ...dailyChallenge(today), practice: !!done }),
      }}
    >
      <h1>Daily Challenge #{preview.number}</h1>
      <p className="dim">
        A new finish every day, the same for everyone. Take over for the last{' '}
        {preview.ballsLeft / 6} overs and win it.
      </p>
      <div className="card daily-card">
        <div className="row-between" style={{ justifyContent: 'space-around', width: '100%' }}>
          {left && <Crest crest={left.crest} colors={left.colors} size={64} />}
          <strong style={{ fontSize: 20 }}>v</strong>
          {right && <Crest crest={right.crest} colors={right.colors} size={64} />}
        </div>
        <strong className="daily-ask">{challengeAsk(preview)}</strong>
        <span className="dim">
          {preview.wicketsLeft} wickets left · you are {mine?.name},{' '}
          {preview.role === 'chase' ? 'batting' : 'bowling'}
        </span>
      </div>
      <div className="daily-stats">
        <span>
          <strong>{run}</strong> day streak
        </span>
        <span>
          <strong>{Object.keys(records).length}</strong> played
        </span>
        <span>
          <strong>{Object.values(records).filter((r) => r.won).length}</strong> won
        </span>
      </div>
      {done && <ResultCard record={done} practice={false} />}
    </Screen>
  )
}

function ResultCard({ record, practice }: { record: DailyRecord; practice: boolean }) {
  const [note, setNote] = useState<string | null>(null)
  return (
    <div className="card daily-result">
      <span className="eyebrow">{practice ? 'PRACTICE RESULT' : "TODAY'S RESULT"}</span>
      <span className="daily-stars" aria-label={`${record.stars} of 3 stars`}>
        {starLine(record.stars)}
      </span>
      <strong>{record.line}</strong>
      <pre className="daily-share">{record.share}</pre>
      <button className="primary" onClick={() => void share(record.share).then(setNote)}>
        Share result
      </button>
      {note && <span className="dim">{note}</span>}
    </div>
  )
}
