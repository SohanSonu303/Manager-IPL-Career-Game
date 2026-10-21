import { NavLink, Outlet } from 'react-router-dom'

export function Shell() {
  return (
    <div className="shell">
      <main>
        <Outlet />
      </main>
      <nav>
        <NavLink to="/">Home</NavLink>
        <NavLink to="/debug">Debug</NavLink>
        <NavLink to="/settings">Settings</NavLink>
      </nav>
    </div>
  )
}
