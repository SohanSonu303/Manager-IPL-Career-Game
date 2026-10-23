import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { teamById } from '@/data'
import { capRoom } from '@/sim/market'
import { dismissNotice, useGame } from '@/state/store'
import { crore, newsLine } from './format'
import { Avatar } from './identity/Avatar'
import { ErrorBoundary } from './kit/ErrorBoundary'
import { Icon } from './kit/Icon'

/** Top bar (manager, purse, reputation), news ticker, then the current screen. */
export function Shell() {
  const notice = useGame((s) => s.notice)
  const career = useGame((s) => s.career)
  const navigate = useNavigate()
  const path = useLocation().pathname
  // The match and the auction room are full-screen, like a broadcast.
  const fullScreen = path === '/match' || path === '/auction'
  const team = career ? teamById.get(career.manager.teamId) : undefined
  return (
    <div className="shell">
      {career && team && career.status === 'active' && !fullScreen && (
        <>
          <header className="topbar">
            <button className="icon-btn" onClick={() => navigate('/')} aria-label="Club home">
              <Avatar
                seed={`manager:${career.manager.name}`}
                nationality="IND"
                age={40}
                kit={team.colors}
                size={52}
                title={career.manager.name}
              />
            </button>
            <span className="grow" />
            <span className="pill money" title="Room under the salary cap">
              <Icon name="wallet" size={20} />
              {crore(capRoom(career.players, career.manager.teamId))}
            </span>
            <span className="pill rep" title="Manager reputation">
              <Icon name="star" size={20} />
              {Math.round(career.manager.reputation)}
            </span>
          </header>
          <div className="ticker">{newsLine(career)}</div>
        </>
      )}
      {notice && (
        <div className="notice" role="alert">
          <span>{notice}</span>
          <button onClick={dismissNotice} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      <main>
        <ErrorBoundary key={path}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  )
}
