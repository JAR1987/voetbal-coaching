import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { AuthService } from './data/authService'
import type { TeamService } from './data/teamService'
import type { SpelerService } from './data/spelerService'
import type { SeizoenService } from './data/seizoenService'
import type { WedstrijdService } from './data/wedstrijdService'
import type { AanwezigheidService } from './data/aanwezigheidService'
import type { OpstellingService } from './data/opstellingService'
import type { StatistiekenService } from './data/statistiekenService'
import { useSession } from './hooks/useSession'
import { LoginScreen } from './components/LoginScreen'
import { HomeScreen } from './components/HomeScreen'
import './App.css'

export interface AppProps {
  authService: AuthService
  teamService: TeamService
  spelerService: SpelerService
  seizoenService: SeizoenService
  wedstrijdService: WedstrijdService
  aanwezigheidService: AanwezigheidService
  opstellingService: OpstellingService
  statistiekenService: StatistiekenService
  /** Test-only: renders with `MemoryRouter` at these entries instead of `BrowserRouter`. */
  initialEntries?: string[]
}

/**
 * Top-level screen switch: logged-out coaches always land on `/login`;
 * logged-in coaches get `HomeScreen`'s tab-bar layout for everything else
 * (`/spelers`, `/wedstrijden/...`). `initialEntries` swaps in a
 * `MemoryRouter` for tests; production always uses `BrowserRouter`.
 */
export function App({
  authService,
  teamService,
  spelerService,
  seizoenService,
  wedstrijdService,
  aanwezigheidService,
  opstellingService,
  statistiekenService,
  initialEntries,
}: AppProps) {
  const { session, loading } = useSession(authService)

  if (loading) {
    return (
      <main className="screen app-loading">
        <p>Laden…</p>
      </main>
    )
  }

  const routes = (
    <Routes>
      <Route
        path="/login"
        element={session ? <Navigate to="/wedstrijden" replace /> : <LoginScreen authService={authService} />}
      />
      <Route
        path="/*"
        element={
          session ? (
            <HomeScreen
              authService={authService}
              teamService={teamService}
              spelerService={spelerService}
              seizoenService={seizoenService}
              wedstrijdService={wedstrijdService}
              aanwezigheidService={aanwezigheidService}
              opstellingService={opstellingService}
              statistiekenService={statistiekenService}
            />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  )

  return (
    <>
      {initialEntries ? (
        <MemoryRouter initialEntries={initialEntries}>{routes}</MemoryRouter>
      ) : (
        <BrowserRouter>{routes}</BrowserRouter>
      )}
      <p className="build-info">v{__APP_VERSION__}</p>
    </>
  )
}

export default App
