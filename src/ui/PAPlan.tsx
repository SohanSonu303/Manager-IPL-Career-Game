import { useState } from 'react'
import type { Career } from '@/sim/career'
import { renewalPlan } from '@/sim/contracts'
import { TEAM_IDS } from '@/sim/game'
import { autoRenewContracts } from '@/state/store'
import { bidPrice } from './format'
import { Chip, Sheet } from './kit/kit'

/**
 * "Let PA handle it": her plan for every undecided final-year player (keep or let go, and
 * why), then her report once she has done the talking.
 */
export function RenewalPlanSheet({ career, onClose }: { career: Career; onClose: () => void }) {
  const [plan] = useState(() => renewalPlan(career, TEAM_IDS))
  const [report, setReport] = useState<string[] | null>(null)
  const keep = plan.filter((r) => r.keep)
  return (
    <Sheet title="PA: contract renewals" onClose={onClose}>
      {report ? (
        <>
          <p className="good">All done. Here's how it went:</p>
          <ul className="list pa-report">
            {report.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <button className="primary" style={{ width: '100%' }} onClick={onClose}>
            Thanks
          </button>
        </>
      ) : plan.length === 0 ? (
        <p className="dim">Nothing to do: every contract is settled.</p>
      ) : (
        <>
          <p className="dim">
            I'll renew {keep.length} and let {plan.length - keep.length} go. I open at about 90% of
            each ask and take a fair counter, so you'll usually pay a little less than they ask.
          </p>
          <ul className="list pa-plan">
            {plan.map((r) => (
              <li key={r.p.id}>
                <span className="row-between">
                  <strong>{r.p.name}</strong>
                  <Chip tone={r.keep ? 'good' : 'warn'}>{r.keep ? 'Renew' : 'Let go'}</Chip>
                </span>
                <small className="dim">
                  {r.reason}
                  {r.keep &&
                    ` · asks ${bidPrice(r.ask)} × ${r.years} season${r.years > 1 ? 's' : ''}`}
                </small>
              </li>
            ))}
          </ul>
          <div className="button-row">
            <button onClick={onClose}>Not now</button>
            <button className="primary grow2" onClick={() => setReport(autoRenewContracts())}>
              Go ahead
            </button>
          </div>
        </>
      )}
    </Sheet>
  )
}
