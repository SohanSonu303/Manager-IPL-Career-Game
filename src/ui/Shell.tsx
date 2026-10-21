import { NavLink, Outlet } from 'react-router-dom'
import { dismissNotice, useGame } from '@/state/store'

export function Shell() {
  const notice = useGame((s) => s.notice)
  return (
    <div className="shell">
      {notice && (
        <div className="notice" role="alert">
          <span>{notice}</span>
          <button onClick={dismissNotice} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      <main>
        <Outlet />
      </main>
      <nav>
        <NavLink to="/" end>
          Home
        </NavLink>
        <NavLink to="/table">Table</NavLink>
        <NavLink to="/market">Market</NavLink>
        <NavLink to="/settings">Settings</NavLink>
      </nav>
    </div>
  )
}
