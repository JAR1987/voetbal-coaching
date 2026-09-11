import { NavLink } from 'react-router-dom'
import { BarChart3, Goal, Users } from 'lucide-react'

/**
 * Fixed bottom tab bar for the top-level sections after login. Padded for
 * `env(safe-area-inset-bottom)` in App.css (iPhone home-indicator).
 */
export function TabBar() {
  return (
    <nav className="tab-bar" aria-label="Hoofdnavigatie">
      <NavLink to="/spelers" className={({ isActive }) => `tab-bar-item${isActive ? ' actief' : ''}`}>
        <Users aria-hidden="true" size={20} />
        Spelers
      </NavLink>
      <NavLink to="/wedstrijden" className={({ isActive }) => `tab-bar-item${isActive ? ' actief' : ''}`}>
        <Goal aria-hidden="true" size={20} />
        Wedstrijden
      </NavLink>
      <NavLink to="/dashboard" className={({ isActive }) => `tab-bar-item${isActive ? ' actief' : ''}`}>
        <BarChart3 aria-hidden="true" size={20} />
        Dashboard
      </NavLink>
    </nav>
  )
}
