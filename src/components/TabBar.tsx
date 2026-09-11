import { NavLink } from 'react-router-dom'

/**
 * Fixed bottom tab bar for the top-level sections after login. Padded for
 * `env(safe-area-inset-bottom)` in App.css (iPhone home-indicator).
 */
export function TabBar() {
  return (
    <nav className="tab-bar" aria-label="Hoofdnavigatie">
      <NavLink to="/spelers" className={({ isActive }) => `tab-bar-item${isActive ? ' actief' : ''}`}>
        Spelers
      </NavLink>
      <NavLink to="/wedstrijden" className={({ isActive }) => `tab-bar-item${isActive ? ' actief' : ''}`}>
        Wedstrijden
      </NavLink>
      <NavLink to="/dashboard" className={({ isActive }) => `tab-bar-item${isActive ? ' actief' : ''}`}>
        Dashboard
      </NavLink>
    </nav>
  )
}
